import { useMemo } from "react";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

type Extracted<T> = T extends () => infer R ? R : never;

interface Options<T> {
  data: T | undefined;
  demoData: T;
  reason?: string;
}

export function useDemoFallback<T>({ data, demoData, reason }: Options<T>) {
  const result = useMemo(() => {
    if (!isSupabaseConfigured) {
      if (import.meta.env.DEV && reason) {
        console.info(`[demo] ${reason}`);
      }
      return demoData;
    }

    if (data === undefined || data === null) {
      return demoData;
    }

    return data;
  }, [data, demoData, reason]);

  return result;
}



