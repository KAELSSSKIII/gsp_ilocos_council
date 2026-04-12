import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSessionStore, selectProfile, selectLoading } from "@/store/sessionStore";
import { authApi } from "@/lib/api";
import { usePOSStore } from "@/store/posStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { appendAuditEntry } from "@/utils/auditTrail";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const fetchProfile = useSessionStore((state) => state.fetchProfile);
  const profile = useSessionStore(selectProfile);
  const resetSession = useSessionStore((state) => state.reset);
  const loading = useSessionStore(selectLoading);
  const hasFetchedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const isAuthRoute = location.pathname === "/login";
  const clearCart = usePOSStore((state) => state.clearCart);
  const clearMember = usePOSStore((state) => state.clearMember);

  useEffect(() => {
    if (isAuthRoute) {
      return;
    }

    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      void fetchProfile();
    }

    const onFocus = () => {
      void fetchProfile();
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchProfile, isAuthRoute]);

  // Redirect to login if the session expires before rendering protected routes.
  useEffect(() => {
    if (!isAuthRoute && !loading && !profile) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [isAuthRoute, loading, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    try {
      setSigningOut(true);
      if (profile) {
        appendAuditEntry({
          action: "logout",
          actorName: profile.full_name || profile.username,
          actorEmail: profile.username,
          actorRole: profile.role,
          summary: "Signed out of the workspace.",
        });
      }
      await authApi.logout();
      clearCart();
      clearMember();
      resetSession();
      navigate("/login");
    } finally {
      setSigningOut(false);
    }
  };

  const { showWarning: showIdleWarning, resetTimer } = useIdleTimeout(
    30,
    60,
    isAuthRoute ? undefined : handleLogout,
  );

  if (isAuthRoute) {
    return <>{children}</>;
  }

  if (!loading && !profile) return null;

  return (
    <SidebarProvider>
      <div className="app-shell flex min-h-screen w-full bg-transparent">
        <AppSidebar />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[1680px] min-w-0 flex-1 flex-col">
            <header className="app-topbar sticky top-0 z-40 px-6">
              <SidebarTrigger
                className="absolute left-6 top-1/2 h-9 w-9 -translate-y-1/2 rounded-[0.7rem] border border-border bg-background text-foreground hover:bg-muted"
                aria-label="Toggle modules menu"
              >
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <div className="flex min-h-14 items-center justify-between gap-6 pl-12">
                <div className="min-w-0">
                  <h2 className="text-[0.95rem] font-medium text-foreground sm:text-[1rem]">
                    Girl Scouts of the Philippines Ilocos Sur Council
                  </h2>
                  <p className="mt-1 text-[0.72rem] text-muted-foreground sm:text-xs">
                    Unified Business Suite for finance, retail, member records, and daily operations.
                  </p>
                </div>
                {!loading && profile && (
                  <div className="flex items-center gap-3">
                    <div className="hidden items-center gap-2 text-[0.72rem] text-muted-foreground xl:flex">
                      <Bell className="h-3.5 w-3.5 text-primary" />
                      <span>Live council session</span>
                    </div>
                    <div className="hidden text-right md:block">
                      <p className="text-xs font-medium text-foreground">{profile.full_name || profile.username}</p>
                      <p className="text-[0.68rem] text-muted-foreground">Signed in and synced</p>
                    </div>
                    <Badge variant="secondary" className="rounded-full border border-border bg-background px-2.5 py-1 capitalize text-[0.68rem] font-medium text-primary">
                      {profile.role}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLogout}
                      disabled={signingOut}
                      className="h-8 rounded-[0.6rem] border-border bg-background px-3 text-xs hover:bg-muted"
                    >
                      Sign out
                    </Button>
                  </div>
                )}
              </div>
            </header>
            <motion.main
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex-1 min-w-0 px-6 pb-7 pt-7"
            >
              <div className="min-w-0">
                {children}
              </div>
            </motion.main>
          </div>
        </div>
      </div>

      <Dialog open={showIdleWarning && !!profile}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Session Expiring Soon</DialogTitle>
            <DialogDescription>
              You have been idle for 30 minutes. You will be signed out automatically in 60 seconds unless you choose to stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleLogout}>Sign Out Now</Button>
            <Button onClick={resetTimer}>Stay Signed In</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
