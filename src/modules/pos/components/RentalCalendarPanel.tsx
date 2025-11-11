import { useMemo, useState } from "react";
import { format, isSameDay, isSameMonth, isWithinInterval, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useRentalAvailability, RentalBookingSummary } from "@/modules/pos/hooks/useRentalAvailability";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "week" | "month";

const viewModeOptions: Array<{ value: ViewMode; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const toDate = (isoDate: string) => {
  const parsed = parseISO(isoDate);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

interface RentalCalendarPanelProps {
  id?: string;
  className?: string;
}

export function RentalCalendarPanel({ id, className }: RentalCalendarPanelProps) {
  const { spaces, confirmedBookings, bookingsByDate, bookedDateSet, isLoading } = useRentalAvailability();
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const spacesMap = useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces]);

  const modifiers = useMemo(
    () => ({
      booked: Array.from(bookedDateSet).map(toDate),
      today: [new Date()],
    }),
    [bookedDateSet]
  );

  const modifiersClassNames = useMemo(
    () => ({
      booked:
        "bg-red-500 text-red-50 hover:bg-red-500/90 focus:bg-red-500 focus:text-white",
      today: "ring-2 ring-sky-400 ring-offset-2",
    }),
    []
  );

  const calendarClassNames = useMemo(
    () => ({
      day: cn(
        "relative flex h-10 w-10 items-center justify-center rounded-xl text-[12px] font-semibold transition-all duration-150",
        "bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm",
        "hover:bg-emerald-100 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500",
        "aria-selected:bg-emerald-600 aria-selected:text-emerald-50 aria-selected:border-emerald-500 aria-selected:shadow-md"
      ),
      head_cell: "text-muted-foreground w-10 text-center text-[11px] font-medium",
      row: "flex w-full justify-between",
      table: "w-full",
    }),
    []
  );

  const viewRange = useMemo(() => {
    if (viewMode === "week") {
      return {
        start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
        end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
      };
    }
    if (viewMode === "day") {
      return {
        start: selectedDate,
        end: selectedDate,
      };
    }
    return null;
  }, [selectedDate, viewMode]);

  const bookingsForView = useMemo(() => {
    const range = viewRange;
    return confirmedBookings
      .map((booking) => ({
        booking,
        space: spacesMap.get(booking.rental_space_id),
        bookingDate: toDate(booking.booking_date),
      }))
      .filter(({ bookingDate }) => {
        if (!range) {
          return isSameMonth(bookingDate, selectedDate);
        }
        if (viewMode === "day") {
          return isSameDay(bookingDate, selectedDate);
        }
        return isWithinInterval(bookingDate, range);
      })
      .sort((a, b) => a.bookingDate.getTime() - b.bookingDate.getTime());
  }, [confirmedBookings, spacesMap, selectedDate, viewMode, viewRange]);

  const focusDate = hoveredDate ?? selectedDate;
  const focusDateISO = focusDate ? format(focusDate, "yyyy-MM-dd") : null;
  const focusedBookings: RentalBookingSummary[] = focusDateISO ? bookingsByDate.get(focusDateISO) ?? [] : [];
  const focusLabel = focusDate ? format(focusDate, "EEEE, MMMM d") : "Select a date";

  const totalSpaces = spaces.filter((space) => space.is_active !== false).length;
  const isFocusFullyBooked = totalSpaces > 0 && focusedBookings.length >= totalSpaces;

  return (
    <Card
      id={id}
      className={cn(
        "w-full rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/60 to-white shadow-xl transition-all duration-200",
        className
      )}
    >
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold tracking-tight text-emerald-900 md:text-xl">
              Rental Calendar
            </CardTitle>
            <p className="text-xs text-emerald-700/80 md:text-sm">Review availability and upcoming reservations.</p>
          </div>
          <Select value={viewMode} onValueChange={(value: ViewMode) => setViewMode(value)}>
            <SelectTrigger className="h-10 w-full rounded-xl border-emerald-200 bg-white text-emerald-700 shadow-sm transition hover:border-emerald-300 md:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="bottom" className="max-h-60 rounded-xl border-emerald-200 shadow-lg">
              {viewModeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 text-xs font-medium text-emerald-800 sm:grid-cols-2 sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-600 shadow-sm">
              🔴 Booked
            </span>
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 shadow-sm">
              🟢 Available
            </span>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <span className="text-emerald-700/70">Today</span>
            <span className="h-2 w-2 rounded-full bg-sky-400 shadow-sm" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl border border-emerald-200/70 bg-white p-4 shadow-sm transition">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              const normalized = new Date(date);
              normalized.setHours(0, 0, 0, 0);
              setSelectedDate(normalized);
              setHoveredDate(null);
            }}
            onDayMouseEnter={(day) => {
              const normalized = new Date(day);
              normalized.setHours(0, 0, 0, 0);
              setHoveredDate(normalized);
            }}
            onDayMouseLeave={() => setHoveredDate(null)}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            classNames={calendarClassNames}
            className="flex flex-col items-center gap-4 animate-fade-in"
          />
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-emerald-900 md:text-base">{focusLabel}</p>
            <Badge
              variant={isFocusFullyBooked ? "destructive" : focusedBookings.length ? "secondary" : "outline"}
              className="rounded-full px-3 py-1 text-xs uppercase tracking-wide"
            >
              {focusedBookings.length ? `${focusedBookings.length} booked` : "Available"}
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {focusedBookings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-white/80 p-3 text-xs text-emerald-700 shadow-sm">
                <span>🟢</span>
                <span>No bookings recorded for this date. Slots are open.</span>
              </div>
            ) : (
              focusedBookings.map((booking) => {
                const space = spacesMap.get(booking.rental_space_id);
                return (
                  <div
                    key={booking.id}
                    className="rounded-xl border border-emerald-200/70 bg-white p-3 text-xs text-emerald-900 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-emerald-900">{space?.name ?? "Rental space"}</p>
                      <Badge variant="destructive" className="rounded-full px-2 text-[10px] uppercase tracking-wide">
                        Booked
                      </Badge>
                    </div>
                    <div className="mt-1 space-y-1 text-[11px] text-emerald-800">
                      <p>Renter: {booking.customer_name ?? booking.notes ?? "Pending"}</p>
                      <p>Status: {booking.status}</p>
                      {booking.notes ? <p>Notes: {booking.notes}</p> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-emerald-100/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80 shadow-inner">
            <span>Rentals in view</span>
            <span>{isLoading ? "Loading…" : `${bookingsForView.length}`}</span>
          </div>
          <ScrollArea className="max-h-56 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 shadow-inner">
            <div className="space-y-3 p-3">
              {bookingsForView.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  <span>🕓</span>
                  <span>{isLoading ? "Fetching latest schedule…" : "No rentals scheduled for the selected range."}</span>
                </div>
              ) : (
                bookingsForView.map(({ booking, space, bookingDate }) => (
                  <div
                    key={booking.id}
                    className="rounded-xl border border-emerald-200 bg-white p-3 text-xs text-emerald-900 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-emerald-900">{space?.name ?? "Rental space"}</p>
                      <Badge variant="outline" className="rounded-full border-emerald-200 px-3 text-[11px] text-emerald-800">
                        {format(bookingDate, "MMM d")}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-emerald-800">
                      <p>Renter: {booking.customer_name ?? booking.notes ?? "Pending"}</p>
                      <p>Status: {booking.status}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

