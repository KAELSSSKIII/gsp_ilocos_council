import sql from "../db";

export const ADMIN_AUDIT_ACTIONS = {
  USER_LOGIN: "user_login",
  USER_CREATED: "user_created",
  USER_UPDATED: "user_updated",
  USER_DELETED: "user_deleted",
  EMPLOYEE_CREATED: "employee_created",
  EMPLOYEE_UPDATED: "employee_updated",
  PAYROLL_CREATED: "payroll_created",
  PAYROLL_STATUS_UPDATED: "payroll_status_updated",
  MEMBER_CREATED: "member_created",
  MEMBER_UPDATED: "member_updated",
  MEMBER_DELETED: "member_deleted",
  PRODUCT_CREATED: "product_created",
  PRODUCT_UPDATED: "product_updated",
  STOCK_ADJUSTED: "stock_adjusted",
  CATEGORY_CREATED: "category_created",
  CATEGORY_UPDATED: "category_updated",
  CATEGORY_DELETED: "category_deleted",
  RECEIPT_SETTINGS_CREATED: "receipt_settings_created",
  RECEIPT_SETTINGS_UPDATED: "receipt_settings_updated",
  BUSINESS_SETTINGS_UPDATED: "business_settings_updated",
  VOUCHER_CREATED: "voucher_created",
  VOUCHER_STATUS_UPDATED: "voucher_status_updated",
  ACCOUNT_CREATED: "account_created",
  ACCOUNT_UPDATED: "account_updated",
  ACCOUNTING_MAPPINGS_UPDATED: "accounting_mappings_updated",
  JOURNAL_ENTRY_CREATED: "journal_entry_created",
  JOURNAL_ENTRY_DELETED: "journal_entry_deleted",
  SALE_CREATED: "sale_created",
  SALE_VOIDED: "sale_voided",
} as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[keyof typeof ADMIN_AUDIT_ACTIONS];

type AuditLogInput = {
  action: AdminAuditAction;
  actorId?: string | null;
  targetUserId?: string | null;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

export async function appendAuditLog(entry: AuditLogInput) {
  const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;

  await sql`
    INSERT INTO public.admin_audit_logs (
      action,
      actor_id,
      target_user_id,
      entity_type,
      entity_id,
      summary,
      metadata
    )
    VALUES (
      ${entry.action},
      ${entry.actorId ?? null},
      ${entry.targetUserId ?? null},
      ${entry.entityType},
      ${entry.entityId ?? null},
      ${entry.summary},
      ${metadata}::jsonb
    )
  `;
}

export async function ensureAdminAuditLogTable() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      summary TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
    ON public.admin_audit_logs (created_at DESC);
  `);

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_id_idx
    ON public.admin_audit_logs (target_user_id, created_at DESC);
  `);

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_id_idx
    ON public.admin_audit_logs (actor_id, created_at DESC);
  `);
}
