import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import type { Matcher } from "react-day-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RentalBookingSummary, RentalSpaceSummary } from "@/modules/pos/hooks/useRentalAvailability";
import { formatCurrency } from "@/utils/format";

type RentalPickerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: RentalSpaceSummary[];
  bookingsBySpace: Map<string, RentalBookingSummary[]>;
  onAddRental: (space: RentalSpaceSummary, rentalDate: string) => void;
};

export function RentalPickerSheet({
  open,
  onOpenChange,
  spaces,
  bookingsBySpace,
  onAddRental,
}: RentalPickerSheetProps) {
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const activeSpaces = useMemo(
    () => spaces.filter((space) => space.is_active && space.product_id),
    [spaces]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Rental Booking</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a hall or room, choose an available date, then add it to the cart for checkout.
          </p>

          <ScrollArea className="h-[calc(100vh-10rem)] pr-3">
            <div className="space-y-4 pb-8">
              {activeSpaces.map((space) => {
                const bookings = bookingsBySpace.get(space.id) ?? [];
                const bookedDateObjects = bookings.map((booking) => {
                  const date = new Date(booking.booking_date);
                  date.setHours(0, 0, 0, 0);
                  return date;
                });
                const selectedValue = selectedDates[space.id];
                const selectedDate = selectedValue ? new Date(selectedValue) : undefined;

                return (
                  <Card key={space.id} className="border-emerald-200/80">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground">{space.name}</h3>
                            <Badge variant="secondary" className="capitalize">
                              {space.rental_type}
                            </Badge>
                          </div>
                          {space.description ? (
                            <p className="text-sm text-muted-foreground">{space.description}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {space.rate_unit.replaceAll("_", " ")}
                            </span>
                            {space.capacity ? (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" />
                                Capacity {space.capacity}
                              </span>
                            ) : null}
                            <span>{formatCurrency(Number(space.base_rate))}</span>
                          </div>
                        </div>
                        <Badge variant={bookings.length ? "outline" : "secondary"}>
                          {bookings.length} booking{bookings.length === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="justify-between sm:min-w-[240px]">
                              <span>
                                {selectedValue ? format(new Date(selectedValue), "PPP") : "Select rental date"}
                              </span>
                              <CalendarDays className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={selectedDate}
                              onSelect={(date) => {
                                if (!date) return;
                                const normalized = new Date(date);
                                normalized.setHours(0, 0, 0, 0);
                                setSelectedDates((current) => ({
                                  ...current,
                                  [space.id]: format(normalized, "yyyy-MM-dd"),
                                }));
                              }}
                              disabled={[{ before: today }, bookedDateObjects] as Matcher[]}
                              modifiers={{ booked: bookedDateObjects }}
                              modifiersClassNames={{
                                booked: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>

                        <Button
                          disabled={!selectedValue || !space.product_id}
                          onClick={() => selectedValue && onAddRental(space, selectedValue)}
                        >
                          Add Rental
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {activeSpaces.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No active rental spaces are configured yet.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
