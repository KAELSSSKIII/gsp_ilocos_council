/**
 * Receipt Settings routes — replaces ReceiptSettingsPage Supabase calls
 *
 * GET   /api/receipt-settings          → latest settings record
 * POST  /api/receipt-settings          → create new settings
 * PATCH /api/receipt-settings/:id      → update settings
 */
import { Router } from "express";
import { ROUTE_ROLE_ACCESS } from "../config/permissions";
import sql, { type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { validateBody, validateParams } from "../middleware/validate";
import { idParamSchema, receiptSettingsCreateSchema, receiptSettingsUpdateSchema } from "../validation/schemas";

const router = Router();

// GET /api/receipt-settings
router.get("/", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.receiptSettings), async (_req, res) => {
  try {
    const [settings] = await sql`
      SELECT id, start_number, end_number, current_number, date_issued,
             created_by, created_at, updated_at
      FROM public.receipt_settings
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return res.json({ settings: settings ?? null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/receipt-settings
router.post(
  "/",
  requireAuth,
  requireRole(...ROUTE_ROLE_ACCESS.receiptSettings),
  validateBody(receiptSettingsCreateSchema),
  async (req, res) => {
  try {
    const { start_number, end_number, current_number, date_issued } = req.body;
    const [settings] = await sql`
      INSERT INTO public.receipt_settings
        (start_number, end_number, current_number, date_issued, created_by)
      VALUES
        (${start_number}, ${end_number}, ${current_number}, ${date_issued}, ${req.user!.id})
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.RECEIPT_SETTINGS_CREATED,
      actorId: req.user!.id,
      entityType: "receipt_settings",
      entityId: settings.id,
      summary: `Receipt series was created.`,
      metadata: {
        display_name: `Receipt series ${settings.start_number}-${settings.end_number}`,
        start_number: settings.start_number,
        end_number: settings.end_number,
        current_number: settings.current_number,
      },
    });

    return res.status(201).json({ settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/receipt-settings/:id
router.patch(
  "/:id",
  requireAuth,
  requireRole(...ROUTE_ROLE_ACCESS.receiptSettings),
  validateParams(idParamSchema),
  validateBody(receiptSettingsUpdateSchema),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { start_number, end_number, current_number, date_issued } = req.body;
    const [existing] = await sql`
      SELECT id, start_number, end_number, current_number, date_issued
      FROM public.receipt_settings
      WHERE id = ${id}
    `;
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [settings] = await sql`
      UPDATE public.receipt_settings
      SET start_number   = COALESCE(${start_number   ?? null}, start_number),
          end_number     = COALESCE(${end_number     ?? null}, end_number),
          current_number = COALESCE(${current_number ?? null}, current_number),
          date_issued    = COALESCE(${date_issued    ?? null}::date, date_issued),
          updated_at     = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.RECEIPT_SETTINGS_UPDATED,
      actorId: req.user!.id,
      entityType: "receipt_settings",
      entityId: settings.id,
      summary: `Receipt series was updated.`,
      metadata: {
        display_name: `Receipt series ${settings.start_number}-${settings.end_number}`,
        changes: {
          start_number: Number(existing.start_number) !== Number(settings.start_number),
          end_number: Number(existing.end_number) !== Number(settings.end_number),
          current_number: Number(existing.current_number) !== Number(settings.current_number),
          date_issued: String(existing.date_issued) !== String(settings.date_issued),
        },
      },
    });

    return res.json({ settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/consume", requireAuth, requireRole("admin", "cashier"), async (_req, res) => {
  try {
    const result = await sql.begin(async (tx: TransactionClient) => {
      const txSql = tx as unknown as typeof sql;
      const [settings] = await txSql`
        SELECT id, start_number, end_number, current_number, date_issued
        FROM public.receipt_settings
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
      `;

      if (!settings) {
        throw new Error("RECEIPT_SETTINGS_NOT_FOUND");
      }

      const nextNumber = settings.current_number ?? settings.start_number;
      if (nextNumber > settings.end_number) {
        throw new Error("RECEIPT_SERIES_EXHAUSTED");
      }

      const nextCurrentNumber = Math.min(nextNumber + 1, settings.end_number + 1);
      await txSql`
        UPDATE public.receipt_settings
        SET current_number = ${nextCurrentNumber},
            updated_at = NOW()
        WHERE id = ${settings.id}
      `;

      return {
        receiptNumber: nextNumber,
        receiptIssuedAt: settings.date_issued,
        nextReceiptNumber: nextCurrentNumber,
        endNumber: settings.end_number,
      };
    });

    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RECEIPT_SETTINGS_NOT_FOUND") {
      return res.status(404).json({ error: "Receipt series not configured" });
    }
    if (message === "RECEIPT_SERIES_EXHAUSTED") {
      return res.status(409).json({ error: "Receipt series exhausted" });
    }
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
