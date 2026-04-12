/**
 * Audit log routes (admin only)
 *
 * GET /api/audit-logs?from=&to=&action=&limit=&offset=
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { from, to, action, limit = "100", offset = "0" } = req.query as Record<string, string>;
    const limitN  = Math.min(parseInt(limit,  10) || 100, 500);
    const offsetN = Math.max(parseInt(offset, 10) || 0,   0);

    const logs = await sql`
      SELECT
        l.id,
        l.action,
        l.entity_type,
        l.entity_id,
        l.summary,
        l.metadata,
        l.created_at,
        actor.full_name  AS actor_name,
        actor.username   AS actor_username,
        actor.role       AS actor_role
      FROM public.admin_audit_logs l
      LEFT JOIN public.profiles actor ON actor.id = l.actor_id
      WHERE (${from  ?? null}::timestamptz IS NULL OR l.created_at >= ${from  ?? null}::timestamptz)
        AND (${to    ?? null}::timestamptz IS NULL OR l.created_at <= ${to    ?? null}::timestamptz)
        AND (${action ?? null}::text IS NULL OR l.action = ${action ?? null})
      ORDER BY l.created_at DESC
      LIMIT  ${limitN}
      OFFSET ${offsetN}
    `;

    const [{ total }] = await sql`
      SELECT COUNT(*)::int AS total
      FROM public.admin_audit_logs l
      WHERE (${from  ?? null}::timestamptz IS NULL OR l.created_at >= ${from  ?? null}::timestamptz)
        AND (${to    ?? null}::timestamptz IS NULL OR l.created_at <= ${to    ?? null}::timestamptz)
        AND (${action ?? null}::text IS NULL OR l.action = ${action ?? null})
    `;

    return res.json({ logs, total });
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

export default router;
