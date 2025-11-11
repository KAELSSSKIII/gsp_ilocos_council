const LOCAL_RENTAL_BOOKINGS_KEY = "gsp-pos-rental-bookings";

export type LocalRentalBookingStatus = "confirmed" | "cancelled";

export interface LocalRentalBooking {
  id: string;
  rental_space_id: string;
  booking_date: string;
  status: LocalRentalBookingStatus;
  sale_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

const nowISO = () => new Date().toISOString();

export const readLocalRentalBookings = (): LocalRentalBooking[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_RENTAL_BOOKINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LocalRentalBooking[];
  } catch (error) {
    console.warn("Failed to read local rental bookings", error);
    return [];
  }
};

export const writeLocalRentalBookings = (bookings: LocalRentalBooking[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_RENTAL_BOOKINGS_KEY, JSON.stringify(bookings));
  } catch (error) {
    console.warn("Failed to persist local rental bookings", error);
  }
};

export const appendLocalRentalBooking = (input: Omit<LocalRentalBooking, "id" | "created_at" | "updated_at">) => {
  const existing = readLocalRentalBookings();
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-booking-${Date.now()}`;
  const timestamp = nowISO();
  const booking: LocalRentalBooking = {
    ...input,
    id,
    created_at: timestamp,
    updated_at: timestamp,
  };
  writeLocalRentalBookings([...existing, booking]);
  return booking;
};

export const updateLocalRentalBookingsForSale = (saleId: string | null, status: LocalRentalBookingStatus) => {
  const existing = readLocalRentalBookings();
  if (!existing.length) return;
  const updated = existing.map((booking) =>
    booking.sale_id === saleId
      ? {
          ...booking,
          status,
          updated_at: nowISO(),
        }
      : booking
  );
  writeLocalRentalBookings(updated);
};


