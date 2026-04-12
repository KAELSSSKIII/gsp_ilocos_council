import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";
import { Router } from "express";

import sql from "../db";
import {
  appendSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireRole,
} from "../middleware/auth";
import { createRateLimiter } from "../middleware/security";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { validateBody } from "../middleware/validate";
import { authLoginSchema } from "../validation/schemas";

const router = Router();
const loginRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

router.post("/login", loginRateLimiter, validateBody(authLoginSchema), async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const [user] = await sql<{ id: string; username: string; password_hash: string }[]>`
      SELECT id, username, password_hash FROM public.users WHERE username = ${username}
    `;

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const [profile] = await sql`
      SELECT id, full_name, username, role, branch, phone, avatar_url, created_at, updated_at
      FROM public.profiles
      WHERE id = ${user.id}
    `;

    if (!profile) {
      return res.status(401).json({ error: "Profile not found" });
    }

    const token = jwt.sign(
      { id: user.id, role: profile.role },
      process.env.JWT_SECRET! as Secret,
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"] }
    );

    appendSessionCookie(res, token);
    try {
      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.USER_LOGIN,
        actorId: user.id,
        targetUserId: user.id,
        entityType: "auth",
        entityId: user.id,
        summary: `${profile.full_name} logged in.`,
        metadata: {
          username: profile.username,
          role: profile.role,
        },
      });
    } catch (auditError) {
      console.error("Audit log write failed during login:", auditError);
    }
    return res.json({ profile });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const [profile] = await sql`
      SELECT id, full_name, username, role, branch, phone, avatar_url, created_at, updated_at
      FROM public.profiles
      WHERE id = ${req.user!.id}
    `;

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    return res.json({ profile });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users", requireAuth, requireRole("admin", "accountant"), async (_req, res) => {
  try {
    const users = await sql`
      SELECT id, full_name, role FROM public.profiles ORDER BY full_name
    `;
    return res.json({ users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", requireAuth, (_req, res) => {
  clearSessionCookie(res);
  return res.status(204).send();
});

export default router;
