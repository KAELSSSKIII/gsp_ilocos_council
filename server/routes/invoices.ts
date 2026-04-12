/**
 * Invoices routes
 *
 * GET   /api/invoices              → list invoices (with items joined) — filterable ?status= &from= &to=
 * POST  /api/invoices              → create invoice + line items
 * PATCH /api/invoices/:id          → update status
 */
import { Router } from "express";
import sql, { asSqlClient, type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  postInvoiceIssueJournalEntry,
  postInvoicePaymentJournalEntry,
  reverseJournalEntry,
} from "../services/accountingPosting";
import { invoiceCreateSchema, invoiceUpdateSchema } from "../validation/schemas";

const router = Router();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";

// ── GET /api/invoices ─────────────────────────────────────────────────────────
router.get(
  "/",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const { status, from, to } = req.query as Record<string, string>;

      // Auto-mark overdue: sent invoices past due_date
      await sql`
        UPDATE public.invoices
        SET status = 'overdue', updated_at = NOW()
        WHERE status = 'sent' AND due_date < CURRENT_DATE
      `;

      let rows;

      if (status && from && to) {
        rows = await sql`
          SELECT i.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ii.id, 'description', ii.description,
                  'quantity', ii.quantity, 'unit_price', ii.unit_price, 'amount', ii.amount
                ) ORDER BY ii.created_at
              ) FILTER (WHERE ii.id IS NOT NULL),
              '[]'::json
            ) AS items
          FROM public.invoices i
          LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
          WHERE i.status = ${status}
            AND i.issue_date >= ${from}
            AND i.issue_date <= ${to}
          GROUP BY i.id
          ORDER BY i.created_at DESC
        `;
      } else if (status) {
        rows = await sql`
          SELECT i.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ii.id, 'description', ii.description,
                  'quantity', ii.quantity, 'unit_price', ii.unit_price, 'amount', ii.amount
                ) ORDER BY ii.created_at
              ) FILTER (WHERE ii.id IS NOT NULL),
              '[]'::json
            ) AS items
          FROM public.invoices i
          LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
          WHERE i.status = ${status}
          GROUP BY i.id
          ORDER BY i.created_at DESC
        `;
      } else if (from && to) {
        rows = await sql`
          SELECT i.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ii.id, 'description', ii.description,
                  'quantity', ii.quantity, 'unit_price', ii.unit_price, 'amount', ii.amount
                ) ORDER BY ii.created_at
              ) FILTER (WHERE ii.id IS NOT NULL),
              '[]'::json
            ) AS items
          FROM public.invoices i
          LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
          WHERE i.issue_date >= ${from} AND i.issue_date <= ${to}
          GROUP BY i.id
          ORDER BY i.created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT i.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ii.id, 'description', ii.description,
                  'quantity', ii.quantity, 'unit_price', ii.unit_price, 'amount', ii.amount
                ) ORDER BY ii.created_at
              ) FILTER (WHERE ii.id IS NOT NULL),
              '[]'::json
            ) AS items
          FROM public.invoices i
          LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
          GROUP BY i.id
          ORDER BY i.created_at DESC
          LIMIT 200
        `;
      }

      return res.json({ invoices: rows });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── POST /api/invoices ────────────────────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  requireRole("admin", "accountant"),
  validateBody(invoiceCreateSchema),
  async (req, res) => {
    try {
      const d      = req.body;
      const userId = req.user!.id;

      const items: { description: string; quantity: number; unit_price: number; amount: number }[] =
        d.items ?? [];

      // Compute totals
      const subtotal   = items.reduce((s, it) => s + it.amount, 0);
      const taxAmount  = parseFloat(d.tax_amount ?? 0);
      const totalAmount = subtotal + taxAmount;

      // Generate invoice number
      const [countRow] = await sql`SELECT COUNT(*)::int AS cnt FROM public.invoices`;
      const seq         = (countRow.cnt ?? 0) + 1;
      const invoiceNumber =
        d.invoice_number ??
        `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(seq).padStart(4, "0")}`;

      const invoice = await sql.begin(async (tx: TransactionClient) => {
        const txSql = asSqlClient(tx);
        const [inv] = await txSql`
          INSERT INTO public.invoices (
            invoice_number, customer_name, customer_email, customer_phone,
            issue_date, due_date,
            subtotal, tax_amount, total_amount,
            status, notes, created_by
          ) VALUES (
            ${invoiceNumber}, ${d.customer_name}, ${d.customer_email ?? null}, ${d.customer_phone ?? null},
            ${d.issue_date}, ${d.due_date},
            ${subtotal}, ${taxAmount}, ${totalAmount},
            ${d.status ?? 'draft'}, ${d.notes ?? null}, ${userId}
          )
          RETURNING *
        `;

        if (items.length > 0) {
          for (const item of items) {
            await txSql`
              INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, amount)
              VALUES (${inv.id}, ${item.description}, ${item.quantity}, ${item.unit_price}, ${item.amount})
            `;
          }
        }

        if (inv.status !== "draft" && inv.status !== "cancelled") {
          await postInvoiceIssueJournalEntry(asSqlClient(tx), {
            invoiceId: inv.id,
            createdBy: userId,
          });
        }

        if (inv.status === "paid") {
          await postInvoicePaymentJournalEntry(asSqlClient(tx), {
            invoiceId: inv.id,
            createdBy: userId,
          });
        }

        return inv;
      });

      return res.status(201).json({ invoice });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── PATCH /api/invoices/:id ───────────────────────────────────────────────────
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "accountant"),
  validateBody(invoiceUpdateSchema),
  async (req, res) => {
    try {
      const { status } = req.body;
      const userId = req.user!.id;

      const invoice = await sql.begin(async (tx: TransactionClient) => {
        const txSql = asSqlClient(tx);
        const [currentInvoice] = await txSql`
          SELECT id, invoice_number, status, issue_date
          FROM public.invoices
          WHERE id = ${req.params.id}
          LIMIT 1
        `;

        if (!currentInvoice) {
          return currentInvoice;
        }

        const [updatedInvoice] = await txSql`
          UPDATE public.invoices SET
            status     = ${status},
            updated_at = NOW()
          WHERE id = ${req.params.id}
          RETURNING *
        `;

        if (!updatedInvoice) {
          return updatedInvoice;
        }

        if (
          (status === "sent" || status === "overdue" || status === "paid") &&
          (currentInvoice.status === "draft" || currentInvoice.status === "cancelled")
        ) {
          await postInvoiceIssueJournalEntry(asSqlClient(tx), {
            invoiceId: updatedInvoice.id,
            createdBy: userId,
          });
        }

        if (currentInvoice.status !== "paid" && status === "paid") {
          await postInvoicePaymentJournalEntry(asSqlClient(tx), {
            invoiceId: updatedInvoice.id,
            createdBy: userId,
          });
        }

        if (
          (status === "draft" || status === "cancelled") &&
          (currentInvoice.status === "sent" || currentInvoice.status === "overdue" || currentInvoice.status === "paid")
        ) {
          await reverseJournalEntry(asSqlClient(tx), {
            sourceKey: `invoice:issued:${updatedInvoice.id}`,
            reverseSourceKey: `invoice:issued-reversed:${updatedInvoice.id}:${status}`,
            referenceType: "invoice",
            referenceId: updatedInvoice.id,
            entryDate: currentInvoice.issue_date,
            entryNumberPrefix: "JE-REV",
            description: `Reversal for invoice ${currentInvoice.invoice_number}`,
            createdBy: userId,
          });
        }

        if (currentInvoice.status === "paid" && status !== "paid") {
          await reverseJournalEntry(asSqlClient(tx), {
            sourceKey: `invoice:paid:${updatedInvoice.id}`,
            reverseSourceKey: `invoice:paid-reversed:${updatedInvoice.id}:${status}`,
            referenceType: "invoice",
            referenceId: updatedInvoice.id,
            entryDate: currentInvoice.issue_date,
            entryNumberPrefix: "JE-REV",
            description: `Reversal for paid invoice ${currentInvoice.invoice_number}`,
            createdBy: userId,
          });
        }

        return updatedInvoice;
      });
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      return res.json({ invoice });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

export default router;
