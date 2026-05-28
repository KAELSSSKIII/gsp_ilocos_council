/**
 * Vouchers routes
 *
 * GET   /api/vouchers            → list vouchers (filterable by ?status= &type=)
 * POST  /api/vouchers            → create voucher
 * PATCH /api/vouchers/:id        → update status (approve / post / cancel)
 */
import { Router } from "express";
import sql, { asSqlClient, type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { postVoucherJournalEntry, reverseJournalEntry } from "../services/accountingPosting";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { voucherCreateSchema, voucherUpdateSchema } from "../validation/schemas";
import { logger } from "../logger";

const router = Router();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";
const normalizeVoucherType = (voucherType: string) => {
  switch (voucherType) {
    case "cash_voucher":
    case "check_voucher":
    case "accounts_payable":
      return "payment";
    case "accounts_receivable":
      return "receipt";
    case "journal_voucher":
      return "journal";
    default:
      return voucherType;
  }
};

// ── GET /api/vouchers ─────────────────────────────────────────────────────────
router.get(
  "/",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const { status, type } = req.query as Record<string, string>;
      const page      = Math.max(0, parseInt((req.query.page as string) ?? "0", 10) || 0);
      const page_size = Math.min(Math.max(1, parseInt((req.query.page_size as string) ?? "25", 10) || 25), 100);
      const offset    = page * page_size;

      const [countRow] = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total
        FROM public.vouchers v
        WHERE (${status ?? null}::text IS NULL OR v.status = ${status ?? null})
          AND (${type ?? null}::text IS NULL OR v.voucher_type = ${type ?? null})
      `;
      const total = parseInt(countRow.total, 10);

      const rows = await sql`
        SELECT v.*, p.full_name AS created_by_name,
               a.full_name AS approved_by_name
        FROM public.vouchers v
        LEFT JOIN public.profiles p ON p.id = v.created_by
        LEFT JOIN public.profiles a ON a.id = v.approved_by
        WHERE (${status ?? null}::text IS NULL OR v.status = ${status ?? null})
          AND (${type ?? null}::text IS NULL OR v.voucher_type = ${type ?? null})
        ORDER BY v.created_at DESC
        LIMIT ${page_size} OFFSET ${offset}
      `;

      return res.json({ data: rows, total, page, page_size });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── POST /api/vouchers ────────────────────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  requireRole("admin", "accountant"),
  validateBody(voucherCreateSchema),
  async (req, res) => {
    try {
      const d      = req.body;
      const userId = req.user!.id;
      const voucherType = normalizeVoucherType(d.voucher_type);

      const voucherNumber = d.voucher_number ?? `VCH-${Date.now()}`;

      const [voucher] = await sql`
        INSERT INTO public.vouchers (
          voucher_number, voucher_type, amount,
          account_id, reference_id, reference_type, description,
          status, created_by
        ) VALUES (
          ${voucherNumber},
          ${voucherType},
          ${d.amount},
          ${d.account_id ?? null},
          ${d.reference_id   ?? null},
          ${d.reference_type ?? null},
          ${d.description},
          'pending',
          ${userId}
        )
        RETURNING *
      `;

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.VOUCHER_CREATED,
        actorId: userId,
        entityType: "voucher",
        entityId: voucher.id,
        summary: `Voucher ${voucher.voucher_number} was created.`,
        metadata: {
          display_name: voucher.voucher_number,
          voucher_type: voucher.voucher_type,
          amount: voucher.amount,
          status: voucher.status,
        },
      });

      return res.status(201).json({ voucher });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── PATCH /api/vouchers/:id ───────────────────────────────────────────────────
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "accountant"),
  validateBody(voucherUpdateSchema),
  async (req, res) => {
    try {
      const { status } = req.body;
      const userId     = req.user!.id;

      const voucher = await sql.begin(async (tx: TransactionClient) => {
        const txSql = asSqlClient(tx);
        const [currentVoucher] = await txSql`
          SELECT id, voucher_number, status
          FROM public.vouchers
          WHERE id = ${req.params.id}
          LIMIT 1
        `;

        if (!currentVoucher) {
          return currentVoucher;
        }

        if (currentVoucher.status === "posted" && status !== "posted" && status !== "cancelled") {
          throw new Error("POSTED_VOUCHER_LOCKED");
        }

        const [updatedVoucher] = await txSql`
          UPDATE public.vouchers SET
            status      = ${status},
            approved_by = CASE WHEN ${status} IN ('approved', 'posted') THEN ${userId} ELSE approved_by END,
            posted_at   = CASE WHEN ${status} = 'posted' THEN NOW() ELSE posted_at END,
            updated_at  = NOW()
          WHERE id = ${req.params.id}
          RETURNING *
        `;

        if (updatedVoucher && currentVoucher.status !== "posted" && status === "posted") {
          await postVoucherJournalEntry(asSqlClient(tx), {
            voucherId: updatedVoucher.id,
            createdBy: userId,
          });
        }

        if (updatedVoucher && currentVoucher.status === "posted" && status !== "posted") {
          await reverseJournalEntry(asSqlClient(tx), {
            sourceKey: `voucher:posted:${updatedVoucher.id}`,
            reverseSourceKey: `voucher:reversed:${updatedVoucher.id}`,
            referenceType: "voucher",
            referenceId: updatedVoucher.id,
            entryDate: new Date().toISOString().slice(0, 10),
            entryNumberPrefix: "JE-REV",
            description: `Reversal for voucher ${updatedVoucher.voucher_number}`,
            createdBy: userId,
          });
        }

        return updatedVoucher;
      });
      if (!voucher) return res.status(404).json({ error: "Voucher not found" });

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.VOUCHER_STATUS_UPDATED,
        actorId: userId,
        entityType: "voucher",
        entityId: voucher.id,
        summary: `Voucher ${voucher.voucher_number} marked as ${voucher.status}.`,
        metadata: {
          display_name: voucher.voucher_number,
          voucher_type: voucher.voucher_type,
          status: voucher.status,
        },
      });

      return res.json({ voucher });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "POSTED_VOUCHER_LOCKED") {
        return res.status(409).json({ error: "Posted vouchers are locked. Cancel the voucher to reverse it." });
      }
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

export default router;
