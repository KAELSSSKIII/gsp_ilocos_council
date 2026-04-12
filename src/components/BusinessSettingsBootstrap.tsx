import { useEffect } from "react";

import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { usePOSStore } from "@/store/posStore";
import { fetchBusinessSettings } from "@/utils/businessSettings";

export function BusinessSettingsBootstrap() {
  const profile = useSessionStore(selectProfile);

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    void fetchBusinessSettings().then((settings) => {
      if (!cancelled) {
        usePOSStore.getState().setTaxRate(settings.taxRate);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  return null;
}
