/**
 * Sales routes — replaces supabase.from('sales'), sale_items, sale_receipts, rpc calls
 *
 * GET  /api/sales                 → list sales (filtered by role)
 * POST /api/sales                 → create sale + items + receipt + decrement stock
 * GET  /api/sales/:id/receipt     → get receipt by sale id
 * POST /api/sales/:id/void        → void a sale (calls void_sale stored proc)
 * GET  /api/sale-receipts         → list receipts (for Receipts page)
 */
import { Router } from "express";
import { ROUTE_ROLE_ACCESS } from "../config/permissions";
import sql, { asSqlClient, type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { postSaleJournalEntry, reverseJournalEntry } from "../services/accountingPosting";
import { logger } from "../logger";
import {
  idParamSchema,
  receiptVoidMetadataSchema,
  saleCreateSchema,
  saleIdParamSchema,
  salesQuerySchema,
  salesReceiptsQuerySchema,
  saleVoidSchema,
} from "../validation/schemas";

const router = Router();

const isMissingRelationError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "42P01";

type SaleListRow = {
  id: string;
  created_at: string;
  cashier_id: string | null;
  cashier_name?: string | null;
};

type SaleItemRow = {
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
  product_name?: string | null;
  category_name?: string | null;
};

type ReceiptSettingsRow = {
  id: string;
  start_number: number;
  end_number: number;
  current_number: number | null;
  date_issued: string | null;
};

type RentalProductRow = {
  product_id: string;
};

type RentalBookingInput = {
  rental_space_id: string;
  booking_date: string;
  notes?: string | null;
  total_amount?: number | null;
  initial_payment?: number | null;
  payment_status?: string | null;
};

type RentalConflictRow = {
  rental_space_id: string;
  booking_date: string;
  space_name: string;
};

type RentalItemRow = {
  product_id: string;
  quantity: number;
};

type PostgresError = Error & {
  code?: string;
};

type SaleCreateBody = {
  sale: {
    sale_number: string;
    cashier_id: string;
    branch?: string | null;
    subtotal: number;
    tax_amount?: number | null;
    discount_amount?: number | null;
    total_amount: number;
    payment_method: string;
    payment_reference?: string | null;
    notes?: string | null;
    member_id?: string | null;
    receipt_number?: number | null;
  };
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    unit_cost: number;
    subtotal: number;
  }>;
  receipt_payload?: Record<string, unknown> | null;
  rental_bookings?: RentalBookingInput[];
};

