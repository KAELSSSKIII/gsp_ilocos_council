import { useEffect, useRef } from "react";
import api from "@/lib/api";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import type { POSCartItem } from "@/store/posStore";

async function upsertActiveCart(cart: POSCartItem[], _profileId: string, branch: string | null) {
  const { cart: existing } = await api.get<{ cart: { id: string } | null; items: unknown[] }>(
    "/carts/active"
  );

  if (cart.length === 0) {
    if (existing?.id) {
      await api.delete(`/carts/active/${existing.id}/items`);
      await api.delete(`/carts/active/${existing.id}`);
    }
    return;
  }

  let activeId = existing?.id;

  if (!activeId) {
    const { cart: created } = await api.post<{ cart: { id: string } }>("/carts/active", {
      branch,
    });
    activeId = created.id;
  } else {
    await api.delete(`/carts/active/${activeId}/items`);
  }

  const items = cart.map((item) => ({
    product_id: item.id,
    quantity: item.quantity,
    unit_price: item.price,
  }));

  if (items.length > 0) {
    await api.post(`/carts/active/${activeId}/items`, { items });
  }
}

export function useCartSync(cart: POSCartItem[]) {
  const profile = useSessionStore(selectProfile);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!profile?.id) return;

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
