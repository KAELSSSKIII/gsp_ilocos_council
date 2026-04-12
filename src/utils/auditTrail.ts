import type { UserRole } from "@/store/sessionStore";

export const AUDIT_TRAIL_UPDATED_EVENT = "gsp:audit-trail-updated";
const AUDIT_TRAIL_KEY = "gsp-audit-trail";
const MAX_AUDIT_ENTRIES = 200;

export type AuditAction =
  | "login"
  | "logout"
  | "business_settings_updated";

export type AuditEntry = {
  id: string;
  timestamp: string;
  action: AuditAction;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole | string;
  summary: string;
};

type AuditEntryInput = Omit<AuditEntry, "id" | "timestamp"> & {
  timestamp?: string;
};

export const readAuditTrail = (): AuditEntry[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(AUDIT_TRAIL_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as AuditEntry[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch {
    return [];
  }
};

export const appendAuditEntry = (entry: AuditEntryInput): AuditEntry => {
  const nextEntry: AuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    action: entry.action,
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    summary: entry.summary,
  };

  if (typeof window === "undefined") return nextEntry;

  const existing = readAuditTrail();
  const next = [nextEntry, ...existing].slice(0, MAX_AUDIT_ENTRIES);
  window.localStorage.setItem(AUDIT_TRAIL_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(AUDIT_TRAIL_UPDATED_EVENT, { detail: nextEntry }));
  return nextEntry;
};
