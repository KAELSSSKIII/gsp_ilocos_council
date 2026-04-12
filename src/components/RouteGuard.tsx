import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ROLE_HOME, type UserRole } from "@/lib/permissions";
import { selectLoading, selectProfile, selectRole, useSessionStore } from "@/store/sessionStore";

interface RouteGuardProps {
  allowedRoles: readonly UserRole[];
  children: React.ReactElement;
  fallbackPath?: string;
}

export function RouteGuard({ allowedRoles, children, fallbackPath }: RouteGuardProps) {
  const loading = useSessionStore(selectLoading);
  const profile = useSessionStore(selectProfile);
  const role = useSessionStore(selectRole);
  const navigate = useNavigate();
  const location = useLocation();

  const allowed = !loading && !!profile && !!role && allowedRoles.includes(role);
  const redirect = !profile ? (fallbackPath ?? "/login") : (ROLE_HOME[role ?? "admin"] ?? "/");

  useEffect(() => {
    if (!loading && !allowed) {
      navigate(redirect, { replace: true, state: { from: location.pathname } });
    }
  }, [allowed, loading, location.pathname, navigate, redirect]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="text-sm text-muted-foreground">Checking credentials...</span>
      </div>
    );
  }

  if (!allowed) return null;

  return children;
}
