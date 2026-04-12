import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { readLocalRentalBookings, LocalRentalBooking } from "@/modules/pos/utils/rentalBookingsStorage";
import { demoProducts } from "@/utils/demo-data";
import type { ReceiptData } from "@/modules/pos/types";

// ─── Types (replaces Database["public"]["Tables"][*]["Row"]) ──────────────────

export type RentalSpaceSummary = {
  id: string;
  name: string;
  rental_type: "hall" | "room";
  product_id: string | null;
  product_category_id?: string | null;
  base_rate: number;
  rate_unit: string;
  description?: string | null;
  capacity?: number | null;
  is_active: boolean;
};

export type RentalBookingSummary = {
  id: string;
  rental_space_id: string;
  booking_date: string;
  status: string;
  sale_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Payment tracking — NULL for bookings created before this feature
  total_amount: number | null;
  initial_payment: number | null;
  payment_status: "paid" | "partial" | "unpaid" | null;
  balance_sale_id: string | null;
  // Enriched client-side
  customer_name?: string | null;
};

// ─── Demo data fallback ───────────────────────────────────────────────────────

const demoRentalSpaces: RentalSpaceSummary[] = [
  {
    id: "demo-space-main-hall",
    name: "Main Function Hall",
    rental_type: "hall",
    product_id: "demo-hall-rental",
    product_category_id: null,
    base_rate: 1500,
    rate_unit: "per_day",
    description: "Large event-ready hall.",
    capacity: 150,
    is_active: true,
  },
  {
    id: "demo-space-meeting-room",
    name: "Meeting Room",
    rental_type: "room",
    product_id: "demo-room-rental",
    product_category_id: null,
    base_rate: 800,
    rate_unit: "per_day",
    description: "Private meeting room.",
    capacity: 30,
    is_active: true,
  },
];

const normalizeLocalBooking = (booking: LocalRentalBooking): RentalBookingSummary => ({
  id: booking.id,
  rental_space_id: booking.rental_space_id,
  booking_date: booking.booking_date,
  status: booking.status,
  sale_id: booking.sale_id ?? null,
  notes: booking.notes ?? null,
  created_at: booking.created_at,
  updated_at: booking.updated_at,
  total_amount: null,
  initial_payment: null,
  payment_status: null,
  balance_sale_id: null,
  customer_name: booking.notes ?? null,
});

const ensureDemoSpaces = (): RentalSpaceSummary[] => {
  const rentalProductIds = new Set(
    demoProducts
      .filter((p) => p.category?.toLowerCase().includes("rental"))
      .map((p) => p.id)
  );
  return demoRentalSpaces.map((space, index) => ({
    ...space,
    product_id:
      space.product_id && rentalProductIds.has(space.product_id)
        ? space.product_id
        : Array.from(rentalProductIds)[index] ?? null,
  }));
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const fetchRentalSpaces = async (): Promise<RentalSpaceSummary[]> => {
  try {
    const { spaces } = await api.get<{ spaces: RentalSpaceSummary[] }>("/rental/spaces");
    return spaces ?? [];
  } catch {
    return [];
  }
};

const fetchRentalBookings = async (): Promise<RentalBookingSummary[]> => {
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - 30);
  const from = minDate.toISOString().slice(0, 10);

  let bookings: Omit<RentalBookingSummary, "customer_name">[] = [];
  try {
    const response = await api.get<{
      bookings: Omit<RentalBookingSummary, "customer_name">[];
    }>(`/rental/bookings?from=${from}`);
    bookings = response.bookings ?? [];
  } catch {
    return readLocalRentalBookings().map(normalizeLocalBooking);
  }

  const rawBookings = bookings ?? [];

  // Enrich bookings with customer name from sale receipts
  const saleIds = Array.from(
    new Set(rawBookings.map((b) => b.sale_id).filter((id): id is string => Boolean(id)))
  );

  let receiptMap = new Map<string, ReceiptData>();
  if (saleIds.length) {
    try {
      const { receipts } = await api.get<{ receipts: { sale_id: string; payload: ReceiptData }[] }>(
        `/sales/receipts?sale_ids=${saleIds.join(",")}`
      );
      (receipts ?? []).forEach((r) => {
        if (r?.sale_id && r?.payload) receiptMap.set(r.sale_id, r.payload);
      });
    } catch {
      receiptMap = new Map<string, ReceiptData>();
    }
  }

  return rawBookings.map((b) => ({
    ...b,
    customer_name:
      (b.sale_id ? (receiptMap.get(b.sale_id) as ReceiptData | undefined)?.memberName ?? null : null) ??
      b.notes ??
      null,
  }));
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRentalAvailability() {
  // Polling every 15 seconds replaces Supabase Realtime channel subscriptions
  const POLL_INTERVAL = 15_000;

  const {
    data: spacesData,
    isLoading: loadingSpaces,
    refetch: refetchSpaces,
  } = useQuery({
    queryKey: ["rental-spaces"],
    queryFn: fetchRentalSpaces,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
    refetchInterval: POLL_INTERVAL,
  });

  const {
    data: bookingsData,
    isLoading: loadingBookings,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ["rental-bookings"],
    queryFn: fetchRentalBookings,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: true,
    refetchInterval: POLL_INTERVAL,
  });

  const spaces: RentalSpaceSummary[] = useMemo(
    () => spacesData ?? ensureDemoSpaces(),
    [spacesData]
  );

  const bookings: RentalBookingSummary[] = useMemo(
    () => bookingsData ?? readLocalRentalBookings().map(normalizeLocalBooking),
    [bookingsData]
  );

  const confirmedBookings = useMemo(
    () => bookings.filter((b) => b.status === "confirmed"),
    [bookings]
  );

  const bookingsBySpace = useMemo(() => {
    const map = new Map<string, RentalBookingSummary[]>();
    confirmedBookings.forEach((b) => {
      const existing = map.get(b.rental_space_id) ?? [];
      existing.push(b);
      map.set(b.rental_space_id, existing);
    });
    return map;
  }, [confirmedBookings]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, RentalBookingSummary[]>();
    confirmedBookings.forEach((b) => {
      const key = b.booking_date.slice(0, 10); // normalize "2026-03-06T00:00:00.000Z" → "2026-03-06"
      const existing = map.get(key) ?? [];
      existing.push(b);
      map.set(key, existing);
    });
    return map;
  }, [confirmedBookings]);

  const bookedDateSet = useMemo(() => {
    const set = new Set<string>();
    confirmedBookings.forEach((b) => set.add(b.booking_date));
    return set;
  }, [confirmedBookings]);

  return {
    spaces,
    bookings,
    confirmedBookings,
    bookingsBySpace,
    bookingsByDate,
    bookedDateSet,
    isSupabaseConfigured: true, // kept for API compatibility with existing consumers
    isLoading: loadingSpaces || loadingBookings,
    refetchSpaces,
    refetchBookings,
  };
}
