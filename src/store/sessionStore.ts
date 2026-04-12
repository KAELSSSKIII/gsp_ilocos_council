import { create } from "zustand";
import { persist } from "zustand/middleware";

import { authApi } from "@/lib/api";

export type UserRole = "admin" | "cashier" | "accountant" | "hr" | "inventory_clerk" | "manager";

export interface Profile {
  id: string;
  full_name: string;
  username: string;
  role: UserRole;
  branch?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

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
        set({ loading: true });

        try {
          const { profile } = await authApi.me();

          set({
            profile: profile as unknown as Profile,
            role: (profile?.role as UserRole | undefined) ?? undefined,
            branchId: (profile?.branch as string | null) ?? null,
            loading: false,
          });
        } catch {
          set({ profile: undefined, role: undefined, branchId: null, loading: false });
        }
      },
    }),
    {
      name: "gs-session-store",
      partialize: (state) => ({
        profile: state.profile,
        role: state.role,
        branchId: state.branchId,
      }),
    }
  )
);

export const selectProfile = (state: SessionState) => state.profile;
export const selectRole = (state: SessionState) => state.role;
export const selectLoading = (state: SessionState) => state.loading;
