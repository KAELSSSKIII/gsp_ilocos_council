import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Database } from "@/integrations/supabase/types";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type UserRole = "admin" | "cashier" | "accountant" | "hr" | "inventory_clerk" | "manager";

type SessionState = {
  profile?: Profile;
  role?: UserRole;
  branchId?: string | null;
  loading: boolean;
  setProfile: (profile: Profile | undefined) => void;
  setRole: (role: UserRole | undefined) => void;
  setBranch: (branchId: string | null) => void;
  setLoading: (value: boolean) => void;
  reset: () => void;
  fetchProfile: () => Promise<void>;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      profile: undefined,
      role: undefined,
      branchId: null,
      loading: true,
      setProfile: (profile) => set({ profile }),
      setRole: (role) => set({ role }),
      setBranch: (branchId) => set({ branchId }),
      setLoading: (value) => set({ loading: value }),
      reset: () => set({ profile: undefined, role: undefined, branchId: null, loading: false }),
      fetchProfile: async () => {
        if (!isSupabaseConfigured) {
          set({ profile: undefined, role: undefined, branchId: null, loading: false });
          return;
        }

        set({ loading: true });

        try {
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();

          if (userError) throw userError;

          if (!user) {
            set({ profile: undefined, role: undefined, branchId: null, loading: false });
            return;
          }

          const { data: profile, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;

          set({
            profile: profile ?? undefined,
            role: (profile?.role as UserRole | undefined) ?? undefined,
            branchId: profile?.branch ?? null,
            loading: false,
          });
        } catch (error) {
          console.error("Failed to fetch profile", error);
          set({ profile: undefined, role: undefined, branchId: null, loading: false });
        }
      },
    }),
    {
      name: "gs-session-store",
      partialize: (state) => ({ profile: state.profile, role: state.role, branchId: state.branchId }),
    }
  )
);

export const selectProfile = (state: SessionState) => state.profile;
export const selectRole = (state: SessionState) => state.role;
export const selectLoading = (state: SessionState) => state.loading;



