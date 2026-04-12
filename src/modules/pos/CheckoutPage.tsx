import { useState, useMemo, FormEvent, useCallback, useEffect, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  ChevronsUpDown,
  Check,
  XCircle,
  Printer,
} from "lucide-react";
import api from "@/lib/api";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { usePOSStore, type RentalDiscountType, RENTAL_DISCOUNT_RATES } from "@/store/posStore";
import { formatCurrency } from "@/utils/format";
import { useRentalAvailability } from "@/modules/pos/hooks/useRentalAvailability";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ReceiptData, ReceiptItemData } from "@/modules/pos/types";
import { readLocalReceipt, writeLocalReceipt } from "@/modules/pos/utils/receiptStorage";
import { isRentalCartItem } from "@/modules/pos/utils/rental";

const RENTAL_DISCOUNT_ORDER: RentalDiscountType[] = ["none", "pwd", "senior", "council", "council_staff"];

const RENTAL_DISCOUNT_LABELS: Record<RentalDiscountType, string> = {
  none: "No Rental Discount",
  pwd: `PWD Discount (${Math.round(RENTAL_DISCOUNT_RATES.pwd * 100)}%)`,
  senior: `Senior Citizen Discount (${Math.round(RENTAL_DISCOUNT_RATES.senior * 100)}%)`,
  council: `Council Discount (${Math.round(RENTAL_DISCOUNT_RATES.council * 100)}%)`,
  council_staff: `Council Staff Discount (${Math.round(RENTAL_DISCOUNT_RATES.council_staff * 100)}%)`,
};

const RENTAL_DISCOUNT_DESCRIPTIONS: Record<RentalDiscountType, string> = {
  none: "Standard rates apply to hall and room rentals.",
  pwd: `Applies the mandated ${Math.round(RENTAL_DISCOUNT_RATES.pwd * 100)}% discount for persons with disabilities.`,
  senior: `Applies the mandated ${Math.round(RENTAL_DISCOUNT_RATES.senior * 100)}% discount for senior citizens.`,
  council: `Applies a ${Math.round(RENTAL_DISCOUNT_RATES.council * 100)}% discount for council bookings.`,
  council_staff: `Applies a ${Math.round(RENTAL_DISCOUNT_RATES.council_staff * 100)}% discount for council staff reservations.`,
};

type ReceiptSettingsResponse = {
  current_number?: number | null;
  start_number?: number | null;
  end_number?: number | null;
  date_issued?: string | null;
};

type MemberApiRow = {
  id: string;
  full_name?: string | null;
  name?: string | null;
  membership_id?: string | null;
  code?: string | null;
  email?: string | null;
  discount_rate?: number | null;
};

type ReceiptLookupRow = {
  payload?: ReceiptData | null;
  cashier_id?: string | null;
  saleId?: string | null;
  saleNumber?: string | null;
  receiptNumber?: number | null;
};

type RentalCheckError = Error & {
  conflicts?: { space_name: string; booking_date: string }[];
};

type SaleResponse = {
  id?: string | null;
  sale_number?: string | null;
  created_at?: string | Date | null;
  receipt_number?: number | null;
  receipt_issued_at?: string | Date | null;
};

function toIsoTimestamp(value: string | Date | null | undefined, fallback: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return fallback;
}

