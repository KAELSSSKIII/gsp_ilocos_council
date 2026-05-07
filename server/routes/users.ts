/**
 * User account management routes (admin only)
 *
 * GET    /api/users          → list all staff profiles
 * POST   /api/users          → create user + profile
 * PATCH  /api/users/:id      → update profile; optionally reset password
 * DELETE /api/users/:id      → delete user (cascades to profile)
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { ROUTE_ROLE_ACCESS } from "../config/permissions";
import sql, { type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { validateBody, validateParams } from "../middleware/validate";
import { idParamSchema, userCreateSchema, userUpdateSchema } from "../validation/schemas";
import { logger } from "../logger";

const router = Router();

// ── GET /api/users ─────────────────────────────────────────────────────────────
router.get("/", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.userCrud), async (_req, res) => {
  try {
    const users = await sql`
      SELECT
        p.id, p.full_name, p.username, p.role, p.branch, p.phone,
        p.created_at, p.updated_at,
        last_login.created_at AS last_login_at,
        last_edit.created_at AS last_modified_at,
        editor.full_name AS last_modified_by_name
      FROM public.profiles p
      LEFT JOIN LATERAL (
        SELECT created_at
        FROM public.admin_audit_logs
        WHERE target_user_id = p.id
          AND action = ${ADMIN_AUDIT_ACTIONS.USER_LOGIN}
        ORDER BY created_at DESC
        LIMIT 1
      ) AS last_login ON true
      LEFT JOIN LATERAL (
        SELECT actor_id, created_at
        FROM public.admin_audit_logs
        WHERE target_user_id = p.id
          AND action IN (${ADMIN_AUDIT_ACTIONS.USER_CREATED}, ${ADMIN_AUDIT_ACTIONS.USER_UPDATED})
        ORDER BY created_at DESC
        LIMIT 1
      ) AS last_edit ON true
      LEFT JOIN public.profiles editor
        ON editor.id = last_edit.actor_id
      ORDER BY p.full_name
    `;
    return res.json({ users });
  } catch (err: unknown) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── POST /api/users ────────────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.userCrud), validateBody(userCreateSchema), async (req, res) => {
  try {
    const { full_name, username, password, role, branch, phone } = req.body;

    if (!full_name || !username || !password || !role) {
      return res.status(400).json({ error: "full_name, username, password, and role are required" });
    }

    const VALID_ROLES = ["admin", "accountant", "cashier", "hr", "inventory_clerk", "manager"];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    }

    // Check username uniqueness
    const [existing] = await sql`SELECT id FROM public.users WHERE username = ${username.toLowerCase()}`;
    if (existing) {
      return res.status(409).json({ error: "An account with this username already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const [profile] = await sql.begin(async (tx: TransactionClient) => {
      const txSql = tx as unknown as typeof sql;
      const [user] = await txSql`
        INSERT INTO public.users (username, password_hash)
        VALUES (${username.toLowerCase()}, ${password_hash})
        RETURNING id
      `;

      const [prof] = await txSql`
        INSERT INTO public.profiles (id, full_name, username, role, branch, phone)
        VALUES (
          ${user.id},
          ${full_name},
          ${username.toLowerCase()},
          ${role},
          ${branch ?? null},
          ${phone ?? null}
        )
        RETURNING id, full_name, username, role, branch, phone, created_at, updated_at
      `;

      return [prof];
    });

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.USER_CREATED,
      actorId: req.user!.id,
      targetUserId: profile.id,
      entityType: "user",
      entityId: profile.id,
      summary: `Account created for ${profile.full_name}.`,
      metadata: {
        username: profile.username,
        role: profile.role,
        branch: profile.branch,
      },
    });

    return res.status(201).json({ user: profile });
  } catch (err: unknown) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── PATCH /api/users/:id ───────────────────────────────────────────────────────
router.patch("/:id", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.userCrud), validateParams(idParamSchema), validateBody(userUpdateSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role, branch, phone, password } = req.body;

    const VALID_ROLES = ["admin", "accountant", "cashier", "hr", "inventory_clerk", "manager"];
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    }

    const [existing] = await sql`
      SELECT id, full_name, username, role, branch, phone
      FROM public.profiles
      WHERE id = ${id}
    `;

    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update profile fields
    const [updated] = await sql`
      UPDATE public.profiles SET
        full_name  = COALESCE(${full_name  ?? null}, full_name),
        role       = COALESCE(${role       ?? null}::public.user_role, role),
        branch     = COALESCE(${branch     ?? null}, branch),
        phone      = COALESCE(${phone      ?? null}, phone),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, full_name, username, role, branch, phone, created_at, updated_at
    `;

    // Optionally reset password
    if (password) {
      if (password.length < 12) {
        return res.status(400).json({ error: "Password must be at least 12 characters" });
      }
      const password_hash = await bcrypt.hash(password, 12);
      await sql`
        UPDATE public.users SET password_hash = ${password_hash}, updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.USER_UPDATED,
      actorId: req.user!.id,
      targetUserId: updated.id,
      entityType: "user",
      entityId: updated.id,
      summary: `${updated.full_name}'s account was updated.`,
      metadata: {
        changes: {
          full_name: existing.full_name !== updated.full_name,
          role: existing.role !== updated.role,
          branch: (existing.branch ?? null) !== (updated.branch ?? null),
          phone: (existing.phone ?? null) !== (updated.phone ?? null),
          password: Boolean(password),
        },
      },
    });

    return res.json({ user: updated });
  } catch (err: unknown) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── DELETE /api/users/:id ──────────────────────────────────────────────────────
router.delete("/:id", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.userCrud), validateParams(idParamSchema), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user!.id === id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    const [existing] = await sql`
      SELECT id, full_name, username, role
      FROM public.profiles
      WHERE id = ${id}
    `;

    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.USER_DELETED,
      actorId: req.user!.id,
      targetUserId: existing.id,
      entityType: "user",
      entityId: existing.id,
      summary: `${existing.full_name}'s account was deleted.`,
      metadata: {
        full_name: existing.full_name,
        username: existing.username,
        role: existing.role,
      },
    });

    await sql`
      DELETE FROM public.users WHERE id = ${id}
    `;

    return res.status(204).send();
  } catch (err: unknown) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

router.get("/audit-trail", requireAuth, requireRole(...ROUTE_ROLE_ACCESS.userCrud), async (_req, res) => {
  try {
    const entries = await sql`
      SELECT
        l.id,
        l.action,
        l.entity_type,
        l.entity_id,
        l.summary,
        l.metadata,
        l.created_at,
        actor.id AS actor_id,
        actor.full_name AS actor_name,
        actor.username AS actor_username,
        actor.role AS actor_role,
        target.id AS target_user_id,
        COALESCE(target.full_name, l.metadata->>'full_name') AS target_user_name,
        COALESCE(target.username, l.metadata->>'username') AS target_user_username,
        COALESCE(
          target.full_name,
          l.metadata->>'display_name',
          l.metadata->>'employee_name',
          l.metadata->>'full_name'
        ) AS entity_display_name
      FROM public.admin_audit_logs l
      LEFT JOIN public.profiles actor ON actor.id = l.actor_id
      LEFT JOIN public.profiles target ON target.id = l.target_user_id
      ORDER BY l.created_at DESC
      LIMIT 50
    `;

    return res.json({ entries });
  } catch (err: unknown) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

export default router;
