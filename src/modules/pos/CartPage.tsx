import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { Matcher } from "react-day-picker";
import {
  Minus,
  Plus,
  Trash2,
  ArrowLeft,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { usePOSStore } from "@/store/posStore";
import { formatCurrency } from "@/utils/format";
import { useCartSync } from "@/modules/pos/hooks/useCartSync";
import Barcode from "react-barcode";
import { useRentalAvailability } from "@/modules/pos/hooks/useRentalAvailability";
import { format, parseISO } from "date-fns";
import { isRentalCartItem } from "@/modules/pos/utils/rental";

export function CartPage() {
  const navigate = useNavigate();

  const cart = usePOSStore((state) => state.cart);
  const removeItem = usePOSStore((state) => state.removeItem);
  const updateQuantity = usePOSStore((state) => state.updateQuantity);
  const setItemRentalDate = usePOSStore((state) => state.setItemRentalDate);

  const cartCount = cart.length;

  const {
    spaces: rentalSpaces,
    bookingsBySpace,
    isLoading: loadingRentalAvailability,
  } = useRentalAvailability();

  const rentalSpacesByProductId = useMemo(() => {
    const map = new Map<string, (typeof rentalSpaces)[number]>();
    rentalSpaces.forEach((space) => {
      if (space.product_id) map.set(space.product_id, space);
    });
    return map;
  }, [rentalSpaces]);

  const rentalSpacesById = useMemo(() => {
    const map = new Map<string, (typeof rentalSpaces)[number]>();
    rentalSpaces.forEach((space) => {
      map.set(space.id, space);
    });
    return map;
  }, [rentalSpaces]);

  const rentalCartItems = useMemo(
    () => cart.filter((item) => isRentalCartItem(item)),
    [cart]
  );

  const resolveRentalSpace = useCallback(
    (item: (typeof cart)[number]) => {
      if (!isRentalCartItem(item)) return null;
      if (item.rentalSpaceId) {
        return rentalSpacesById.get(item.rentalSpaceId) ?? null;
      }
      return rentalSpacesByProductId.get(item.id) ?? null;
    },
    [rentalSpacesById, rentalSpacesByProductId]
  );

  const hasBookingConflict = useMemo(
    () =>
      rentalCartItems.some((item) => {
        if (!item.rentalDate) return false;
        const space = resolveRentalSpace(item);
        if (!space) return false;
        return (bookingsBySpace.get(space.id) ?? []).some(
          (booking) => String(booking.booking_date).slice(0, 10) === item.rentalDate
        );
      }),
    [bookingsBySpace, rentalCartItems, resolveRentalSpace]
  );

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const normalizeDate = useCallback((value: string) => {
    const parsed = parseISO(value);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }, []);

  const formatRentalDate = useCallback(
    (value: string) => {
      try {
        return format(normalizeDate(value), "PP");
      } catch {
        return value;
      }
    },
    [normalizeDate]
  );

  const handleQuantityInputChange = useCallback(
    (id: string, value: string) => {
      const target = cart.find((item) => item.id === id);
      if (target) {
        if (isRentalCartItem(target)) return;
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return;
      updateQuantity(id, parsed);
    },
    [cart, updateQuantity]
  );

  useCartSync(cart);

  return (
    <div className="space-y-6 pb-24">
      <header className="sticky top-[64px] z-30 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Cart Overview</h1>
            <p className="text-sm text-muted-foreground">
              Review items, adjust quantities, then proceed to checkout.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/pos")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Continue Selling
            </Button>
            <Badge variant="secondary" className="h-8 rounded-full px-4 text-sm">
              {cartCount} item{cartCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </header>

      <div className="w-full space-y-8 px-6 sm:px-8">
        {cart.length === 0 ? (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">Your cart is empty</CardTitle>
              <CardDescription>
                Add products from the POS page. Use the Continue Selling button above to return.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">Cart Items</CardTitle>
                <CardDescription>Adjust quantities or remove items as needed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-[150px] text-center">Quantity</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item) => {
                      const isRentalItem = isRentalCartItem(item);
                      const rentalSpace = resolveRentalSpace(item);
                      const spaceBookings = rentalSpace ? bookingsBySpace.get(rentalSpace.id) ?? [] : [];
                      const bookedDateObjects = spaceBookings.map((booking) =>
                        normalizeDate(booking.booking_date)
                      );
                      const selectedRentalDate = item.rentalDate ? normalizeDate(item.rentalDate) : null;
                      const dateIsBooked =
                        selectedRentalDate != null &&
                        spaceBookings.some(
                          (booking) => String(booking.booking_date).slice(0, 10) === item.rentalDate
                        );
                      const disabledMatchers: Matcher[] = [{ before: today }];
                      if (bookedDateObjects.length) {
                        disabledMatchers.push(bookedDateObjects);
                      }

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <div className="font-medium text-card-foreground">{item.name}</div>
                                <div className="text-xs text-muted-foreground">SKU: {item.sku ?? item.id}</div>
                              </div>
                              <div className="pt-1">
                                <Barcode
                                  value={item.sku || item.id}
                                  format="CODE128"
                                  height={40}
                                  width={1.1}
                                  displayValue={false}
                                  background="transparent"
                                  lineColor="#0f172a"
                                />
                              </div>
                              {isRentalItem ? (
                                <div className="space-y-2 rounded-lg border border-emerald-200/70 bg-emerald-50 p-3 text-xs text-emerald-800">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <CalendarDays className="h-4 w-4" />
                                      <span className="font-semibold">
                                        {rentalSpace?.name ?? "Rental space"}
                                      </span>
                                    </div>
                                    <Badge
                                      variant={spaceBookings.length ? "destructive" : "secondary"}
                                      className="text-[10px] uppercase tracking-wide"
                                    >
                                      {spaceBookings.length} booked
                                    </Badge>
                                  </div>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={!rentalSpace}
                                        className="h-9 w-full justify-between gap-2 bg-white text-emerald-900 hover:bg-emerald-100"
                                      >
                                        <span className="truncate">
                                          {item.rentalDate
                                            ? formatRentalDate(item.rentalDate)
                                            : rentalSpace
                                              ? "Select rental date"
                                              : "Link rental product"}
                                        </span>
                                        <CalendarDays className="h-4 w-4 shrink-0 text-emerald-500" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={selectedRentalDate ?? undefined}
                                        onSelect={(date) => {
                                          if (!date) return;
                                          const normalized = new Date(date);
                                          normalized.setHours(0, 0, 0, 0);
                                          setItemRentalDate(item.id, format(normalized, "yyyy-MM-dd"));
                                        }}
                                        disabled={disabledMatchers}
                                        modifiers={{ booked: bookedDateObjects }}
                                        modifiersClassNames={{
                                          booked:
                                            "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                                        }}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="text-emerald-800">
                                      {rentalSpace
                                        ? `${spaceBookings.length} booking${spaceBookings.length === 1 ? "" : "s"} tracked`
                                        : "No linked rental space"}
                                    </span>
                                    {item.rentalDate ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setItemRentalDate(item.id, null)}
                                        className="h-7 text-destructive hover:text-destructive"
                                      >
                                        Clear date
                                      </Button>
                                    ) : null}
                                  </div>
                                  {loadingRentalAvailability ? (
                                    <p className="text-[11px] text-emerald-700">Refreshing availability…</p>
                                  ) : null}
                                  {dateIsBooked ? (
                                    <p className="text-[11px] text-destructive">
                                      Selected date already has a confirmed booking. Please choose another day.
                                    </p>
                                  ) : null}
                                  {!item.rentalDate ? (
                                    <p className="text-[11px] text-emerald-700">
                                      Rental dates are required to finalise bookings and prevent double
                                      scheduling.
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={isRentalItem}
                                onClick={() => {
                                  if (isRentalItem) return;
                                  updateQuantity(item.id, Math.max(1, item.quantity - 1));
                                }}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(event) =>
                                  handleQuantityInputChange(item.id, event.target.value)
                                }
                                readOnly={isRentalItem}
                                className="h-8 w-16 text-center text-sm"
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={isRentalItem}
                                onClick={() => {
                                  if (isRentalItem) return;
                                  updateQuantity(item.id, item.quantity + 1);
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatCurrency(item.price)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-card-foreground">
                            {formatCurrency(item.price * item.quantity)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                size="lg"
                className="min-w-[220px]"
                disabled={hasBookingConflict}
                onClick={() => navigate("/pos/checkout")}
              >
                Proceed to Checkout
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
