/**
 * Rental routes — replaces useRentalAvailability Supabase calls
 *
 * GET    /api/rental-spaces             → active spaces (cashier/admin/accountant)
 * GET    /api/rental-bookings           → bookings from a date (cashier/admin/accountant)
 * POST   /api/rental-bookings           → create booking (cashier/admin)
 * PATCH  /api/rental-bookings/:id       → update booking status (cashier/admin)
 */
import { Router } from "express";
import sql, { asSqlClient, type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { postRentalBalancePaymentJournalEntry } from "../services/accountingPosting";

const router = Router();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";
type RentalConflictRow = {
  rental_space_id: string;
  booking_date: string;
  space_name: string;
};

const isMissingRelationError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "42P01";

// GET /api/rental-spaces
router.get("/spaces", requireAuth, requireRole("admin", "cashier", "accountant"), async (_req, res) => {
  try {
    const spaces = await sql`
      SELECT id, name, slug, rental_type, description, base_rate, rate_unit,
             capacity, image_url, product_id, product_category_id,
             facilities, display_order, is_active, created_at, updated_at
      FROM public.rental_spaces
      WHERE is_active = true
      ORDER BY display_order, name
    `;
    return res.json({ spaces });
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json({ spaces: [] });
    }
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/rental-bookings?from=YYYY-MM-DD
router.get("/bookings", requireAuth, requireRole("admin", "cashier", "accountant"), async (req, res) => {
  try {
    const fromParam = req.query.from as string | undefined;
    const minDate = fromParam
      ? new Date(fromParam)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const bookings = await sql`
      SELECT id, rental_space_id, booking_date, status, sale_id,
             notes, created_at, updated_at,
             total_amount, initial_payment, payment_status, balance_sale_id
      FROM public.rental_bookings
      WHERE booking_date >= ${minDate}
      ORDER BY booking_date
    `;
    return res.json({ bookings });
  } catch (err) {
    if (isMissingRelationError(err)) {
      return res.json({ bookings: [] });
    }
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/rental/check — pre-flight availability check (called before completing a sale)
// Body: [{ rental_space_id, booking_date }]
// Returns: { available: true } or { available: false, conflicts: [{ space_name, booking_date }] }
router.post("/check", requireAuth, requireRole("admin", "cashier"), async (req, res) => {
  try {
    const requests = req.body as { rental_space_id: string; booking_date: string }[];
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.json({ available: true, conflicts: [] });
    }

    const spaceIds = requests.map((r) => r.rental_space_id);
    const dates = requests.map((r) => r.booking_date);

    const conflicts = await sql<RentalConflictRow[]>`
      SELECT rb.rental_space_id, rb.booking_date, rs.name AS space_name
      FROM public.rental_bookings rb
      JOIN public.rental_spaces rs ON rs.id = rb.rental_space_id
      WHERE rb.status = 'confirmed'
        AND rb.rental_space_id = ANY(${spaceIds}::uuid[])
        AND rb.booking_date = ANY(${dates}::date[])
    `;

    // Filter to only the space+date pairs actually requested (not cross-matches)
    const requestedPairs = new Set(requests.map((r) => `${r.rental_space_id}|${r.booking_date}`));
    const matched = conflicts.filter((c) =>
      requestedPairs.has(`${c.rental_space_id}|${c.booking_date}`)
    );

    if (matched.length > 0) {
      return res.status(409).json({
        available: false,
        conflicts: matched.map((c) => ({ space_name: c.space_name, booking_date: c.booking_date })),
      });
    }

    return res.json({ available: true, conflicts: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/rental-bookings — create one or many bookings
router.post("/bookings", requireAuth, requireRole("admin", "cashier"), async (req, res) => {
  try {
    const { bookings } = req.body; // [{ rental_space_id, booking_date, sale_id, notes }]

    const rows = (bookings as {
      rental_space_id: string;
      booking_date: string;
      sale_id?: string;
      notes?: string;
      total_amount?: number | null;
      initial_payment?: number | null;
      payment_status?: string | null;
    }[]).map((b) => ({
      rental_space_id: b.rental_space_id,
      booking_date: b.booking_date,
      sale_id: b.sale_id ?? null,
      notes: b.notes ?? null,
      created_by: req.user!.id,
      total_amount: b.total_amount ?? null,
      initial_payment: b.initial_payment ?? null,
      payment_status: b.payment_status ?? "paid",
    }));

    const inserted = await sql`INSERT INTO public.rental_bookings ${sql(rows)} RETURNING *`;
    return res.status(201).json({ bookings: inserted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/rental/bookings/:id/pay-balance — atomically record a balance payment
// Creates a sale record + updates the booking in one transaction.
// Body: { amount, payment_method, cashier_id, branch?, space_name, booking_date }
router.post("/bookings/:id/pay-balance", requireAuth, requireRole("admin", "cashier"), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_method, cashier_id, branch, space_name, booking_date } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than zero" });
    }
    if (cashier_id !== req.user!.id && req.user!.role !== "admin") {
      return res.status(403).json({ error: "Cannot record payment for another user" });
    }

    const result = await sql.begin(async (tx: TransactionClient) => {
      const txSql = tx as unknown as typeof sql;
      // 1. Fetch current booking to compute new totals
      const [currentBooking] = await txSql`
        SELECT id, total_amount, initial_payment, payment_status
        FROM public.rental_bookings
        WHERE id = ${id}
      `;
      if (!currentBooking) throw new Error("BOOKING_NOT_FOUND");

      const existingPaid = Number(currentBooking.initial_payment ?? 0);
      const bookingTotal = Number(currentBooking.total_amount ?? 0);
      const newPaid = existingPaid + Number(amount);
      const newStatus = bookingTotal > 0 && newPaid >= bookingTotal ? "paid" : "partial";

      // 2. Create a balance-payment sale record for the accounting trail
      const saleNumber = `BAL-${Date.now()}`;
      const [saleRecord] = await txSql`
        INSERT INTO public.sales
          (sale_number, cashier_id, branch, subtotal, tax_amount, discount_amount,
           total_amount, payment_method, payment_reference, notes, member_id, status)
        VALUES
          (${saleNumber}, ${cashier_id}, ${branch ?? null},
           ${amount}, 0, 0,
           ${amount}, ${payment_method},
           ${`Balance for booking ${id}`},
           ${`Balance payment — ${space_name} on ${booking_date}`},
           null, 'completed')
        RETURNING *
      `;

      // 3. Update the booking payment fields
      const [updatedBooking] = await txSql`
        UPDATE public.rental_bookings
        SET
          initial_payment = ${newPaid},
          payment_status  = ${newStatus},
          balance_sale_id = ${saleRecord.id}::uuid,
          updated_at      = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      await postRentalBalancePaymentJournalEntry(asSqlClient(tx), {
        saleId: saleRecord.id,
        createdBy: req.user!.id,
      });

      return { sale: saleRecord, booking: updatedBooking };
    });

    return res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "BOOKING_NOT_FOUND") {
      return res.status(404).json({ error: "Booking not found" });
    }
    console.error(err);
    return res.status(500).json({ error: getErrorMessage(err) });
  }
});

// PATCH /api/rental-bookings/:id — update status and/or payment fields
router.patch("/bookings/:id", requireAuth, requireRole("admin", "cashier"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, total_amount, initial_payment, payment_status, balance_sale_id } = req.body;

    const [booking] = await sql`
      UPDATE public.rental_bookings
      SET
        status          = COALESCE(${status ?? null}, status),
        total_amount    = COALESCE(${total_amount ?? null}::numeric, total_amount),
        initial_payment = COALESCE(${initial_payment ?? null}::numeric, initial_payment),
        payment_status  = COALESCE(${payment_status ?? null}, payment_status),
        balance_sale_id = COALESCE(${balance_sale_id ?? null}::uuid, balance_sale_id),
        updated_at      = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    return res.json({ booking });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/rental-bookings/by-sale/:saleId — cancel all bookings for a sale
router.patch("/bookings/by-sale/:saleId", requireAuth, requireRole("admin", "cashier"), async (req, res) => {
  try {
    const { saleId } = req.params;
    await sql`
      UPDATE public.rental_bookings
      SET status = 'cancelled', updated_at = NOW()
      WHERE sale_id = ${saleId}
    `;
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
