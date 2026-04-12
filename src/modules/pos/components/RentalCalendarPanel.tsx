import { useMemo, useState } from "react";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfWeek,
} from "date-fns";
import {
  Building2,
  CalendarRange,
  CreditCard,
  Search,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useRentalAvailability, RentalBookingSummary } from "@/modules/pos/hooks/useRentalAvailability";
import { formatCurrency } from "@/utils/format";
import { RentalBalancePaymentDialog } from "./RentalBalancePaymentDialog";

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
  const { spaces, confirmedBookings, isLoading, refetchBookings } =
    useRentalAvailability();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [spaceFilter, setSpaceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentDialogBooking, setPaymentDialogBooking] = useState<RentalBookingSummary | null>(null);

  const spacesMap = useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const activeSpaces = useMemo(() => spaces.filter((space) => space.is_active !== false), [spaces]);

  const paymentBadge = (booking: RentalBookingSummary) => {
    if (booking.total_amount == null) return null;

    const balance = (booking.total_amount ?? 0) - (booking.initial_payment ?? 0);

    if (booking.payment_status === "paid") {
      return (
        <Badge className="rounded-full border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
          Paid in full
        </Badge>
      );
    }

    if (booking.payment_status === "partial") {
      return (
        <Badge className="rounded-full border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
          Balance {formatCurrency(balance)}
        </Badge>
      );
    }

    return (
      <Badge variant="destructive" className="rounded-full px-2.5 py-1 text-[10px] font-semibold">
        Unpaid
      </Badge>
    );
  };

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

  const filteredBookings = useMemo(() => {
    return confirmedBookings.filter((booking) => {
      if (spaceFilter !== "all" && booking.rental_space_id !== spaceFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const space = spacesMap.get(booking.rental_space_id);
      const haystack = [
        booking.customer_name,
        booking.notes,
        booking.status,
        booking.booking_date,
        space?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [confirmedBookings, normalizedSearch, spaceFilter, spacesMap]);

  const filteredBookingsByDate = useMemo(() => {
    const map = new Map<string, RentalBookingSummary[]>();

    filteredBookings.forEach((booking) => {
      const key = booking.booking_date.slice(0, 10);
      const existing = map.get(key) ?? [];
      existing.push(booking);
      map.set(key, existing);
    });

    return map;
  }, [filteredBookings]);

  const filteredBookedDateSet = useMemo(() => {
    const set = new Set<string>();
    filteredBookings.forEach((booking) => set.add(booking.booking_date));
    return set;
  }, [filteredBookings]);

  const modifiers = useMemo(
    () => ({
      booked: Array.from(filteredBookedDateSet).map(toDate),
      today: [new Date()],
    }),
    [filteredBookedDateSet]
  );

  const modifiersClassNames = useMemo(
    () => ({
      booked: "bg-rose-500 text-white hover:bg-rose-500/90 focus:bg-rose-500",
      today: "ring-2 ring-sky-400 ring-offset-2",
    }),
    []
  );

  const calendarClassNames = useMemo(
    () => ({
      months: "flex w-full flex-col gap-4",
      month: "space-y-4",
      caption: "flex items-center justify-center pt-1 relative",
      caption_label: "text-sm font-semibold text-emerald-950",
      nav: "space-x-1 flex items-center",
      table: "w-full border-collapse space-y-1",
      head_row: "flex",
      head_cell: "w-10 text-center text-[11px] font-semibold text-emerald-700/70",
      row: "mt-2 flex w-full justify-between",
      cell: "relative h-10 w-10 p-0 text-center text-sm",
      day: cn(
        "h-10 w-10 rounded-xl border border-emerald-100 bg-emerald-50 text-[12px] font-semibold text-emerald-800 shadow-sm transition-all",
        "hover:bg-emerald-100 hover:text-emerald-900",
        "aria-selected:border-emerald-600 aria-selected:bg-emerald-600 aria-selected:text-white"
      ),
      day_outside: "bg-transparent text-muted-foreground opacity-35 shadow-none",
    }),
    []
  );

  const focusDate = hoveredDate ?? selectedDate;
  const focusDateISO = format(focusDate, "yyyy-MM-dd");
  const focusedBookings = filteredBookingsByDate.get(focusDateISO) ?? [];
  const focusLabel = format(focusDate, "EEEE, MMMM d, yyyy");

  const bookingsForView = useMemo(() => {
    const range = viewRange;

    return filteredBookings
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
  }, [filteredBookings, selectedDate, spacesMap, viewMode, viewRange]);

  const bookedToday = useMemo(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    return filteredBookingsByDate.get(todayKey)?.length ?? 0;
  }, [filteredBookingsByDate]);

  const partialPayments = useMemo(
    () => filteredBookings.filter((booking) => booking.payment_status === "partial").length,
    [filteredBookings]
  );

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weeklyOccupancy = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const key = format(date, "yyyy-MM-dd");
      const count = filteredBookingsByDate.get(key)?.length ?? 0;
      return {
        key,
        label: format(date, "EEE"),
        dayNumber: format(date, "d"),
        count,
      };
    });
  }, [filteredBookingsByDate, weekStart]);

  const totalSpaces = activeSpaces.length;
  const availableOnFocus = Math.max(totalSpaces - focusedBookings.length, 0);

  return (
    <Card
      id={id}
      className={cn(
        "w-full rounded-[2rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,rgba(214,245,226,0.95),rgba(255,255,255,0.92)_38%,rgba(240,249,244,0.98)_100%)] shadow-xl",
        className
      )}
    >
      <CardHeader className="space-y-5 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold text-emerald-950">Rental Schedule Board</CardTitle>
            <p className="max-w-2xl text-sm leading-6 text-emerald-900/70">
              Track room and hall reservations with clearer occupancy, customer visibility, and payment follow-up.
            </p>
          </div>
          <Select value={viewMode} onValueChange={(value: ViewMode) => setViewMode(value)}>
            <SelectTrigger className="h-11 w-full rounded-2xl border-emerald-200 bg-white/85 text-emerald-900 shadow-sm lg:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-emerald-200">
              {viewModeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Active Spaces"
            value={`${totalSpaces}`}
            caption="Rooms and halls available for booking"
            accent="emerald"
            icon={<Building2 className="h-4 w-4" />}
          />
          <SummaryCard
            title="Booked Today"
            value={`${bookedToday}`}
            caption="Confirmed reservations on today's board"
            accent="rose"
            icon={<CalendarRange className="h-4 w-4" />}
          />
          <SummaryCard
            title="Partial Payments"
            value={`${partialPayments}`}
            caption="Bookings that still need balance collection"
            accent="amber"
            icon={<CreditCard className="h-4 w-4" />}
          />
          <SummaryCard
            title="Visible Bookings"
            value={`${filteredBookings.length}`}
            caption="Filtered confirmed reservations in scope"
            accent="sky"
            icon={<Users className="h-4 w-4" />}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-800/50" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search customer, notes, status, date, or rental space"
              className="h-11 rounded-2xl border-white/70 bg-white/90 pl-10 shadow-sm"
            />
          </div>
          <Select value={spaceFilter} onValueChange={setSpaceFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-white/70 bg-white/90 shadow-sm">
              <SelectValue placeholder="All rental spaces" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-emerald-200">
              <SelectItem value="all">All rental spaces</SelectItem>
              {activeSpaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
          <LegendPill dotClassName="bg-rose-500" label="Booked date" />
          <LegendPill dotClassName="bg-emerald-500" label="Available date" />
          <LegendPill dotClassName="bg-sky-400" label="Today marker" />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-emerald-200/70 bg-white/85 p-4 shadow-sm">
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
                className="flex flex-col items-center"
              />
            </div>

            <div className="rounded-[1.75rem] border border-emerald-200/70 bg-white/80 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-950">Weekly occupancy snapshot</p>
                  <p className="text-xs text-emerald-900/60">See which days are light or packed this week.</p>
                </div>
                <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-800">
                  Week of {format(weekStart, "MMM d")}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-2">
                {weeklyOccupancy.map((day) => (
                  <div
                    key={day.key}
                    className={cn(
                      "rounded-2xl border p-3 text-center shadow-sm transition",
                      day.count > 0
                        ? "border-rose-200 bg-rose-50/80 text-rose-700"
                        : "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">{day.label}</p>
                    <p className="mt-2 text-lg font-semibold">{day.dayNumber}</p>
                    <p className="mt-1 text-[11px]">{day.count} booked</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-emerald-200/70 bg-white/85 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-950">{focusLabel}</p>
                  <p className="text-xs text-emerald-900/60">Selected day details and customer visibility</p>
                </div>
                <Badge
                  variant={focusedBookings.length > 0 ? "secondary" : "outline"}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]",
                    focusedBookings.length > 0
                      ? "border-rose-200 bg-rose-100 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  )}
                >
                  {focusedBookings.length > 0 ? `${focusedBookings.length} booked` : "Open day"}
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniStat label="Booked spaces" value={`${focusedBookings.length}`} />
                <MiniStat label="Available spaces" value={`${availableOnFocus}`} />
              </div>

              <div className="mt-4 space-y-3">
                {focusedBookings.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
                    No confirmed bookings on this date. This day is open for reservations.
                  </div>
                ) : (
                  focusedBookings.map((booking) => {
                    const space = spacesMap.get(booking.rental_space_id);
                    const spaceName = space?.name ?? "Rental space";

                    return (
                      <div
                        key={booking.id}
                        className="rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-emerald-950">{spaceName}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-emerald-700/60">
                              {space?.rental_type ?? "space"}
                            </p>
                          </div>
                          <Badge className="rounded-full border-rose-200 bg-rose-100 text-rose-700">
                            {booking.status}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-1 text-sm text-emerald-900/80">
                          <p>Customer: {booking.customer_name ?? booking.notes ?? "Pending customer name"}</p>
                          <p>Booking date: {format(toDate(booking.booking_date), "MMM d, yyyy")}</p>
                          {booking.notes ? <p>Notes: {booking.notes}</p> : null}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {paymentBadge(booking)}
                          {booking.payment_status === "partial" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                              onClick={() => setPaymentDialogBooking(booking)}
                            >
                              Collect balance
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-950">Bookings in current view</p>
              <p className="text-xs text-emerald-900/60">
                {viewMode === "month"
                  ? "Showing bookings inside the selected month."
                  : viewMode === "week"
                    ? "Showing bookings inside the selected week."
                    : "Showing bookings for the selected day."}
              </p>
            </div>
            <Badge variant="outline" className="rounded-full border-emerald-200 bg-white/80 text-emerald-800">
              {isLoading ? "Loading..." : `${bookingsForView.length} results`}
            </Badge>
          </div>

          <ScrollArea className="max-h-[26rem] rounded-[1.75rem] border border-emerald-200/70 bg-white/80 shadow-inner">
            <div className="space-y-3 p-4">
              {bookingsForView.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-800">
                  {isLoading
                    ? "Fetching the latest rental schedule..."
                    : "No bookings match the current view and filters."}
                </div>
              ) : (
                bookingsForView.map(({ booking, space, bookingDate }) => {
                  const spaceName = space?.name ?? "Rental space";

                  return (
                    <div
                      key={booking.id}
                      className="rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-white to-emerald-50/40 p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-emerald-950">{spaceName}</p>
                            <Badge variant="outline" className="rounded-full border-emerald-200 text-emerald-800">
                              {format(bookingDate, "MMM d")}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-sm text-emerald-900/75">
                            <p>Customer: {booking.customer_name ?? booking.notes ?? "Pending customer name"}</p>
                            <p>Status: {booking.status}</p>
                            {space?.capacity ? <p>Capacity: {space.capacity}</p> : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {paymentBadge(booking)}
                          {booking.payment_status === "partial" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                              onClick={() => setPaymentDialogBooking(booking)}
                            >
                              Collect balance
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>

      {paymentDialogBooking && (
        <RentalBalancePaymentDialog
          booking={paymentDialogBooking}
          spaceName={spacesMap.get(paymentDialogBooking.rental_space_id)?.name ?? "Rental space"}
          open={Boolean(paymentDialogBooking)}
          onClose={() => setPaymentDialogBooking(null)}
          onSuccess={async () => {
            setPaymentDialogBooking(null);
            await refetchBookings();
          }}
        />
      )}
    </Card>
  );
}

function SummaryCard({
  title,
  value,
  caption,
  accent,
  icon,
}: {
  title: string;
  value: string;
  caption: string;
  accent: "emerald" | "rose" | "amber" | "sky";
  icon: React.ReactNode;
}) {
  const accentClasses = {
    emerald: "border-emerald-200 bg-emerald-50/85 text-emerald-800",
    rose: "border-rose-200 bg-rose-50/85 text-rose-700",
    amber: "border-amber-200 bg-amber-50/85 text-amber-700",
    sky: "border-sky-200 bg-sky-50/85 text-sky-700",
  }[accent];

  return (
    <div className={cn("rounded-[1.5rem] border p-4 shadow-sm", accentClasses)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-2 shadow-sm">{icon}</div>
      </div>
      <p className="mt-3 text-xs leading-5 opacity-80">{caption}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700/70">{label}</p>
      <p className="mt-2 text-xl font-semibold text-emerald-950">{value}</p>
    </div>
  );
}

function LegendPill({ dotClassName, label }: { dotClassName: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1.5 text-emerald-900/80 shadow-sm">
      <span className={cn("h-2.5 w-2.5 rounded-full", dotClassName)} />
      {label}
    </span>
  );
}
