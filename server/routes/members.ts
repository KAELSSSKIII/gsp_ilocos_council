/**
 * Members routes — loyalty member CRUD
 *
 * GET    /api/members       → list all members (public.members)
 * POST   /api/members       → create member
 * PATCH  /api/members/:id   → update name / email / discount_rate
 * DELETE /api/members/:id   → remove member (admin only)
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { validateBody, validateParams } from "../middleware/validate";
import { idParamSchema, memberCreateSchema, memberUpdateSchema } from "../validation/schemas";
import { logger } from "../logger";

const router = Router();

// GET /api/members
router.get("/", requireAuth, requireRole("admin", "cashier", "accountant"), async (_req, res) => {
  try {
    const members = await sql`
      SELECT id, code, name, email, discount_rate, created_at, updated_at
      FROM public.members
      ORDER BY name
    `;
    return res.json({ members });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/members
router.post("/", requireAuth, requireRole("admin", "cashier"), validateBody(memberCreateSchema), async (req, res) => {
  try {
    const { code, name, email, discount_rate } = req.body;
    const [member] = await sql`
      INSERT INTO public.members (code, name, email, discount_rate)
      VALUES (${code}, ${name}, ${email ?? null}, ${discount_rate ?? 0})
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.MEMBER_CREATED,
      actorId: req.user!.id,
      entityType: "member",
      entityId: member.id,
      summary: `Member ${member.name} was created.`,
      metadata: {
        display_name: member.name,
        code: member.code,
        email: member.email,
      },
    });

    return res.status(201).json({ member });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/members/:id
router.patch("/:id", requireAuth, requireRole("admin", "cashier"), validateParams(idParamSchema), validateBody(memberUpdateSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, discount_rate } = req.body;
    const [existing] = await sql`
      SELECT id, code, name, email, discount_rate
      FROM public.members
      WHERE id = ${id}
    `;
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [member] = await sql`
      UPDATE public.members
      SET name          = COALESCE(${name ?? null}, name),
          email         = COALESCE(${email ?? null}, email),
          discount_rate = COALESCE(${discount_rate ?? null}::numeric, discount_rate),
          updated_at    = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.MEMBER_UPDATED,
      actorId: req.user!.id,
      entityType: "member",
      entityId: member.id,
      summary: `Member ${member.name} was updated.`,
      metadata: {
        display_name: member.name,
        code: member.code,
        changes: {
          name: existing.name !== member.name,
          email: (existing.email ?? null) !== (member.email ?? null),
          discount_rate: Number(existing.discount_rate) !== Number(member.discount_rate),
        },
      },
    });

    return res.json({ member });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/members/:id
router.delete("/:id", requireAuth, requireRole("admin"), validateParams(idParamSchema), async (req, res) => {
  try {
    const [member] = await sql`
      SELECT id, code, name, email
      FROM public.members
      WHERE id = ${req.params.id}
    `;
    if (!member) return res.status(404).json({ error: "Not found" });

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.MEMBER_DELETED,
      actorId: req.user!.id,
      entityType: "member",
      entityId: member.id,
      summary: `Member ${member.name} was deleted.`,
      metadata: {
        display_name: member.name,
        code: member.code,
        email: member.email,
      },
    });

    await sql`DELETE FROM public.members WHERE id = ${req.params.id}`;
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
