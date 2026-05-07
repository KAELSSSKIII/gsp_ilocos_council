/**
 * Employees routes
 *
 * GET    /api/employees             → list all employees
 * POST   /api/employees             → create employee
 * PATCH  /api/employees/:id         → update employee (fields or is_active)
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { employeeCreateSchema, employeeUpdateSchema } from "../validation/schemas";
import { logger } from "../logger";

const router = Router();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";

// ── GET /api/employees ────────────────────────────────────────────────────────
router.get(
  "/",
  requireAuth,
  requireRole("admin", "hr", "accountant"),
  async (_req, res) => {
    try {
      const employees = await sql`
        SELECT * FROM public.employees
        ORDER BY is_active DESC, full_name
      `;
      return res.json({ employees });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── POST /api/employees ───────────────────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  requireRole("admin", "hr"),
  validateBody(employeeCreateSchema),
  async (req, res) => {
    try {
      const d = req.body;

      const [employee] = await sql`
        INSERT INTO public.employees (
          employee_number, full_name, position, department, branch,
          email, phone, address, hire_date, salary
        ) VALUES (
          ${d.employee_number}, ${d.full_name}, ${d.position},
          ${d.department ?? null}, ${d.branch ?? null},
          ${d.email ?? null}, ${d.phone ?? null}, ${d.address ?? null},
          ${d.hire_date}, ${d.salary}
        )
        RETURNING *
      `;

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.EMPLOYEE_CREATED,
        actorId: req.user!.id,
        entityType: "employee",
        entityId: employee.id,
        summary: `Employee record created for ${employee.full_name}.`,
        metadata: {
          display_name: employee.full_name,
          employee_number: employee.employee_number,
          position: employee.position,
          department: employee.department,
        },
      });

      return res.status(201).json({ employee });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── PATCH /api/employees/:id ──────────────────────────────────────────────────
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "hr"),
  validateBody(employeeUpdateSchema),
  async (req, res) => {
    try {
      const d = req.body;
      const [existing] = await sql`
        SELECT id, employee_number, full_name, position, department, branch, email, phone, address, salary, is_active
        FROM public.employees
        WHERE id = ${req.params.id}
      `;

      if (!existing) return res.status(404).json({ error: "Employee not found" });

      const [employee] = await sql`
        UPDATE public.employees SET
          full_name    = COALESCE(${d.full_name    ?? null}, full_name),
          position     = COALESCE(${d.position     ?? null}, position),
          department   = COALESCE(${d.department   ?? null}, department),
          branch       = COALESCE(${d.branch       ?? null}, branch),
          email        = COALESCE(${d.email        ?? null}, email),
          phone        = COALESCE(${d.phone        ?? null}, phone),
          address      = COALESCE(${d.address      ?? null}, address),
          salary       = COALESCE(${d.salary       ?? null}, salary),
          is_active    = COALESCE(${d.is_active    ?? null}, is_active),
          updated_at   = NOW()
        WHERE id = ${req.params.id}
        RETURNING *
      `;

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        actorId: req.user!.id,
        entityType: "employee",
        entityId: employee.id,
        summary: `Employee record updated for ${employee.full_name}.`,
        metadata: {
          display_name: employee.full_name,
          employee_number: employee.employee_number,
          changes: {
            full_name: existing.full_name !== employee.full_name,
            position: existing.position !== employee.position,
            department: (existing.department ?? null) !== (employee.department ?? null),
            branch: (existing.branch ?? null) !== (employee.branch ?? null),
            email: (existing.email ?? null) !== (employee.email ?? null),
            phone: (existing.phone ?? null) !== (employee.phone ?? null),
            address: (existing.address ?? null) !== (employee.address ?? null),
            salary: Number(existing.salary) !== Number(employee.salary),
            is_active: existing.is_active !== employee.is_active,
          },
        },
      });

      return res.json({ employee });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

export default router;
