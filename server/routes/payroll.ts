/**
 * Payroll routes
 *
 * GET  /api/payroll                  → list all payroll entries (filterable by ?status= &year= &month=)
 * POST /api/payroll                  → create payroll entry
 * PATCH /api/payroll/:id             → update status (approve / mark paid)
 * GET  /api/payroll/summary          → monthly totals for SCRD auto-fill (?year=&month=)
 */
import { Router } from "express";
import sql, { asSqlClient, type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { postPayrollJournalEntry, reverseJournalEntry } from "../services/accountingPosting";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";

const router = Router();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";

// ── GET /api/payroll/summary ──────────────────────────────────────────────────
// Must be registered BEFORE /:id to avoid "summary" being treated as an ID
router.get(
  "/summary",
  requireAuth,
  requireRole("admin", "accountant", "hr"),
  async (req, res) => {
    try {
      const year  = parseInt(req.query.year  as string, 10);
      const month = parseInt(req.query.month as string, 10);
      if (!year || !month) return res.status(400).json({ error: "year and month required" });

      const monthStart = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const monthEnd   = new Date(year, month, 1).toISOString().slice(0, 10);

      const [row] = await sql`
        SELECT
          COALESCE(SUM(basic_salary), 0)::numeric   AS salaries_wages,
          COALESCE(SUM(overtime_pay), 0)::numeric   AS overtime,
          COALESCE(SUM(cola), 0)::numeric            AS cola,
          COALESCE(SUM(sss), 0)::numeric             AS sss,
          COALESCE(SUM(philhealth), 0)::numeric      AS philhealth,
          COALESCE(SUM(pagibig), 0)::numeric         AS pagibig,
          COALESCE(SUM(tax_deducted), 0)::numeric    AS tax_deducted,
          COALESCE(SUM(deductions), 0)::numeric      AS total_deductions,
          COALESCE(SUM(net_salary), 0)::numeric      AS net_salary
        FROM public.payroll
        WHERE status != 'pending'
          AND period_end >= ${monthStart}
          AND period_end <  ${monthEnd}
      `;
      return res.json({ summary: row });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── GET /api/payroll ──────────────────────────────────────────────────────────
router.get(
  "/",
  requireAuth,
  requireRole("admin", "accountant", "hr"),
  async (req, res) => {
    try {
      const { status, year, month } = req.query as Record<string, string>;

      let rows;

      if (year && month) {
        const monthStart = new Date(+year, +month - 1, 1).toISOString().slice(0, 10);
        const monthEnd   = new Date(+year, +month, 1).toISOString().slice(0, 10);
        if (status) {
          rows = await sql`
            SELECT p.*, e.full_name AS employee_name, e.position
            FROM public.payroll p
            JOIN public.employees e ON e.id = p.employee_id
            WHERE p.status = ${status}
              AND p.period_end >= ${monthStart}
              AND p.period_end < ${monthEnd}
            ORDER BY p.created_at DESC
          `;
        } else {
          rows = await sql`
            SELECT p.*, e.full_name AS employee_name, e.position
            FROM public.payroll p
            JOIN public.employees e ON e.id = p.employee_id
            WHERE p.period_end >= ${monthStart}
              AND p.period_end < ${monthEnd}
            ORDER BY p.created_at DESC
          `;
        }
      } else if (status) {
        rows = await sql`
          SELECT p.*, e.full_name AS employee_name, e.position
          FROM public.payroll p
          JOIN public.employees e ON e.id = p.employee_id
          WHERE p.status = ${status}
          ORDER BY p.created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT p.*, e.full_name AS employee_name, e.position
          FROM public.payroll p
          JOIN public.employees e ON e.id = p.employee_id
          ORDER BY p.created_at DESC
          LIMIT 200
        `;
      }

      return res.json({ payroll: rows });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── POST /api/payroll ─────────────────────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  requireRole("admin", "hr"),
  async (req, res) => {
    try {
      const d       = req.body;
      const userId  = req.user!.id;

      if (!d.employee_id || !d.period_start || !d.period_end || d.basic_salary == null) {
        return res.status(400).json({ error: "employee_id, period_start, period_end, basic_salary required" });
      }

      // auto-generate payroll_number if not provided
      const payrollNumber = d.payroll_number ?? `PAY-${Date.now()}`;

      const cola       = parseFloat(d.cola       ?? 0);
      const overtime   = parseFloat(d.overtime_pay ?? 0);
      const sss        = parseFloat(d.sss        ?? 0);
      const philhealth = parseFloat(d.philhealth ?? 0);
      const pagibig    = parseFloat(d.pagibig    ?? 0);
      const tax        = parseFloat(d.tax_deducted ?? 0);
      const basicSalary = parseFloat(d.basic_salary);
      const deductions = sss + philhealth + pagibig + tax;
      const netSalary  = basicSalary + cola + overtime - deductions;

      const [entry] = await sql`
        INSERT INTO public.payroll (
          payroll_number, employee_id, period_start, period_end,
          basic_salary, overtime_pay, cola,
          sss, philhealth, pagibig,
          deductions, tax_deducted, net_salary,
          status, processed_by
        ) VALUES (
          ${payrollNumber}, ${d.employee_id}, ${d.period_start}, ${d.period_end},
          ${basicSalary}, ${overtime}, ${cola},
          ${sss}, ${philhealth}, ${pagibig},
          ${deductions}, ${tax}, ${netSalary},
          'pending', ${userId}
        )
        RETURNING *
      `;

      const [employee] = await sql`
        SELECT full_name
        FROM public.employees
        WHERE id = ${entry.employee_id}
      `;

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.PAYROLL_CREATED,
        actorId: userId,
        entityType: "payroll",
        entityId: entry.id,
        summary: `Payroll entry ${entry.payroll_number} created for ${employee?.full_name ?? "employee"}.`,
        metadata: {
          display_name: entry.payroll_number,
          employee_name: employee?.full_name ?? null,
          period_start: entry.period_start,
          period_end: entry.period_end,
          status: entry.status,
          net_salary: entry.net_salary,
        },
      });

      return res.status(201).json({ entry });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── PATCH /api/payroll/:id ────────────────────────────────────────────────────
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "hr"),
  async (req, res) => {
    try {
      const { status } = req.body;
      const userId = req.user!.id;
      if (!["pending", "approved", "paid"].includes(status)) {
        return res.status(400).json({ error: "status must be pending, approved, or paid" });
      }

      const entry = await sql.begin(async (tx: TransactionClient) => {
        const txSql = asSqlClient(tx);
        const [currentEntry] = await txSql`
          SELECT id, payroll_number, status, period_end, employee_id
          FROM public.payroll
          WHERE id = ${req.params.id}
          LIMIT 1
        `;

        if (!currentEntry) {
          return currentEntry;
        }

        const [updatedEntry] = await txSql`
          UPDATE public.payroll SET
            status       = ${status},
            processed_at = CASE WHEN ${status} = 'paid' THEN NOW() ELSE processed_at END,
            updated_at   = NOW()
          WHERE id = ${req.params.id}
          RETURNING *
        `;

        if (updatedEntry && currentEntry.status !== "paid" && status === "paid") {
          await postPayrollJournalEntry(asSqlClient(tx), {
            payrollId: updatedEntry.id,
            createdBy: userId,
          });
        }

        if (updatedEntry && currentEntry.status === "paid" && status !== "paid") {
          await reverseJournalEntry(asSqlClient(tx), {
            sourceKey: `payroll:paid:${updatedEntry.id}`,
            reverseSourceKey: `payroll:reversed:${updatedEntry.id}:${status}`,
            referenceType: "payroll",
            referenceId: updatedEntry.id,
            entryDate: currentEntry.period_end,
            entryNumberPrefix: "JE-REV",
            description: `Reversal for payroll ${currentEntry.payroll_number}`,
            createdBy: userId,
          });
        }

        return updatedEntry;
      });
      if (!entry) return res.status(404).json({ error: "Payroll entry not found" });

      const [employee] = await sql`
        SELECT full_name
        FROM public.employees
        WHERE id = ${entry.employee_id}
      `;

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.PAYROLL_STATUS_UPDATED,
        actorId: userId,
        entityType: "payroll",
        entityId: entry.id,
        summary: `Payroll entry ${entry.payroll_number} marked as ${entry.status}.`,
        metadata: {
          display_name: entry.payroll_number,
          employee_name: employee?.full_name ?? null,
          status: entry.status,
        },
      });

      return res.json({ entry });
    } catch (err: unknown) {
      console.error(err);
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

export default router;