function toDateOnly(value: string | Date | null | undefined, fallback: string) {
  return toIsoTimestamp(value, fallback).slice(0, 10);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeWholePesoInput(value: string) {
  if (!value.trim()) return "";

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "";

  return String(Math.round(parsed));
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useSessionStore(selectProfile);

  const cart = usePOSStore((state) => state.cart);
  const clearCart = usePOSStore((state) => state.clearCart);
  const totals = usePOSStore((state) => state.totals);
  const rentalDiscountType = usePOSStore((state) => state.rentalDiscountType);
  const setRentalDiscountType = usePOSStore((state) => state.setRentalDiscountType);
  const paymentMethod = usePOSStore((state) => state.paymentMethod);
  const setPaymentMethod = usePOSStore((state) => state.setPaymentMethod);
  const member = usePOSStore((state) => state.member);
  const setMember = usePOSStore((state) => state.setMember);
  const clearMember = usePOSStore((state) => state.clearMember);

  const hasRentalItems = useMemo(
    () => cart.some((item) => isRentalCartItem(item)),
    [cart]
  );

  const [depositAmount, setDepositAmount] = useState<string>("");
  const [rentalPaymentMode, setRentalPaymentMode] = useState<"full" | "deposit">("full");
  const [isCompleting, setIsCompleting] = useState(false);
  const [memberPopoverOpen, setMemberPopoverOpen] = useState(false);
  // BIR invoice customer fields
  const [soldTo, setSoldTo] = useState("");
  const [customerTin, setCustomerTin] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [businessStyle, setBusinessStyle] = useState("");
  const [term, setTerm] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(member?.id ?? null);
  const [manualClientName, setManualClientName] = useState("");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [currentReceiptNumber, setCurrentReceiptNumber] = useState<number | null>(null);
  const [isReprintDialogOpen, setIsReprintDialogOpen] = useState(false);
  const [reprintSaleNumber, setReprintSaleNumber] = useState("");
  const [isReprintLoading, setIsReprintLoading] = useState(false);
  const [reprintError, setReprintError] = useState<string | null>(null);

  const cartTotals = totals();
  const cartCount = cart.length;

  const depositAmountNum = useMemo(() => {
    const parsed = parseFloat(depositAmount);
    if (isNaN(parsed) || parsed < 0) return 0;
    return roundCurrency(Math.min(parsed, cartTotals.total));
  }, [depositAmount, cartTotals.total]);

  const isDepositPayment = hasRentalItems && rentalPaymentMode === "deposit";
  const paymentDueNow = isDepositPayment ? depositAmountNum : cartTotals.total;
  const balanceDue = isDepositPayment
    ? roundCurrency(Math.max(0, cartTotals.total - depositAmountNum))
    : 0;
  const isPartialDeposit = isDepositPayment && balanceDue > 0;

  const tenderedNum = useMemo(() => {
    const parsed = parseFloat(tenderedAmount);
    return isNaN(parsed) || parsed < 0 ? 0 : roundCurrency(parsed);
  }, [tenderedAmount]);

  const changeDue = paymentMethod === "cash" && tenderedNum > 0
    ? roundCurrency(Math.max(0, tenderedNum - paymentDueNow))
    : 0;
  const cashInsufficient = paymentMethod === "cash" && tenderedAmount !== "" && tenderedNum < paymentDueNow;

  const handleDepositAmountChange = (value: string) => {
    setDepositAmount(normalizeWholePesoInput(value));
  };

  const handleTenderedAmountChange = (value: string) => {
    setTenderedAmount(isDepositPayment ? normalizeWholePesoInput(value) : value);
  };

  const {
    spaces: rentalSpaces,
    bookingsBySpace,
    refetchBookings,
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

  useEffect(() => {
    const loadReceiptInfo = async () => {
      try {
        const { settings } = await api.get<{ settings: ReceiptSettingsResponse | null }>("/receipt-settings");
        if (settings) {
          setCurrentReceiptNumber(settings.current_number ?? settings.start_number ?? null);
          return;
        }
        setCurrentReceiptNumber(null);
      } catch {
        setCurrentReceiptNumber(null);
      }
    };
    void loadReceiptInfo();
  }, []);

  useEffect(() => {
    if (!hasRentalItems && rentalDiscountType !== "none") {
      setRentalDiscountType("none");
    }
  }, [hasRentalItems, rentalDiscountType, setRentalDiscountType]);

  useEffect(() => {
    if (!hasRentalItems) {
      setRentalPaymentMode("full");
      setDepositAmount("");
    }
  }, [hasRentalItems]);

  useEffect(() => {
    if (member?.id) {
      setSelectedMemberId(member.id);
    } else {
      setSelectedMemberId(null);
    }
  }, [member?.id]);

  type ActiveMember = {
    id: string;
    name: string;
    code: string;
    email: string | null;
    discountRate: number;
  };

  const [remoteMembers, setRemoteMembers] = useState<ActiveMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const fetchMembersLatest = async () => {
    setLoadingMembers(true);
    try {
      const { members: data } = await api.get<{ members: MemberApiRow[] }>("/members");
      const normalized =
        data?.map((row) => ({
          id: row.id,
          name: row.full_name ?? row.name ?? "",
          code: row.membership_id ?? row.code ?? "",
          email: row.email ?? null,
          discountRate: Number(row.discount_rate ?? 0),
        })) ?? [];
      setRemoteMembers(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load clients.";
      if (import.meta.env.DEV) console.warn("Failed to fetch members:", error);
      toast.error(message);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;
    void fetchMembersLatest();
  }, [profile?.id]);

  const members = useMemo<ActiveMember[]>(() => remoteMembers, [remoteMembers]);

  useEffect(() => {
    if (selectedMemberId && !members.some((m) => m.id === selectedMemberId)) {
      setSelectedMemberId(null);
    }
  }, [members, selectedMemberId]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const trimmedManualClientName = manualClientName.trim();
  const hasManualClientName = trimmedManualClientName.length > 0;

  const discountSummaryLabel = useMemo(() => {
    if (hasRentalItems) {
      return rentalDiscountType === "none" ? "Rental Discount" : RENTAL_DISCOUNT_LABELS[rentalDiscountType];
    }
    return "Discount";
  }, [hasRentalItems, rentalDiscountType]);

  const rentalDiscountHelperText = hasRentalItems
    ? RENTAL_DISCOUNT_DESCRIPTIONS[rentalDiscountType]
    : "Add a hall or room rental item to enable rental discount options.";

  const totalUnits = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    [cart]
  );

  const rentalDateSummary = useMemo(() => {
    const formattedDates = rentalCartItems
      .map((item) => {
        if (!item.rentalDate) return null;
        try {
          return format(new Date(item.rentalDate), "MMM d, yyyy");
        } catch {
          return item.rentalDate;
        }
      })
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(formattedDates)).join(", ");
  }, [rentalCartItems]);

  useEffect(() => {
    if (selectedMember) {
      setManualClientName("");
      setMember({
        id: selectedMember.id,
        name: selectedMember.name,
        code: selectedMember.code,
        discountRate: selectedMember.discountRate ?? 0,
        email: selectedMember.email,
      });
    } else {
      clearMember();
    }
  }, [selectedMember, setMember, clearMember]);

  const handleManualClientNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    if (selectedMemberId) {
      setSelectedMemberId(null);
      setMemberPopoverOpen(false);
    }
    setManualClientName(nextValue);
  };

  const handleClearMemberSelection = () => {
    setSelectedMemberId(null);
    setMemberPopoverOpen(false);
    setManualClientName("");
    clearMember();
  };

  const normalizeSaleNumber = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const cleaned = trimmed.replace(/^#/, "");
    const uuidPattern = /^[0-9a-fA-F-]{36}$/;
    if (uuidPattern.test(cleaned)) return cleaned;
    return cleaned.toUpperCase();
  }, []);

  const handleOpenReprintDialog = () => {
    setIsReprintDialogOpen(true);
    setReprintSaleNumber("");
    setReprintError(null);
  };

  const handleReprintLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = normalizeSaleNumber(reprintSaleNumber);

    if (!code) {
      setReprintError("Enter a sale or receipt number.");
      return;
    }

    setIsReprintLoading(true);
    setReprintError(null);

    try {
      let matched: ReceiptData | null = null;
      try {
        const { receipts } = await api.get<{ receipts: ReceiptLookupRow[] }>("/sales/receipts");
        if (receipts && receipts.length > 0) {
          const numericPattern = /^\d+$/;
          const found = receipts.find((receipt) => {
            const payload = (receipt.payload ?? receipt) as ReceiptData;
            const saleNum = payload.saleNumber ? normalizeSaleNumber(payload.saleNumber) : null;
            const saleId = payload.saleId ? normalizeSaleNumber(payload.saleId) : null;
            const receiptNum =
              payload.receiptNumber != null ? normalizeSaleNumber(String(payload.receiptNumber)) : null;
            return saleNum === code || saleId === code || (numericPattern.test(code) && receiptNum === code);
          });
          if (found) {
            const payload = (found.payload ?? found) as ReceiptData;
            matched = {
              ...payload,
              cashierId: payload.cashierId ?? found.cashier_id ?? null,
              cashierName: payload.cashierName ?? null,
            };
          }
        }
      } catch {
        // Ignore remote receipt lookup failures and fall back to the latest local receipt.
      }

      if (!matched) {
        const stored = readLocalReceipt();
        if (stored) {
          const storedSaleNumber = stored.saleNumber ? normalizeSaleNumber(stored.saleNumber) : null;
          const storedReceiptNumber =
            stored.receiptNumber != null ? normalizeSaleNumber(String(stored.receiptNumber)) : null;
          if (
            storedSaleNumber === code ||
            normalizeSaleNumber(stored.saleId) === code ||
            (storedReceiptNumber && storedReceiptNumber === code)
          ) {
            matched = {
              ...stored,
              cashierId: stored.cashierId ?? profile?.id ?? null,
              cashierName: stored.cashierName ?? profile?.full_name ?? profile?.id ?? null,
            };
          }
        }
      }

      if (!matched) {
        setReprintError("Receipt not found.");
        setIsReprintLoading(false);
        return;
      }

      writeLocalReceipt(matched);
      setIsReprintDialogOpen(false);
      navigate("/pos/receipt", { state: { receiptData: matched } });
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      const message = error instanceof Error ? error.message : "Unable to load receipt.";
      setReprintError(message);
      toast.error(message);
    } finally {
      setIsReprintLoading(false);
    }
  };

  const handleCompleteSale = async () => {
    if (!cart.length) {
      toast.error("Add items to the cart before completing a sale");
      return;
    }

    if (isCompleting) return;

    const rentalsMissingMapping = rentalCartItems.filter((item) => !resolveRentalSpace(item));
    if (rentalsMissingMapping.length) {
      toast.error("Link all rental products to a rental space before completing the sale.");
      return;
    }

    const rentalsWithoutDate = rentalCartItems.filter((item) => !item.rentalDate);
    if (rentalsWithoutDate.length) {
      toast.error(`Select a rental date for ${rentalsWithoutDate[0].name} before completing the sale.`);
      return;
    }

    if (isDepositPayment && paymentDueNow <= 0) {
      toast.error("Enter a deposit amount greater than zero before completing the sale.");
      return;
    }

    const manualClientNameSnapshot = manualClientName.trim();
    const hasClientName = Boolean(member?.name || manualClientNameSnapshot);
    if (!hasClientName) {
      toast.error("Assign a member or enter a client name before completing the sale.");
      return;
    }

    const rentalsToRecord = rentalCartItems.map((item) => ({
      item,
      space: resolveRentalSpace(item)!,
    }));

    const conflictingRental = rentalsToRecord.find(({ item, space }) =>
      (bookingsBySpace.get(space.id) ?? []).some(
        (booking) => String(booking.booking_date).slice(0, 10) === item.rentalDate
      )
    );
    if (conflictingRental) {
      toast.error(`The selected date for ${conflictingRental.item.name} is already booked. Choose another date.`);
      await refetchBookings();
      return;
    }

    try {
      await api.post(
        "/rental/check",
        rentalsToRecord.map(({ item, space }) => ({
          rental_space_id: space.id,
          booking_date: item.rentalDate!,
        }))
      );
    } catch (checkErr: unknown) {
      const rentalError = checkErr as RentalCheckError;
      const conflicts = rentalError.conflicts;
      if (conflicts && conflicts.length > 0) {
        toast.error(
          `${conflicts[0].space_name} is already booked for ${conflicts[0].booking_date}. Choose another date.`
        );
      } else {
        toast.error("One or more rental dates are no longer available. Please choose another date.");
      }
      await refetchBookings();
      return;
    }

    const itemsSnapshot = cart.map<ReceiptItemData>((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
      sku: item.sku,
      cost: item.cost,
      rentalDate: item.rentalDate ?? null,
    }));
    const totalsSnapshot = totals();
    const memberSnapshot = member;
    const clientNameSnapshot = memberSnapshot?.name ?? (manualClientNameSnapshot || null);
    const branch = profile?.branch ?? "Main Branch";
    const timestamp = new Date().toISOString();
    const saleReference = `POS-${Date.now()}`;

    let receiptNumberUsed: number | null = null;
    let receiptIssuedDateUsed: string | null = null;
    let shouldWarnSeriesComplete = false;

    setIsCompleting(true);

    try {
      const { settings: apiSettings } = await api.get<{ settings: ReceiptSettingsResponse | null }>("/receipt-settings");
      if (apiSettings) {
        const nextNumber = apiSettings.current_number ?? apiSettings.start_number ?? 0;
        if (nextNumber > (apiSettings.end_number ?? 0)) {
          toast.error("Receipt series exhausted. Please configure a new range.");
          setIsCompleting(false);
          return;
        }
        receiptNumberUsed = nextNumber;
        receiptIssuedDateUsed = apiSettings.date_issued ?? timestamp;
        shouldWarnSeriesComplete = nextNumber === apiSettings.end_number;
      } else {
        toast.warning("Receipt series not configured. Save a series in Receipt Settings.");
      }
    } catch {
      toast.info("Receipt series status is unavailable. The server will assign one if configured.");
    }

    const hasRentals = itemsSnapshot.some((item) => item.rentalDate != null);
    const birCustomer = {
      soldTo: soldTo.trim() || clientNameSnapshot || null,
      customerTin: customerTin.trim() || null,
      customerAddress: customerAddress.trim() || null,
      businessStyle: businessStyle.trim() || null,
      term: term.trim() || null,
      invoiceType: (hasRentals ? "service" : "sales") as "sales" | "service",
    };

    const preliminaryReceipt: ReceiptData = {
      saleId: saleReference,
      saleNumber: saleReference,
      createdAt: timestamp,
      paymentMethod,
      branch,
      subtotal: totalsSnapshot.subtotal,
      discount: totalsSnapshot.discount,
      tax: totalsSnapshot.tax,
      total: totalsSnapshot.total,
      depositAmount: isDepositPayment ? paymentDueNow : totalsSnapshot.total,
      balanceDue: balanceDue > 0 ? balanceDue : null,
      items: itemsSnapshot,
      memberName: clientNameSnapshot ?? undefined,
      memberEmail: memberSnapshot?.email ?? null,
      memberDiscountRate: memberSnapshot?.discountRate,
      thankYouMessage: clientNameSnapshot ? `Thank you, ${clientNameSnapshot}!` : undefined,
      receiptNumber: receiptNumberUsed,
      receiptIssuedAt: toDateOnly(receiptIssuedDateUsed, timestamp),
      cashierId: profile?.id ?? null,
      cashierName: profile?.full_name ?? profile?.id ?? null,
      ...birCustomer,
    };

    const saleTotal = isDepositPayment ? paymentDueNow : totalsSnapshot.total;
    const bookingPaymentStatus = balanceDue > 0 ? "partial" : "paid";

    try {
      const rentalBookings = rentalsToRecord.map(({ item, space }) => ({
        rental_space_id: space.id,
        booking_date: item.rentalDate!,
        notes: clientNameSnapshot ?? null,
        total_amount: item.price * item.quantity,
        initial_payment: saleTotal,
        payment_status: bookingPaymentStatus,
      }));

      const { sale: saleRecord } = await api.post<{ sale: SaleResponse }>("/sales", {
        sale: {
          sale_number: saleReference,
          cashier_id: profile?.id ?? null,
          branch: branch ?? null,
          subtotal: totalsSnapshot.subtotal,
          discount_amount: totalsSnapshot.discount ?? 0,
          tax_amount: totalsSnapshot.tax ?? 0,
          total_amount: saleTotal,
          payment_method: paymentMethod,
          member_id: memberSnapshot?.id ?? null,
          payment_reference: null,
          notes: clientNameSnapshot ?? null,
          receipt_number: null,
        },
        items: itemsSnapshot.map((item) => ({
          product_id: item.id,
          quantity: Number(item.quantity ?? 0),
          unit_price: Number(item.price ?? 0),
          unit_cost: Number(item.cost ?? 0),
          subtotal: Number(item.subtotal ?? 0),
        })),
        rental_bookings: rentalBookings.length > 0 ? rentalBookings : undefined,
        receipt_payload: preliminaryReceipt,
      });

      const receiptSnapshot: ReceiptData = {
        saleId: saleRecord.id ?? saleReference,
        saleNumber: saleRecord.sale_number ?? saleReference,
        createdAt: toIsoTimestamp(saleRecord.created_at, timestamp),
        paymentMethod,
        branch,
        subtotal: totalsSnapshot.subtotal,
        discount: totalsSnapshot.discount,
        tax: totalsSnapshot.tax,
        total: saleTotal,
        depositAmount: isDepositPayment ? saleTotal : totalsSnapshot.total,
        balanceDue: balanceDue > 0 ? balanceDue : null,
        items: itemsSnapshot,
        memberName: clientNameSnapshot ?? undefined,
        memberEmail: memberSnapshot?.email ?? null,
        memberDiscountRate: memberSnapshot?.discountRate,
        thankYouMessage: clientNameSnapshot ? `Thank you, ${clientNameSnapshot}!` : undefined,
        receiptNumber: saleRecord.receipt_number ?? receiptNumberUsed ?? undefined,
        receiptIssuedAt: toDateOnly(saleRecord.receipt_issued_at ?? receiptIssuedDateUsed, timestamp),
        cashierId: profile?.id ?? null,
        cashierName: profile?.full_name ?? profile?.id ?? null,
        cashTendered: paymentMethod === "cash" && tenderedNum > 0 ? tenderedNum : null,
        change: paymentMethod === "cash" && tenderedNum > 0 ? changeDue : null,
        ...birCustomer,
      };

      writeLocalReceipt(receiptSnapshot);

      if (typeof saleRecord.receipt_number === "number") {
        setCurrentReceiptNumber(saleRecord.receipt_number + 1);
      }

      if (shouldWarnSeriesComplete) {
        toast.warning("Receipt series completed. Please configure a new range.");
      }

      await queryClient.invalidateQueries({ queryKey: ["receipt-history"] });
      clearCart();
      setDepositAmount("");
      setRentalPaymentMode("full");
      setTenderedAmount("");
      handleClearMemberSelection();
      toast.success("Sale completed successfully!");
      await refetchBookings();

      navigate("/pos/receipt", { state: { receiptData: receiptSnapshot } });
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error(error);
      const saleError = error as Error & { error?: string; message?: string };
      if (saleError?.error === "Receipt series exhausted" || saleError?.message === "Receipt series exhausted") {
        toast.error("Receipt series exhausted. Please configure a new range.");
        return;
      }
      if (saleError?.error === "RENTAL_CONFLICT" || saleError?.message?.startsWith?.("RENTAL_CONFLICT")) {
        const detail = saleError?.message ?? "The rental slot was just booked by someone else.";
        toast.error(
          detail.replace("RENTAL_CONFLICT:", "").trim() ||
            "That rental date is no longer available. Please choose another date."
        );
        await refetchBookings();
      } else {
        const message = error instanceof Error ? error.message : (saleError?.error ?? "Failed to complete sale.");
        toast.error(message);
      }
    } finally {
      setIsCompleting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="space-y-6 pb-24">
        <header className="sticky top-[64px] z-30 border-b border-border/60 bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Checkout Summary</h1>
              <p className="text-sm text-muted-foreground">Review payment details and complete the sale.</p>
            </div>
            <Button variant="ghost" onClick={() => navigate("/pos/cart")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Cart
            </Button>
          </div>
        </header>
        <div className="px-6 sm:px-8">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">Cart is empty</CardTitle>
              <CardDescription>Go back to the cart to add items before checking out.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <header className="sticky top-[64px] z-30 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Checkout Summary</h1>
            <p className="text-sm text-muted-foreground">Review payment details and complete the sale.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/pos/cart")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Cart
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenReprintDialog}>
              <Printer className="mr-2 h-4 w-4" />
              Reprint
            </Button>
            <Badge variant="secondary" className="h-8 rounded-full px-4 text-sm">
              {cartCount} item{cartCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </header>

      <div className="w-full px-6 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">Checkout</CardTitle>
              <CardDescription>Follow the payment steps below and complete the sale.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">Order Snapshot</p>
                    <div>
                      <p className="text-sm text-muted-foreground">Collect now</p>
                      <p className="text-3xl font-semibold text-foreground">{formatCurrency(paymentDueNow || cartTotals.total)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        {cartCount} line item{cartCount === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {totalUnits} unit{totalUnits === 1 ? "" : "s"}
                      </Badge>
                      {hasRentalItems ? (
                        <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 px-3 py-1 text-amber-800">
                          Rental booking
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm sm:text-right">
                    <div>
                      <p className="text-muted-foreground">Grand total</p>
                      <p className="font-semibold text-card-foreground">{formatCurrency(cartTotals.total)}</p>
                    </div>
                    {balanceDue > 0 ? (
                      <div>
                        <p className="text-muted-foreground">Remaining balance</p>
                        <p className="font-semibold text-amber-700">{formatCurrency(balanceDue)}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-muted-foreground">Next receipt</p>
                      <p className="font-mono text-card-foreground">
                        {currentReceiptNumber != null ? `#${currentReceiptNumber}` : "Not configured"}
                      </p>
                    </div>
                  </div>
                </div>
                {hasRentalItems ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-white/80 p-4 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-foreground">Rental schedule</span>
                      <span className="text-muted-foreground">{rentalDateSummary || "Choose rental dates before checkout"}</span>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">1. Payment</h2>
                  <p className="text-sm text-muted-foreground">Choose how the cashier will collect payment.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-method-quick">Payment Method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
                  >
                    <SelectTrigger id="payment-method-quick" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {hasRentalItems ? (
                  <div className="space-y-2">
                    <Label>Rental Payment Type</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant={rentalPaymentMode === "full" ? "default" : "outline"}
                        className="h-auto flex-col items-start gap-1 rounded-xl px-4 py-3 text-left"
                        onClick={() => {
                          setRentalPaymentMode("full");
                          setDepositAmount("");
                        }}
                      >
                        <span>Full Payment</span>
                        <span className="text-xs font-normal opacity-80">Collect the whole amount today.</span>
                      </Button>
                      <Button
                        type="button"
                        variant={rentalPaymentMode === "deposit" ? "default" : "outline"}
                        className="h-auto flex-col items-start gap-1 rounded-xl px-4 py-3 text-left"
                        onClick={() => setRentalPaymentMode("deposit")}
                      >
                        <span>Deposit Only</span>
                        <span className="text-xs font-normal opacity-80">Collect part now and track the balance.</span>
                      </Button>
                    </div>
                  </div>
                ) : null}

                {isDepositPayment ? (
                  <div className="space-y-2">
                    <Label htmlFor="deposit-amount-quick">Deposit Amount</Label>
                    <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">PHP</span>
                      <Input
                        id="deposit-amount-quick"
                        type="number"
                        min={0}
                        max={cartTotals.total}
                        step={1}
                        placeholder={`Up to ${cartTotals.total.toFixed(2)}`}
                        value={depositAmount}
                        onChange={(e) => handleDepositAmountChange(e.target.value)}
                        className="h-11 flex-1"
                      />
                    </div>
                  </div>
                ) : null}

                {paymentMethod === "cash" ? (
                  <div className="space-y-2">
                    <Label htmlFor="tendered-amount-quick">
                      {isDepositPayment ? "Cash Received for Deposit" : "Amount Tendered"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">PHP</span>
                      <Input
                        id="tendered-amount-quick"
                        type="number"
                        min={0}
                        step={isDepositPayment ? 1 : 0.01}
                        placeholder={paymentDueNow.toFixed(2)}
                        value={tenderedAmount}
                        onChange={(e) => handleTenderedAmountChange(e.target.value)}
                        className="h-11 flex-1"
                      />
                    </div>
                  </div>
                ) : null}

                <div
                  className={cn(
                    "rounded-2xl border px-4 py-4",
                    cashInsufficient
                      ? "border-destructive/40 bg-destructive/5"
                      : balanceDue > 0
                        ? "border-amber-200 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50"
                  )}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Collect now</p>
                      <p className="mt-1 text-lg font-semibold text-card-foreground">{formatCurrency(paymentDueNow || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {paymentMethod === "cash" ? (cashInsufficient ? "Short" : "Change") : "Payment status"}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-lg font-semibold",
                          cashInsufficient ? "text-destructive" : "text-card-foreground"
                        )}
                      >
                        {paymentMethod === "cash"
                          ? tenderedAmount !== ""
                            ? cashInsufficient
                              ? formatCurrency(paymentDueNow - tenderedNum)
                              : formatCurrency(changeDue)
                            : formatCurrency(0)
                          : balanceDue > 0
                            ? "Deposit"
                            : "Fully paid"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining balance</p>
                      <p className="mt-1 text-lg font-semibold text-card-foreground">{formatCurrency(balanceDue)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden space-y-2">
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
                >
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "cash" && (
                <div className="hidden space-y-2">
                  <Label htmlFor="tendered-amount">Amount Tendered</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">PHP</span>
                    <Input
                      id="tendered-amount"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder={cartTotals.total.toFixed(2)}
                      value={tenderedAmount}
                      onChange={(e) => handleTenderedAmountChange(e.target.value)}
                      className="h-11 flex-1"
                    />
                  </div>
                  {tenderedAmount !== "" && (
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium",
                        cashInsufficient
                          ? "border-destructive/40 bg-destructive/5 text-destructive"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                      )}
                    >
                      {cashInsufficient
                        ? `Short by ${formatCurrency(cartTotals.total - tenderedNum)}`
                        : `Change: ${formatCurrency(changeDue)}`}
                    </div>
                  )}
                </div>
              )}

              <div className="hidden space-y-2">
                <Label htmlFor="rental-discount">Rental Discount</Label>
                <Select
                  value={rentalDiscountType}
                  onValueChange={(value) => setRentalDiscountType(value as RentalDiscountType)}
                  disabled={!hasRentalItems}
                >
                  <SelectTrigger
                    id="rental-discount"
                    className={cn(
                      "h-11 w-full justify-between bg-background text-sm",
                      !hasRentalItems && "cursor-not-allowed opacity-70"
                    )}
                  >
                    <SelectValue placeholder="Choose discount type" />
                  </SelectTrigger>
                  <SelectContent>
                    {RENTAL_DISCOUNT_ORDER.map((option) => (
                      <SelectItem key={option} value={option}>
                        {RENTAL_DISCOUNT_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">{rentalDiscountHelperText}</p>
              </div>

              {hasRentalItems && (
                <div className="hidden space-y-2">
                  <Label htmlFor="deposit-amount">Initial Payment / Deposit</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">PHP</span>
                    <Input
                      id="deposit-amount"
                      type="number"
                      min={0}
                      max={cartTotals.total}
                      step={1}
                      placeholder={`Full amount: ${cartTotals.total.toFixed(2)}`}
                      value={depositAmount}
                      onChange={(e) => handleDepositAmountChange(e.target.value)}
                      className="h-11 flex-1"
                    />
                  </div>
                  {isPartialDeposit && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">Balance due: </span>
                      {formatCurrency(balanceDue)}
                      <span className="ml-1 text-amber-600">-- client will pay this later</span>
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Leave blank to record the full amount as paid today.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-border/70 bg-background p-5 space-y-3 text-sm">
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">2. Totals</h2>
                  <p className="text-sm text-muted-foreground">Review the final sale amounts.</p>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{discountSummaryLabel}</span>
                  <span>-{formatCurrency(cartTotals.rentalDiscount ?? 0)}</span>
                </div>
                {(member?.discountRate ?? 0) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Member Discount</span>
                    <span>-{formatCurrency(cartTotals.memberDiscount ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax ({(usePOSStore.getState().taxRate * 100).toFixed(0)}%)</span>
                  <span>{formatCurrency(cartTotals.tax)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-lg font-semibold text-card-foreground">
                  <span>Total</span>
                  <span>{formatCurrency(cartTotals.total)}</span>
                </div>
              </div>

              <div className="hidden items-center justify-between rounded-lg border border-dashed border-emerald-200/60 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
                <span className="font-semibold uppercase tracking-wide">Next Receipt</span>
                <span className="font-mono text-sm">
                  {currentReceiptNumber != null ? `#${currentReceiptNumber}` : "Not configured"}
                </span>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background p-5 space-y-4 text-sm">
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">3. Customer</h2>
                  <p className="text-sm text-muted-foreground">Pick a member or type the walk-in customer name.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                  <Popover open={memberPopoverOpen} onOpenChange={setMemberPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={memberPopoverOpen}
                        className={cn(
                          "h-11 w-full justify-between bg-background text-sm sm:flex-1 sm:min-w-[220px]",
                          !selectedMember && "text-muted-foreground"
                        )}
                      >
                        {selectedMember
                          ? `${selectedMember.name} (${selectedMember.code})`
                          : loadingMembers
                            ? "Loading members…"
                            : "Select client"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search client..." />
                        <CommandEmpty>No active members found.</CommandEmpty>
                        <CommandGroup>
                          {members.map((candidate) => (
                            <CommandItem
                              key={candidate.id}
                              value={`${candidate.name} ${candidate.code}`}
                              onSelect={() => {
                                setSelectedMemberId(candidate.id);
                                setMemberPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedMemberId === candidate.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span>{candidate.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">({candidate.code})</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input
                    value={manualClientName}
                    onChange={handleManualClientNameChange}
                    placeholder="Enter client name"
                    className="h-11 sm:flex-1 sm:min-w-[180px]"
                  />
                  {(selectedMember || hasManualClientName) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearMemberSelection}
                      className="flex items-center gap-2 text-destructive hover:text-destructive sm:self-center"
                    >
                      <XCircle className="h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>

                {selectedMember ? (
                  <div className="grid gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 sm:grid-cols-2">
                    <div>
                      <p className="font-semibold text-emerald-900">{selectedMember.name}</p>
                      <p className="text-[11px]">Membership ID: {selectedMember.code}</p>
                    </div>
                    <div className="space-y-1">
                      <p>Email: {selectedMember.email ?? "Not provided"}</p>
                      <p>
                        Member discount applies to items only. For rental bookings, use the Rental Discount
                        selector.
                      </p>
                    </div>
                  </div>
                ) : hasManualClientName ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900">{trimmedManualClientName}</p>
                    <p className="text-[11px] text-slate-600">Walk-in client recorded for this sale.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No client selected. Record a member or type a client name to personalise the receipt.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background px-5">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="optional" className="border-b-0">
                    <AccordionTrigger className="py-4 text-left text-base font-semibold text-card-foreground hover:no-underline">
                      More Details
                    </AccordionTrigger>
                    <AccordionContent className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="rental-discount-visible">Rental Discount</Label>
                        <Select
                          value={rentalDiscountType}
                          onValueChange={(value) => setRentalDiscountType(value as RentalDiscountType)}
                          disabled={!hasRentalItems}
                        >
                          <SelectTrigger
                            id="rental-discount-visible"
                            className={cn(
                              "h-11 w-full justify-between bg-background text-sm",
                              !hasRentalItems && "cursor-not-allowed opacity-70"
                            )}
                          >
                            <SelectValue placeholder="Choose discount type" />
                          </SelectTrigger>
                          <SelectContent>
                            {RENTAL_DISCOUNT_ORDER.map((option) => (
                              <SelectItem key={option} value={option}>
                                {RENTAL_DISCOUNT_LABELS[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs leading-relaxed text-muted-foreground">{rentalDiscountHelperText}</p>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Official Invoice Details <span className="font-normal normal-case">(optional)</span>
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Sold To</Label>
                            <Input
                              placeholder="Customer / company name"
                              value={soldTo}
                              onChange={(e) => setSoldTo(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">TIN</Label>
                            <Input
                              placeholder="Customer TIN"
                              value={customerTin}
                              onChange={(e) => setCustomerTin(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs">Address</Label>
                            <Input
                              placeholder="Customer address"
                              value={customerAddress}
                              onChange={(e) => setCustomerAddress(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Business Style</Label>
                            <Input
                              placeholder="Business style"
                              value={businessStyle}
                              onChange={(e) => setBusinessStyle(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Term</Label>
                            <Input
                              placeholder="e.g. Cash, 30 days"
                              value={term}
                              onChange={(e) => setTerm(e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* BIR Invoice Customer Details */}
              <div className="hidden rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Official Invoice Details <span className="font-normal normal-case">(optional — for BIR invoices)</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Sold To</Label>
                    <Input
                      placeholder="Customer / company name"
                      value={soldTo}
                      onChange={(e) => setSoldTo(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">TIN</Label>
                    <Input
                      placeholder="Customer TIN"
                      value={customerTin}
                      onChange={(e) => setCustomerTin(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Address</Label>
                    <Input
                      placeholder="Customer address"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Business Style</Label>
                    <Input
                      placeholder="Business style"
                      value={businessStyle}
                      onChange={(e) => setBusinessStyle(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Term</Label>
                    <Input
                      placeholder="e.g. Cash, 30 days"
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>

              <Button
                className="h-12 w-full text-base"
                size="lg"
                onClick={handleCompleteSale}
                disabled={isCompleting || hasBookingConflict || cashInsufficient}
              >
                {isCompleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Completing…
                  </span>
                ) : (
                  "Proceed to Printing & Complete Sale"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={isReprintDialogOpen}
        onOpenChange={(open) => {
          setIsReprintDialogOpen(open);
          if (!open) {
            setReprintSaleNumber("");
            setReprintError(null);
            setIsReprintLoading(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reprint Receipt</DialogTitle>
            <DialogDescription>Look up a stored receipt by sale number or receipt ID.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleReprintLookup}>
            <div className="space-y-2">
              <Label htmlFor="reprint-sale-number">Sale or Receipt Number</Label>
              <Input
                id="reprint-sale-number"
                placeholder="POS-123456789 or receipt ID"
                value={reprintSaleNumber}
                onChange={(event) => setReprintSaleNumber(event.target.value)}
                autoFocus
              />
              {reprintError ? <p className="text-xs font-medium text-destructive">{reprintError}</p> : null}
            </div>
            <DialogFooter className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsReprintDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isReprintLoading}>
                {isReprintLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </span>
                ) : (
                  "Open Receipt"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

