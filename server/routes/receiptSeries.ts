/**
 * Receipt Series routes — BIR receipt number management
 *
 * GET    /api/receipt-series          → list all series
 * POST   /api/receipt-series          → create new series (admin)
 * PATCH  /api/receipt-series/:id      → update / activate series (admin)
 * GET    /api/receipt-series/next     → atomically get next receipt number
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { receiptSeriesCreateSchema, receiptSeriesUpdateSchema } from "../validation/schemas";

const router = Router();

// ── Ensure table exists (in case migration hasn't been run yet) ──────────────
const ensureTable = sql`
  CREATE TABLE IF NOT EXISTS public.receipt_series (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_label   TEXT NOT NULL,
    from_number    INTEGER NOT NULL,
    to_number      INTEGER NOT NULL,
    current_number INTEGER NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT receipt_series_range_check   CHECK (from_number <= to_number),
    CONSTRAINT receipt_series_current_check CHECK (current_number >= 0)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS receipt_series_one_active
    ON public.receipt_series (is_active) WHERE is_active = true;
`.execute().catch(() => {/* table may already exist */});

void ensureTable;

// ── GET /api/receipt-series ──────────────────────────────────────────────────
router.get("/", requireAuth, requireRole("admin", "accountant"), async (_req, res) => {
  try {
    const series = await sql`
      SELECT id, series_label, from_number, to_number, current_number, is_active, created_at, updated_at
      FROM public.receipt_series
      ORDER BY created_at DESC
    `;
    return res.json({ series });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── GET /api/receipt-series/next ─────────────────────────────────────────────
router.get("/next", requireAuth, async (_req, res) => {
  try {
    const [row] = await sql`
      UPDATE public.receipt_series
      SET current_number = current_number + 1,
          updated_at     = NOW()
      WHERE is_active = true
        AND current_number < to_number
      RETURNING current_number, to_number, series_label, from_number
    `;

    if (!row) return res.json({ receiptNumber: null, warning: null });

    const remaining = row.to_number - row.current_number;
    const warning = remaining <= 100
      ? `Series "${row.series_label}" is ${remaining} receipt${remaining !== 1 ? "s" : ""} away from its end (${row.to_number}).`
      : null;

    return res.json({ receiptNumber: row.current_number, warning });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── POST /api/receipt-series ─────────────────────────────────────────────────
router.post("/", requireAuth, requireRole("admin"), validateBody(receiptSeriesCreateSchema), async (req, res) => {
  try {
    const { series_label, from_number, to_number } = req.body as {
      series_label: string;
      from_number: number;
      to_number: number;
    };

    const [created] = await sql`
      INSERT INTO public.receipt_series (series_label, from_number, to_number, current_number, is_active)
      VALUES (${series_label.trim()}, ${from_number}, ${to_number}, ${from_number - 1}, false)
      RETURNING *
    `;

    return res.status(201).json({ series: created });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── PATCH /api/receipt-series/:id ────────────────────────────────────────────
router.patch("/:id", requireAuth, requireRole("admin"), validateBody(receiptSeriesUpdateSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, series_label, from_number, to_number } = req.body as {
      is_active?: boolean;
      series_label?: string;
      from_number?: number;
      to_number?: number;
    };

    // If activating, deactivate all others first (unique partial index guards it,
    // but we deactivate manually to avoid constraint violations)
    if (is_active === true) {
      await sql`UPDATE public.receipt_series SET is_active = false, updated_at = NOW() WHERE is_active = true`;
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (is_active !== undefined)   updates.is_active    = is_active;
    if (series_label !== undefined) updates.series_label = series_label.trim();
    if (from_number  !== undefined) updates.from_number  = from_number;
    if (to_number    !== undefined) updates.to_number    = to_number;

    const [updated] = await sql`
      UPDATE public.receipt_series
      SET ${sql(updates)}
      WHERE id = ${id}
      RETURNING *
    `;

    if (!updated) return res.status(404).json({ error: "Series not found." });

    return res.json({ series: updated });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

export default router;
