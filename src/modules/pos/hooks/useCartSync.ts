import { useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import type { POSCartItem } from "@/store/posStore";

async function upsertActiveCart(cart: POSCartItem[], profileId: string, branch: string | null) {
  const { data: existing, error: fetchError } = await supabase
    .from("active_carts")
    .select("id")
    .eq("created_by", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (cart.length === 0) {
    if (existing?.id) {
      await supabase.from("active_cart_items").delete().eq("active_cart_id", existing.id);
      await supabase.from("active_carts").delete().eq("id", existing.id);
    }
    return;
  }

  let activeId = existing?.id;

  if (!activeId) {
    const { data: created, error: createError } = await supabase
      .from("active_carts")
      .insert({
        created_by: profileId,
        branch,
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    activeId = created.id;
  } else {
    await supabase.from("active_cart_items").delete().eq("active_cart_id", activeId);
  }

  const payload = cart.map((item) => ({
    active_cart_id: activeId,
    product_id: item.id,
    quantity: item.quantity,
    unit_price: item.price,
  }));

  if (payload.length > 0) {
    const { error: insertError } = await supabase.from("active_cart_items").insert(payload);
    if (insertError) {
      throw insertError;
    }
  }
}

export function useCartSync(cart: POSCartItem[]) {
  const profile = useSessionStore(selectProfile);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.id) {
      return;
    }

    let isMounted = true;

    const sync = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;

      try {
        await upsertActiveCart(cart, profile.id, profile.branch ?? null);
      } catch (error) {
        console.error("Failed to sync cart state", error);
      } finally {
        if (isMounted) {
          syncingRef.current = false;
        }
      }
    };

    sync();

    return () => {
      isMounted = false;
    };
  }, [cart, profile?.id, profile?.branch]);
}

