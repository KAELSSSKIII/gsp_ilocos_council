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

const router = Router();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";

// ── GET /api/vouchers ─────────────────────────────────────────────────────────
router.get(
  "/",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const { status, type } = req.query as Record<string, string>;

      let rows;
      if (status && type) {
        rows = await sql`
          SELECT v.*, p.full_name AS created_by_name,
                 a.full_name AS approved_by_name
          FROM public.vouchers v
          LEFT JOIN public.profiles p ON p.id = v.created_by
          LEFT JOIN public.profiles a ON a.id = v.approved_by
          WHERE v.status = ${status} AND v.voucher_type = ${type}
          ORDER BY v.created_at DESC
        `;
      } else if (status) {
        rows = await sql`
          SELECT v.*, p.full_name AS created_by_name,
                 a.full_name AS approved_by_name
          FROM public.vouchers v
          LEFT JOIN public.profiles p ON p.id = v.created_by
          LEFT JOIN public.profiles a ON a.id = v.approved_by
          WHERE v.status = ${status}
          ORDER BY v.created_at DESC
        `;
      } else if (type) {
        rows = await sql`
          SELECT v.*, p.full_name AS created_by_name,
                 a.full_name AS approved_by_name
          FROM public.vouchers v
          LEFT JOIN public.profiles p ON p.id = v.created_by
          LEFT JOIN public.profiles a ON a.id = v.approved_by
          WHERE v.voucher_type = ${type}
          ORDER BY v.created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT v.*, p.full_name AS created_by_name,
                 a.full_name AS approved_by_name
          FROM public.vouchers v
          LEFT JOIN public.profiles p ON p.id = v.created_by
          LEFT JOIN public.profiles a ON a.id = v.approved_by
          ORDER BY v.created_at DESC
          LIMIT 200
        `;
      }

      return res.json({ vouchers: rows });
    } catch (err: unknown) {
      console.error(err);
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

      const voucherNumber = d.voucher_number ?? `VCH-${Date.now()}`;

      const [voucher] = await sql`
        INSERT INTO public.vouchers (
          voucher_number, voucher_type, amount,
          account_id, reference_id, reference_type, description,
          status, created_by
        ) VALUES (
          ${voucherNumber},
          ${d.voucher_type},
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
      console.error(err);
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
            reverseSourceKey: `voucher:reversed:${updatedVoucher.id}:${status}`,
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
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

export default router;
