import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { Database } from "@/integrations/supabase/types";
import { readLocalRentalBookings, LocalRentalBooking } from "@/modules/pos/utils/rentalBookingsStorage";
import { demoProducts } from "@/utils/demo-data";
import { ReceiptData } from "@/modules/pos/types";

type RentalSpaceRow = Database["public"]["Tables"]["rental_spaces"]["Row"];
type RentalBookingRow = Database["public"]["Tables"]["rental_bookings"]["Row"];

export type RentalSpaceSummary = Pick<
  RentalSpaceRow,
  "id" | "name" | "rental_type" | "product_id" | "base_rate" | "rate_unit" | "is_active"
>;

export type RentalBookingSummary = Pick<
  RentalBookingRow,
  "id" | "rental_space_id" | "booking_date" | "status" | "sale_id" | "notes" | "created_at" | "updated_at"
> & {
  customer_name?: string | null;
};

const demoRentalSpaces: RentalSpaceSummary[] = [
  {
    id: "demo-space-main-hall",
    name: "Main Function Hall",
    rental_type: "hall",
    product_id: "demo-hall-rental",
    base_rate: 1500,
    rate_unit: "per_day",
    is_active: true,
  },
  {
    id: "demo-space-meeting-room",
    name: "Meeting Room",
    rental_type: "room",
    product_id: "demo-room-rental",
    base_rate: 800,
    rate_unit: "per_day",
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
  customer_name: booking.notes ?? null,
});

const fetchRentalSpaces = async (): Promise<RentalSpaceSummary[]> => {
  const { data, error } = await supabase
    .from("rental_spaces")
    .select("id,name,rental_type,product_id,base_rate,rate_unit,is_active")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RentalSpaceSummary[];
};

const fetchRentalBookings = async (): Promise<RentalBookingSummary[]> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() - 30);
  const { data, error } = await supabase
    .from("rental_bookings")
    .select("id,rental_space_id,booking_date,status,sale_id,notes,created_at,updated_at")
    .gte("booking_date", minDate.toISOString().slice(0, 10))
    .order("booking_date", { ascending: true });
  if (error) throw error;
  const bookings = (data ?? []) as RentalBookingRow[];
  const saleIds = Array.from(
    new Set(
      bookings
        .map((booking) => booking.sale_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  let receiptMap = new Map<string, ReceiptData>();
  if (saleIds.length) {
    const { data: receipts, error: receiptsError } = await supabase
      .from("sale_receipts")
      .select("sale_id,payload")
      .in("sale_id", saleIds);
    if (receiptsError) throw receiptsError;
    (receipts ?? []).forEach((record: any) => {
      if (record?.sale_id && record?.payload) {
        receiptMap.set(record.sale_id, record.payload as ReceiptData);
      }
    });
  }

  return bookings.map((booking) => ({
    id: booking.id,
    rental_space_id: booking.rental_space_id,
    booking_date: booking.booking_date,
    status: booking.status,
    sale_id: booking.sale_id ?? null,
    notes: booking.notes ?? null,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
    customer_name:
      (booking.sale_id ? receiptMap.get(booking.sale_id)?.memberName ?? null : null) ??
      booking.notes ??
      null,
  }));
};

const ensureDemoSpaces = () => {
  const rentalProductIds = new Set(
    demoProducts
      .filter((product) => product.category?.toLowerCase().includes("rental"))
      .map((product) => product.id)
  );
  return demoRentalSpaces.map((space, index) => ({
    ...space,
    product_id: space.product_id && rentalProductIds.has(space.product_id) ? space.product_id : Array.from(rentalProductIds)[index] ?? null,
  }));
};

export function useRentalAvailability() {
  const queryClient = useQueryClient();

  const {
    data: spacesData,
    isLoading: loadingSpaces,
    refetch: refetchSpaces,
  } = useSupabaseQuery(["rental-spaces"], fetchRentalSpaces, { enabled: isSupabaseConfigured });

  const {
    data: bookingsData,
    isLoading: loadingBookings,
    refetch: refetchBookings,
  } = useSupabaseQuery(["rental-bookings"], fetchRentalBookings, { enabled: isSupabaseConfigured });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel("rental_bookings_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rental_bookings",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["rental-bookings"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel("rental_spaces_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rental_spaces",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["rental-spaces"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const spaces: RentalSpaceSummary[] = useMemo(() => {
    if (isSupabaseConfigured) {
      return spacesData ?? [];
    }
    return ensureDemoSpaces();
  }, [spacesData]);

  const bookings: RentalBookingSummary[] = useMemo(() => {
    if (isSupabaseConfigured) {
      return bookingsData ?? [];
    }
    return readLocalRentalBookings().map(normalizeLocalBooking);
  }, [bookingsData]);

  const confirmedBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "confirmed"),
    [bookings]
  );

  const bookingsBySpace = useMemo(() => {
    const map = new Map<string, RentalBookingSummary[]>();
    confirmedBookings.forEach((booking) => {
      const existing = map.get(booking.rental_space_id) ?? [];
      existing.push(booking);
      map.set(booking.rental_space_id, existing);
    });
    return map;
  }, [confirmedBookings]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, RentalBookingSummary[]>();
    confirmedBookings.forEach((booking) => {
      const existing = map.get(booking.booking_date) ?? [];
      existing.push(booking);
      map.set(booking.booking_date, existing);
    });
    return map;
  }, [confirmedBookings]);

  const bookedDateSet = useMemo(() => {
    const set = new Set<string>();
    confirmedBookings.forEach((booking) => set.add(booking.booking_date));
    return set;
  }, [confirmedBookings]);

  return {
    spaces,
    bookings,
    confirmedBookings,
    bookingsBySpace,
    bookingsByDate,
    bookedDateSet,
    isSupabaseConfigured,
    isLoading: loadingSpaces || loadingBookings,
    refetchSpaces,
    refetchBookings,
  };
}


