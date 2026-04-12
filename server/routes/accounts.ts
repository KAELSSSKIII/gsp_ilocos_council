import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import {
  accountCreateSchema,
  accountUpdateSchema,
  idParamSchema,
} from "../validation/schemas";

const router = Router();

router.use(requireAuth, requireRole("admin", "accountant"));

interface AccountRow {
  id: string;
  code: string;
  name: string;
  account_type: string;
  category: string;
  normal_balance: string;
  parent_account_id: string | null;
  parent_account_code: string | null;
  parent_account_name: string | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

router.get("/", async (_req, res) => {
  try {
    const accounts = await sql<AccountRow[]>`
      SELECT
        a.id,
        a.code,
        a.name,
        a.account_type,
        a.category,
        a.normal_balance,
        a.parent_account_id,
        parent.code AS parent_account_code,
        parent.name AS parent_account_name,
        a.description,
        a.is_system,
        a.is_active,
        a.created_at,
        a.updated_at
      FROM public.chart_of_accounts a
      LEFT JOIN public.chart_of_accounts parent ON parent.id = a.parent_account_id
      ORDER BY a.code ASC
    `;

    return res.json(
      accounts.map((account) => ({
        ...account,
        is_system: Boolean(account.is_system),
        is_active: Boolean(account.is_active),
      }))
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load chart of accounts";
    return res.status(500).json({ error: message });
  }
});

router.post("/", async (req, res) => {
  const parsed = accountCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;

  try {
    const [account] = await sql`
      INSERT INTO public.chart_of_accounts (
        code,
        name,
        account_type,
        category,
        normal_balance,
        parent_account_id,
        description,
        is_active
      ) VALUES (
        ${payload.code},
        ${payload.name},
        ${payload.account_type}::public.account_type,
        ${payload.category}::public.account_category,
        ${payload.normal_balance}::public.normal_balance,
        ${payload.parent_account_id ?? null},
        ${payload.description ?? null},
        ${payload.is_active ?? true}
      )
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.ACCOUNT_CREATED,
      actorId: req.user!.id,
      entityType: "account",
      entityId: account.id,
      summary: `Chart of account ${account.code} - ${account.name} was created.`,
      metadata: {
        display_name: `${account.code} - ${account.name}`,
        account_type: account.account_type,
        category: account.category,
      },
    });

    return res.status(201).json(account);
  } catch (error: unknown) {
    const duplicateCode = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    const message = duplicateCode
      ? "An account with that code already exists"
      : error instanceof Error ? error.message : "Failed to create account";
    return res.status(400).json({ error: message });
  }
});

router.patch("/:id", async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: params.error.flatten() });
  }

  const parsed = accountUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const [existing] = await sql`
      SELECT id, is_system, code, name, account_type, category, normal_balance, parent_account_id, description, is_active
      FROM public.chart_of_accounts
      WHERE id = ${params.data.id}
      LIMIT 1
    `;

    if (!existing) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (existing.is_system) {
      return res.status(403).json({ error: "System accounts cannot be edited" });
    }

    const payload = parsed.data;
    const [updated] = await sql`
      UPDATE public.chart_of_accounts
      SET
        code = COALESCE(${payload.code ?? null}, code),
        name = COALESCE(${payload.name ?? null}, name),
        account_type = COALESCE(${payload.account_type ?? null}::public.account_type, account_type),
        category = COALESCE(${payload.category ?? null}::public.account_category, category),
        normal_balance = COALESCE(${payload.normal_balance ?? null}::public.normal_balance, normal_balance),
        parent_account_id = COALESCE(${payload.parent_account_id ?? null}, parent_account_id),
        description = COALESCE(${payload.description ?? null}, description),
        is_active = COALESCE(${payload.is_active ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${params.data.id}
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.ACCOUNT_UPDATED,
      actorId: req.user!.id,
      entityType: "account",
      entityId: updated.id,
      summary: `Chart of account ${updated.code} - ${updated.name} was updated.`,
      metadata: {
        display_name: `${updated.code} - ${updated.name}`,
        changes: {
          code: existing.code !== updated.code,
          name: existing.name !== updated.name,
          account_type: existing.account_type !== updated.account_type,
          category: existing.category !== updated.category,
          normal_balance: existing.normal_balance !== updated.normal_balance,
          parent_account_id: (existing.parent_account_id ?? null) !== (updated.parent_account_id ?? null),
          description: (existing.description ?? null) !== (updated.description ?? null),
          is_active: Boolean(existing.is_active) !== Boolean(updated.is_active),
        },
      },
    });

    return res.json(updated);
  } catch (error: unknown) {
    const duplicateCode = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    const message = duplicateCode
      ? "An account with that code already exists"
      : error instanceof Error ? error.message : "Failed to update account";
    return res.status(400).json({ error: message });
  }
});

router.delete("/:id", async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: "Invalid account ID" });
  }

  const { id } = params.data;

  try {
    const [account] = await sql`
      SELECT id, code, name, is_system
      FROM public.chart_of_accounts
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.is_system) {
      return res.status(403).json({ error: "System accounts cannot be deleted" });
    }

    // Block if account has any posted journal entry lines
    const [usedInJournal] = await sql`
      SELECT 1 FROM public.journal_entry_lines WHERE account_id = ${id} LIMIT 1
    `;
    if (usedInJournal) {
      return res.status(409).json({
        error: "This account has journal entries posted against it and cannot be deleted. Deactivate it instead.",
      });
    }

    // Block if account is referenced in system mappings
    const [usedInMappings] = await sql`
      SELECT 1 FROM public.accounting_mappings WHERE account_id = ${id} LIMIT 1
    `;
    if (usedInMappings) {
      return res.status(409).json({
        error: "This account is used in account mappings. Remove the mapping first before deleting.",
      });
    }

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.ACCOUNT_UPDATED,
      actorId: req.user!.id,
      entityType: "account",
      entityId: id,
      summary: `Chart of account ${account.code} - ${account.name} was deleted.`,
      metadata: { display_name: `${account.code} - ${account.name}` },
    });

    await sql`DELETE FROM public.chart_of_accounts WHERE id = ${id}`;

    return res.status(204).send();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete account";
    return res.status(500).json({ error: message });
  }
});

export default router;
