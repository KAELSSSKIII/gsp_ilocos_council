import { Navigate, useLocation } from "react-router-dom";
import { useSessionStore, selectLoading, selectProfile, selectRole } from "@/store/sessionStore";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

interface RouteGuardProps {
  allowedRoles: Array<"admin" | "cashier" | "accountant" | "hr" | "inventory_clerk" | "manager">;
  children: React.ReactElement;
  fallbackPath?: string;
}

export function RouteGuard({ allowedRoles, children, fallbackPath = "/login" }: RouteGuardProps) {
  const loading = useSessionStore(selectLoading);
  const profile = useSessionStore(selectProfile);
  const role = useSessionStore(selectRole);
  const location = useLocation();

  if (!isSupabaseConfigured) {
    return children;
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="text-sm text-muted-foreground">Checking credentials…</span>
      </div>
    );
  }

  if (!profile || !role || !allowedRoles.includes(role)) {
    return <Navigate to={fallbackPath} replace state={{ from: location.pathname }} />;
  }

  return children;
}