// GET /api/sales
router.get("/", requireAuth, validateQuery(salesQuerySchema), async (req, res) => {
  try {
    const { role, id: userId } = req.user!;
    const { from, to, cashier_id } = req.query;

    const fromVal = (from as string) ?? null;
    const toVal   = (to   as string) ?? null;
    const cidVal  = (cashier_id as string) ?? null;

    let sales: SaleListRow[];
    if (role === "admin" || role === "accountant") {
      sales = await sql`
        SELECT s.*, p.full_name AS cashier_name
        FROM public.sales s
        LEFT JOIN public.profiles p ON p.id = s.cashier_id
        WHERE
          (${fromVal}::timestamptz IS NULL OR s.created_at >= ${fromVal}::timestamptz)
          AND (${toVal}::timestamptz IS NULL OR s.created_at <= ${toVal}::timestamptz)
          AND (${cidVal}::uuid IS NULL OR s.cashier_id = ${cidVal}::uuid)
        ORDER BY s.created_at DESC
      `;
    } else {
      // cashiers see only their own sales
      sales = await sql`
        SELECT s.*, p.full_name AS cashier_name
        FROM public.sales s
        LEFT JOIN public.profiles p ON p.id = s.cashier_id
        WHERE s.cashier_id = ${userId}
          AND (${fromVal}::timestamptz IS NULL OR s.created_at >= ${fromVal}::timestamptz)
          AND (${toVal}::timestamptz IS NULL OR s.created_at <= ${toVal}::timestamptz)
        ORDER BY s.created_at DESC
      `;
    }
    // Optionally include sale_items for reports (DCCR, Income Statement)
    if (req.query.include_items === "true") {
      const saleIds = sales.map((sale) => sale.id);
      const items = saleIds.length ? await sql<SaleItemRow[]>`
        SELECT si.sale_id, si.product_id, si.quantity, si.unit_price,
               si.unit_cost, si.subtotal, p.name AS product_name,
               pc.name AS category_name
        FROM public.sale_items si
        JOIN public.products p ON p.id = si.product_id
        LEFT JOIN public.product_categories pc ON pc.id = p.category_id
        WHERE si.sale_id = ANY(${saleIds}::uuid[])
      ` : [];
      const itemsBySale: Record<string, SaleItemRow[]> = {};
      for (const id of saleIds) itemsBySale[id] = [];
      for (const item of items) itemsBySale[item.sale_id]?.push(item);
      return res.json({ sales: sales.map((sale) => ({ ...sale, items: itemsBySale[sale.id] ?? [] })) });
    }

    return res.json({ sales });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/sales — create a complete sale transaction
// Body: { sale, items, receipt_payload, rental_bookings? }
// rental_bookings are created inside the SAME transaction for atomicity.
// If any booking conflicts (unique constraint), the entire sale is rolled back.
router.post(
  "/",
  requireAuth,
  requireRole("admin", "cashier"),
  validateBody(saleCreateSchema),
  async (req, res) => {
    try {
      const { sale, items, receipt_payload, rental_bookings } = req.body as SaleCreateBody;

      // Validate cashier_id matches authenticated user
      if (sale.cashier_id !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Cannot create sale for another user" });
      }

      const result = await sql.begin(async (tx: TransactionClient) => {
        const txSql = tx as unknown as typeof sql;
        let assignedReceiptNumber = sale.receipt_number ?? null;
        let assignedReceiptIssuedAt: string | null = null;
        let receiptSeriesWarning: string | null = null;

        if (assignedReceiptNumber == null) {
          // Try new receipt_series system first
          try {
            const [seriesRow] = await txSql`
              UPDATE public.receipt_series
              SET current_number = current_number + 1,
                  updated_at     = NOW()
              WHERE is_active = true
                AND current_number < to_number
              RETURNING current_number, to_number, series_label
            `;
            if (seriesRow) {
              assignedReceiptNumber = seriesRow.current_number as number;
              const remaining = (seriesRow.to_number as number) - (seriesRow.current_number as number);
              if (remaining <= 100) {
                receiptSeriesWarning = `Series "${seriesRow.series_label}" is ${remaining} receipt${remaining !== 1 ? "s" : ""} away from its end.`;
              }
            }
          } catch {
            // receipt_series table may not exist yet — fall through to legacy system
          }
        }

        if (assignedReceiptNumber == null) {
          const [receiptSettings] = await txSql<ReceiptSettingsRow[]>`
            SELECT id, start_number, end_number, current_number, date_issued
            FROM public.receipt_settings
            ORDER BY updated_at DESC
            LIMIT 1
            FOR UPDATE
          `;

          if (receiptSettings) {
            const nextAssignedReceiptNumber = receiptSettings.current_number ?? receiptSettings.start_number;
            assignedReceiptNumber = nextAssignedReceiptNumber;
            if (nextAssignedReceiptNumber > receiptSettings.end_number) {
              throw new Error("RECEIPT_SERIES_EXHAUSTED");
            }

            assignedReceiptIssuedAt = receiptSettings.date_issued;
            const nextReceiptNumber = Math.min(nextAssignedReceiptNumber + 1, receiptSettings.end_number + 1);

            await txSql`
              UPDATE public.receipt_settings
              SET current_number = ${nextReceiptNumber},
                  updated_at = NOW()
              WHERE id = ${receiptSettings.id}
            `;
          }
        }

        const normalizedReceiptPayload = receipt_payload
          ? {
              ...receipt_payload,
              receiptNumber: assignedReceiptNumber ?? receipt_payload.receiptNumber ?? null,
              receiptIssuedAt: assignedReceiptIssuedAt ?? receipt_payload.receiptIssuedAt ?? null,
            }
          : null;

        // 1. Insert sale
        const [saleRecord] = await txSql`
          INSERT INTO public.sales
            (sale_number, cashier_id, branch, subtotal, tax_amount, discount_amount,
             total_amount, payment_method, payment_reference, notes, member_id,
             status, receipt_number)
          VALUES
            (${sale.sale_number}, ${sale.cashier_id}, ${sale.branch ?? null},
             ${sale.subtotal}, ${sale.tax_amount ?? 0}, ${sale.discount_amount ?? 0},
             ${sale.total_amount}, ${sale.payment_method}, ${sale.payment_reference ?? null},
             ${sale.notes ?? null}, ${sale.member_id ?? null}, 'completed',
             ${assignedReceiptNumber})
          RETURNING *
        `;

        // 2. Insert sale items
        if (items && items.length > 0) {
          const itemRows = items.map((item) => ({
            sale_id: saleRecord.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            unit_cost: item.unit_cost,
            subtotal: item.subtotal,
          }));

          await txSql`INSERT INTO public.sale_items ${txSql(itemRows)}`;

          // 3. Decrement stock for non-rental products only.
          // Rental products are identified by their product_id appearing in rental_spaces.
          // Rentals are bookings — they don't consume physical inventory.
          const productIds = items.map((item) => item.product_id);
          const rentalProductRows = await txSql<RentalProductRow[]>`
            SELECT product_id FROM public.rental_spaces
            WHERE product_id = ANY(${productIds}::uuid[]) AND product_id IS NOT NULL
          `;
          const rentalProductIdSet = new Set(rentalProductRows.map((row: RentalProductRow) => row.product_id));

          for (const item of items) {
            if (rentalProductIdSet.has(item.product_id)) continue;
            await txSql`
              UPDATE public.products
              SET stock_quantity = stock_quantity - ${item.quantity},
                  updated_at = NOW()
              WHERE id = ${item.product_id}::uuid
            `;
          }
        }

        // 4. Insert rental bookings inside the same transaction (atomicity + race safety).
        // If a booking already exists for the same space+date (race condition / double-booking),
        // the unique constraint fires → the entire transaction rolls back → sale is NOT created.
        if (rental_bookings && rental_bookings.length > 0) {
          // Explicit conflict check first to return a helpful error message
          const spaceIds = rental_bookings.map((booking: RentalBookingInput) => booking.rental_space_id);
          const dates = rental_bookings.map((booking: RentalBookingInput) => booking.booking_date);

          const conflicts = await txSql<RentalConflictRow[]>`
            SELECT rb.rental_space_id, rb.booking_date, rs.name AS space_name
            FROM public.rental_bookings rb
            JOIN public.rental_spaces rs ON rs.id = rb.rental_space_id
            WHERE rb.status = 'confirmed'
              AND rb.rental_space_id = ANY(${spaceIds}::uuid[])
              AND rb.booking_date = ANY(${dates}::date[])
          `;

          if (conflicts.length > 0) {
            const conflict = conflicts[0];
            throw new Error(`RENTAL_CONFLICT:${conflict.space_name}:${conflict.booking_date}`);
          }

          const bookingRows = rental_bookings.map((booking: RentalBookingInput) => ({
            rental_space_id: booking.rental_space_id,
            booking_date: booking.booking_date,
            sale_id: saleRecord.id,
            notes: booking.notes ?? null,
            created_by: req.user!.id,
            total_amount: booking.total_amount ?? null,
            initial_payment: booking.initial_payment ?? null,
            payment_status: booking.payment_status ?? "paid",
          }));

          try {
            await txSql`INSERT INTO public.rental_bookings ${txSql(bookingRows)}`;
          } catch (insertErr: unknown) {
            const pgError = insertErr as PostgresError;
            // 23505 = unique_violation — race condition where two requests passed
            // the explicit check above simultaneously
            if (pgError.code === "23505") {
              throw new Error("RENTAL_CONFLICT:the selected space:the selected date");
            }
            throw insertErr;
          }
        }

        // 5. Insert sale receipt snapshot
        // IMPORTANT: use a savepoint so that a receipt INSERT failure does NOT
        // abort the outer transaction. Without a savepoint, PostgreSQL puts the
        // transaction into an "aborted" state and every subsequent query fails
        // with "current transaction is aborted, commands ignored until end of
        // transaction block", which causes the generic 500 response.
        if (normalizedReceiptPayload) {
          try {
            await tx.savepoint(async (sp) => {
              const spSql = sp as unknown as typeof sql;
              await spSql`
                INSERT INTO public.sale_receipts
                  (sale_id, sale_number, cashier_id, member_id, payload)
                VALUES
                  (${saleRecord.id}, ${saleRecord.sale_number}, ${saleRecord.cashier_id},
                  ${sale.member_id ?? null}, ${spSql.json(normalizedReceiptPayload as Parameters<typeof spSql.json>[0])})
              `;
            });
          } catch (receiptError) {
            logger.warn({ err: receiptError }, "Skipping sale receipt snapshot");
          }
        }

        await postSaleJournalEntry(asSqlClient(tx), {
          saleId: saleRecord.id,
          createdBy: req.user!.id,
        });

        return {
          ...saleRecord,
          receipt_number: assignedReceiptNumber,
          receipt_issued_at: assignedReceiptIssuedAt,
          series_warning: receiptSeriesWarning,
        };
      });

      return res.status(201).json({
        sale: result,
        ...(result.series_warning ? { warning: result.series_warning } : {}),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RECEIPT_SERIES_EXHAUSTED") {
        return res.status(409).json({ error: "Receipt series exhausted" });
      }
      if (message.startsWith("RENTAL_CONFLICT:")) {
        const [, spaceName, date] = message.split(":");
        return res.status(409).json({
          error: "RENTAL_CONFLICT",
          spaceName,
          date,
          message: `${spaceName} is already booked for ${date}. Choose a different date.`,
        });
      }
      if (message.includes("Missing chart of accounts code")) {
        return res.status(409).json({
          error: `Accounting setup incomplete: ${message}. Go to Accounting → Account Mappings and verify all mappings are configured.`,
        });
      }
      if (message.includes("Unbalanced journal entry")) {
        return res.status(500).json({
          error: "Journal entry calculation error — the sale could not be posted. Contact your administrator.",
        });
      }
      const pgCode = (err as { code?: string }).code;
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, pgCode: pgCode ?? "n/a" }, "[POST /api/sales] Unhandled error");
      const isDev = process.env.NODE_ENV !== "production";
      return res.status(500).json({
        error: "Internal server error",
        ...(isDev && { detail: errMsg, pg_code: pgCode }),
      });
    }
  }
);

// POST /api/sales/:id/void — calls void_sale stored procedure, then corrects rental stock
router.post("/:id/void", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.saleVoid), validateParams(idParamSchema), validateBody(saleVoidSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const voidedBy = req.user!.id;

    // Identify rental product IDs in this sale BEFORE voiding.
    // void_sale() restores stock for all items (including rentals), which is incorrect
    // since rental products never had their stock decremented in the first place.
    // We undo that incorrect restoration after the proc runs.
    const rentalItems = await sql<RentalItemRow[]>`
      SELECT si.product_id, si.quantity
      FROM public.sale_items si
      JOIN public.rental_spaces rs ON rs.product_id = si.product_id
      WHERE si.sale_id = ${id}::uuid
    `;

    await sql`SELECT public.void_sale(${id}::uuid, ${reason ?? null}, ${voidedBy}::uuid)`;

    // Undo the stock restoration for rental products (they are bookings, not inventory)
    if (rentalItems.length > 0) {
      await sql`
        UPDATE public.products p
        SET stock_quantity = p.stock_quantity - v.qty::int,
            updated_at     = NOW()
        FROM UNNEST(
          ${rentalItems.map((i) => i.product_id)}::uuid[],
          ${rentalItems.map((i) => i.quantity)}::int[]
        ) AS v(id, qty)
        WHERE p.id = v.id
      `;
    }

    let journalWarning: string | undefined;
    try {
      const entryDate = new Date().toISOString().slice(0, 10);
      const baseParams = {
        referenceType: "sale",
        referenceId: id,
        entryDate,
        entryNumberPrefix: "JE-REV",
        description: `Reversal for voided sale ${id}`,
        createdBy: voidedBy,
      };

      // Reverse the initial sale/deposit entry
      const reversedCompleted = await reverseJournalEntry(sql, {
        ...baseParams,
        sourceKey: `sale:completed:${id}`,
        reverseSourceKey: `sale:void:completed:${id}`,
      });

      // Also reverse the balance payment entry if it exists (rentals with partial deposits)
      const reversedBalance = await reverseJournalEntry(sql, {
        ...baseParams,
        sourceKey: `sale:balance:${id}`,
        reverseSourceKey: `sale:void:balance:${id}`,
      });

      if (!reversedCompleted && !reversedBalance) {
        journalWarning = "Sale voided but the reversal journal entry could not be created automatically. Please post a manual reversal entry in Accounting → Manual Journal.";
      }
    } catch (reversalError) {
      logger.error({ err: reversalError, saleId: id }, "Reversal journal entry failed for voided sale");
      journalWarning = "Sale voided but the reversal journal entry could not be created automatically. Please post a manual reversal entry in Accounting → Manual Journal.";
    }

    // Audit log — fire-and-forget, do not fail the void if this errors
    appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.SALE_VOIDED,
      actorId: voidedBy ?? null,
      entityType: "sale",
      entityId: id,
      summary: `Sale voided${reason ? `: ${reason}` : ""}`,
      metadata: { saleId: id, reason: reason ?? null },
    }).catch((e) => logger.error({ err: e }, "Audit log failed for void"));

    if (journalWarning) {
      return res.status(207).json({ success: true, accountingError: true, warning: journalWarning });
    }
    return res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("SALE_NOT_FOUND")) return res.status(404).json({ error: "Sale not found" });
    if (message.includes("SALE_ALREADY_VOIDED")) return res.status(409).json({ error: "Sale already voided" });
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/sale-receipts — for Receipts page history
// Supports: ?from=ISO&to=ISO&cashier_id=UUID  (admin/accountant only for cashier_id)
router.get("/receipts", requireAuth, validateQuery(salesReceiptsQuerySchema), async (req, res) => {
  try {
    const { role, id: userId } = req.user!;
    const { sale_ids, from, to, cashier_id, search } = req.query;

    const fromVal = (from as string) ?? null;
    const toVal   = (to   as string) ?? null;
    const cidVal  = (cashier_id as string) ?? null;
    const searchVal = (search as string) ?? null;
    const page = typeof req.query.page === "number" ? req.query.page : 1;
    const pageSize = typeof req.query.page_size === "number" ? req.query.page_size : 50;
    const offset = (page - 1) * pageSize;
    const searchLike = searchVal ? `%${searchVal}%` : null;

    let receipts;
    let total = 0;
    if (sale_ids) {
      // fetch by specific sale_ids (used by useRentalAvailability to get customer names)
      const ids = (sale_ids as string).split(",");
      receipts = await sql`
        SELECT sale_id, payload FROM public.sale_receipts
        WHERE sale_id = ANY(${ids}::uuid[])
      `;
      total = (receipts as unknown[]).length;
    } else if (role === "admin" || role === "accountant") {
      receipts = await sql`
        SELECT * FROM public.sale_receipts
        WHERE (${fromVal}::timestamptz IS NULL OR created_at >= ${fromVal}::timestamptz)
          AND (${toVal}::timestamptz   IS NULL OR created_at <= ${toVal}::timestamptz)
          AND (${cidVal}::uuid         IS NULL OR cashier_id = ${cidVal}::uuid)
          AND (
            ${searchLike}::text IS NULL
            OR sale_number ILIKE ${searchLike}
            OR sale_id::text = ${searchVal}
            OR payload->>'receiptNumber' = ${searchVal}
          )
        ORDER BY created_at DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `;
      [{ count: total }] = await sql`
        SELECT COUNT(*)::int AS count
        FROM public.sale_receipts
        WHERE (${fromVal}::timestamptz IS NULL OR created_at >= ${fromVal}::timestamptz)
          AND (${toVal}::timestamptz   IS NULL OR created_at <= ${toVal}::timestamptz)
          AND (${cidVal}::uuid         IS NULL OR cashier_id = ${cidVal}::uuid)
          AND (
            ${searchLike}::text IS NULL
            OR sale_number ILIKE ${searchLike}
            OR sale_id::text = ${searchVal}
            OR payload->>'receiptNumber' = ${searchVal}
          )
      `;
    } else {
      receipts = await sql`
        SELECT * FROM public.sale_receipts
        WHERE cashier_id = ${userId}
          AND (${fromVal}::timestamptz IS NULL OR created_at >= ${fromVal}::timestamptz)
          AND (${toVal}::timestamptz   IS NULL OR created_at <= ${toVal}::timestamptz)
          AND (
            ${searchLike}::text IS NULL
            OR sale_number ILIKE ${searchLike}
            OR sale_id::text = ${searchVal}
            OR payload->>'receiptNumber' = ${searchVal}
          )
        ORDER BY created_at DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `;
      [{ count: total }] = await sql`
        SELECT COUNT(*)::int AS count
        FROM public.sale_receipts
        WHERE cashier_id = ${userId}
          AND (${fromVal}::timestamptz IS NULL OR created_at >= ${fromVal}::timestamptz)
          AND (${toVal}::timestamptz   IS NULL OR created_at <= ${toVal}::timestamptz)
          AND (
            ${searchLike}::text IS NULL
            OR sale_number ILIKE ${searchLike}
            OR sale_id::text = ${searchVal}
            OR payload->>'receiptNumber' = ${searchVal}
          )
      `;
    }

    return res.json({ receipts, page, pageSize, total });
  } catch (err) {
    if (isMissingRelationError(err)) {
      const page = typeof req.query.page === "number" ? req.query.page : 1;
      const pageSize = typeof req.query.page_size === "number" ? req.query.page_size : 50;
      return res.json({ receipts: [], page, pageSize, total: 0 });
    }
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/sale-receipts/:saleId — update void fields on receipt
router.patch("/receipts/:saleId", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.receiptVoidMetadata), validateParams(saleIdParamSchema), validateBody(receiptVoidMetadataSchema), async (req, res) => {
  try {
    const { saleId } = req.params;
    const { voided_at, voided_by, void_reason } = req.body;

    const [receipt] = await sql`
      UPDATE public.sale_receipts
      SET voided_at = ${voided_at ?? null},
          voided_by = ${voided_by ?? null},
          void_reason = ${void_reason ?? null}
      WHERE sale_id = ${saleId}
      RETURNING *
    `;
    return res.json({ receipt });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
