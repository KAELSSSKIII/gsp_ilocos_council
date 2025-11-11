import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu, LogOut, UserCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSessionStore, selectProfile, selectRole, selectLoading } from "@/store/sessionStore";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigate } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const fetchProfile = useSessionStore((state) => state.fetchProfile);
  const profile = useSessionStore(selectProfile);
  const role = useSessionStore(selectRole);
  const resetSession = useSessionStore((state) => state.reset);
  const loading = useSessionStore(selectLoading);
  const hasFetchedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const isAuthRoute = location.pathname === "/login";

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchProfile();
    }

    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange(() => {
        fetchProfile();
      });

      return () => {
        data.subscription.unsubscribe();
      };
    }

    return undefined;
  }, [fetchProfile]);

  const handleLogout = async () => {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      resetSession();
      navigate("/login");
    } finally {
      setSigningOut(false);
    }
  };

  if (isAuthRoute) {
    return <>{children}</>;
  }

  if (isSupabaseConfigured && !loading && !profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card/95 backdrop-blur flex items-center px-3 sticky top-0 z-40 sm:px-4">
            <SidebarTrigger className="text-foreground">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <div className="ml-4 flex-1">
              <h2 className="text-lg font-semibold text-foreground">Girl Scouts of the Philippines Ilocos Sur Council | Unified Business Suite</h2>
            </div>
            {isSupabaseConfigured && !loading && profile && (
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="capitalize">
                  {profile.role}
                </Badge>
                <span className="text-sm text-muted-foreground hidden md:inline">
                  {profile.full_name || profile.email}
                </span>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  Sign out
                </Button>
              </div>
            )}
          </header>
          <main className="flex-1 p-6 pt-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
