import { useState, useMemo, FormEvent, useCallback, useRef, useEffect, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  Minus,
  Plus,
  Trash2,
  ArrowLeft,
  Pause,
  Play,
  Loader2,
  Printer,
  Download,
  Mail,
  ChevronsUpDown,
  Check,
  XCircle,
  CalendarDays,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { usePOSStore, type RentalDiscountType, RENTAL_DISCOUNT_RATES } from "@/store/posStore";
import { Database, Json } from "@/integrations/supabase/types";
import { formatCurrency } from "@/utils/format";
import { useCartSync } from "@/modules/pos/hooks/useCartSync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Barcode from "react-barcode";
import { cn } from "@/lib/utils";
import { useRentalAvailability } from "@/modules/pos/hooks/useRentalAvailability";
import { appendLocalRentalBooking } from "@/modules/pos/utils/rentalBookingsStorage";
import { format, parseISO } from "date-fns";

const RENTAL_CATEGORY_NAMES = new Set([
  "hall rental",
  "room rental",
  "hall & room rental",
  "hall & room rentals",
]);

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
  senior: `Applies the mandated ${Math.round(
    RENTAL_DISCOUNT_RATES.senior * 100
  )}% discount for senior citizens.`,
  council: `Applies a ${Math.round(RENTAL_DISCOUNT_RATES.council * 100)}% discount for council bookings.`,
  council_staff: `Applies a ${Math.round(
    RENTAL_DISCOUNT_RATES.council_staff * 100
  )}% discount for council staff reservations.`,
};

interface HeldCartItemRecord {
  quantity: number;
  unit_price: number;
  product: {
    id: string;
    sku: string;
    name: string;
    selling_price: number;
    cost_price: number | null;
    stock_quantity: number | null;
    category_id?: string | null;
    category?: { name: string | null } | null;
  } | null;
}

interface HeldCartRecord {
  id: string;
  label: string;
  created_at: string;
  items: HeldCartItemRecord[];
}

import { ReceiptData, ReceiptItemData } from "@/modules/pos/types";
import { readLocalReceipt, writeLocalReceipt } from "@/modules/pos/utils/receiptStorage";
import {
  readLocalReceiptSettings,
  writeLocalReceiptSettings,
} from "@/modules/pos/utils/receiptSettingsStorage";

const fetchHeldCarts = async (): Promise<HeldCartRecord[]> => {
  const { data, error } = await supabase
    .from("held_carts")
    .select(
      "id,label,created_at,held_cart_items(quantity,unit_price, product:products(id,sku,name,selling_price,cost_price,stock_quantity,category_id,category:product_categories(name)))"
    )
    .eq("status", "held")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (
    data?.map((cart: any) => ({
      id: cart.id,
      label: cart.label,
      created_at: cart.created_at,
      items:
        cart.held_cart_items?.map((item: any) => ({
          quantity: item.quantity,
          unit_price: item.unit_price,
          product: item.product ?? null,
        })) ?? [],
    })) ?? []
  );
};

const MEMBERS_ENDPOINT =
  import.meta.env.VITE_MEMBERS_ENDPOINT ?? "/functions/v1/get-members";

export function CartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useSessionStore(selectProfile);

  const cart = usePOSStore((state) => state.cart);
  const removeItem = usePOSStore((state) => state.removeItem);
  const updateQuantity = usePOSStore((state) => state.updateQuantity);
  const clearCart = usePOSStore((state) => state.clearCart);
  const holdCurrentCartLocal = usePOSStore((state) => state.holdCurrentCart);
  const resumeHeldCartLocal = usePOSStore((state) => state.resumeHeldCart);
  const heldCartsLocal = usePOSStore((state) => state.heldCarts);
  const totals = usePOSStore((state) => state.totals);
  const discountRate = usePOSStore((state) => state.discountRate);
  const rentalDiscountType = usePOSStore((state) => state.rentalDiscountType);
  const paymentMethod = usePOSStore((state) => state.paymentMethod);
  const setPaymentMethod = usePOSStore((state) => state.setPaymentMethod);
  const setCart = usePOSStore((state) => state.setCart);
  const member = usePOSStore((state) => state.member);
  const setMember = usePOSStore((state) => state.setMember);
  const clearMember = usePOSStore((state) => state.clearMember);
  const setItemRentalDate = usePOSStore((state) => state.setItemRentalDate);
  const setRentalDiscountType = usePOSStore((state) => state.setRentalDiscountType);

  const hasRentalItems = useMemo(
    () =>
      cart.some((item) => {
        const category = item.categoryName?.toLowerCase() ?? "";
        return category ? RENTAL_CATEGORY_NAMES.has(category) : false;
      }),
    [cart]
  );

  const [heldLabel, setHeldLabel] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [memberPopoverOpen, setMemberPopoverOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(member?.id ?? null);
  const [manualClientName, setManualClientName] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [shouldRedirectAfterReceipt, setShouldRedirectAfterReceipt] = useState(false);
  const [isReprintDialogOpen, setIsReprintDialogOpen] = useState(false);
  const [reprintSaleNumber, setReprintSaleNumber] = useState("");
  const [isReprintLoading, setIsReprintLoading] = useState(false);
  const [reprintError, setReprintError] = useState<string | null>(null);
  const cartTotals = useMemo(() => totals(), [cart, totals, discountRate]);
  const cartCount = cart.length;
  const [currentReceiptNumber, setCurrentReceiptNumber] = useState<number | null>(null);
  const {
    spaces: rentalSpaces,
    bookingsBySpace,
    isLoading: loadingRentalAvailability,
    refetchBookings,
  } = useRentalAvailability();

  const rentalSpacesByProductId = useMemo(() => {
    const map = new Map<string, (typeof rentalSpaces)[number]>();
    rentalSpaces.forEach((space) => {
      if (space.product_id) {
        map.set(space.product_id, space);
      }
    });
    return map;
  }, [rentalSpaces]);

  const rentalCartItems = useMemo(
    () =>
      cart.filter((item) => {
        const category = item.categoryName?.toLowerCase() ?? "";
        return category ? RENTAL_CATEGORY_NAMES.has(category) : false;
      }),
    [cart]
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

  useEffect(() => {
    const loadReceiptInfo = async () => {
      if (isSupabaseConfigured) {
        try {
          const { data: seriesRow, error: seriesError } = await supabase
            .from("receipt_settings")
            .select("current_number")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!seriesError && seriesRow?.current_number != null) {
            setCurrentReceiptNumber(Number(seriesRow.current_number));
            return;
          }

          const { data: latestReceiptData, error: receiptError } = await supabase
            .from("sale_receipts")
            .select("receipt_number")
            .not("receipt_number", "is", null)
            .order("receipt_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!receiptError) {
            const receiptNumber =
              (latestReceiptData as { receipt_number?: number | null } | null)?.receipt_number ?? null;
            if (receiptNumber != null) {
              setCurrentReceiptNumber(Number(receiptNumber));
              return;
            }
          }
        } catch (error) {
          console.warn("Failed to load receipt info from Supabase", error);
        }
      }

      const settings = readLocalReceiptSettings();
      if (settings) {
        setCurrentReceiptNumber(settings.currentNumber ?? settings.startNumber);
      }
    };

    loadReceiptInfo();
  }, [isSupabaseConfigured]);

  useCartSync(cart);

  useEffect(() => {
    if (!hasRentalItems && rentalDiscountType !== "none") {
      setRentalDiscountType("none");
    }
  }, [hasRentalItems, rentalDiscountType, setRentalDiscountType]);

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
  };

  const demoMembers: ActiveMember[] = [
    {
      id: "demo-member-1",
      name: "Alex Rivera",
      code: "MEM-001",
      email: "alex.rivera@example.com",
    },
    {
      id: "demo-member-2",
      name: "Jamie Cruz",
      code: "MEM-002",
      email: "jamie.cruz@example.com",
    },
  ];

  const [remoteMembers, setRemoteMembers] = useState<ActiveMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const fetchMembersLatest = async () => {
    if (!isSupabaseConfigured) {
      setRemoteMembers(demoMembers);
      return;
    }

    if (!profile?.id) {
      setRemoteMembers(demoMembers);
      return;
    }

    setLoadingMembers(true);
    try {
      const { data, error } = await (supabase as any)
        .from("members")
        .select("id, name, code, email")
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      const normalized =
        data?.map((row: any) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          email: row.email ?? null,
        })) ?? [];

      setRemoteMembers(normalized);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load clients.";
      console.warn("Failed to fetch members via Supabase:", error);
      toast.error(message);
      setRemoteMembers(demoMembers);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setRemoteMembers(demoMembers);
      return;
    }

    if (!profile?.id) {
      setRemoteMembers(demoMembers);
      return;
    }

    fetchMembersLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabaseConfigured, profile?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.id) return;

    const channel = supabase
      .channel("members-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        () => fetchMembersLatest()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabaseConfigured]);

  const members = useMemo<ActiveMember[]>(
    () => (isSupabaseConfigured ? remoteMembers : demoMembers),
    [isSupabaseConfigured, remoteMembers]
  );

  useEffect(() => {
    if (selectedMemberId && !members.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(null);
    }
  }, [members, selectedMemberId]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
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

  useEffect(() => {
    if (selectedMember) {
      setManualClientName("");
      setMember({
        id: selectedMember.id,
        name: selectedMember.name,
        code: selectedMember.code,
        discountRate: 0,
        email: selectedMember.email,
      });
    } else {
      clearMember();
    }
  }, [selectedMember, setMember, clearMember, setManualClientName]);

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

  const { data: heldCartsRemote = [], isFetching: loadingHeldCarts } = useQuery({
    queryKey: ["held-carts"],
    enabled: isSupabaseConfigured,
    queryFn: fetchHeldCarts,
  });

  const heldCarts = useMemo(() => {
    if (isSupabaseConfigured) {
      return heldCartsRemote;
    }

    return Object.entries(heldCartsLocal).map(([label, items]) => ({
      id: label,
      label,
      created_at: "",
      items: items.map((item) => ({
        quantity: item.quantity,
        unit_price: item.price,
        product: {
          id: item.id,
          sku: item.sku,
          name: item.name,
          selling_price: item.price,
          cost_price: item.cost ?? null,
          stock_quantity: item.maxQuantity,
          category_id: item.categoryId ?? null,
          category: item.categoryName ? { name: item.categoryName } : null,
        },
      })),
    }));
  }, [heldCartsLocal, heldCartsRemote]);

  const handleQuantityInputChange = useCallback(
    (id: string, value: string) => {
      const target = cart.find((item) => item.id === id);
      if (target) {
        const categoryName = target.categoryName ?? null;
        if (categoryName && RENTAL_CATEGORY_NAMES.has(categoryName)) {
          return;
        }
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        return;
      }
      updateQuantity(id, parsed);
    },
    [cart, updateQuantity]
  );

  const formatPercent = useCallback((rate: number) => {
    const percentage = rate * 100;
    return Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1);
  }, []);

  const normalizeSaleNumber = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const uuidPattern = /^[0-9a-fA-F-]{36}$/;
    return uuidPattern.test(trimmed) ? trimmed : trimmed.toUpperCase();
  }, []);

  const persistReceiptSnapshot = useCallback(
    async (
      snapshot: ReceiptData,
      metadata?: { saleId?: string; saleNumber?: string | null; cashierId?: string | null; memberId?: string | null }
    ) => {
      writeLocalReceipt(snapshot);

      if (!isSupabaseConfigured) return;

      try {
        const targetSaleId = metadata?.saleId ?? snapshot.saleId;
        const targetSaleNumber = metadata?.saleNumber ?? snapshot.saleNumber ?? snapshot.saleId;

        await supabase
          .from("sale_receipts")
          .upsert(
            {
              sale_id: targetSaleId,
              sale_number: targetSaleNumber,
              cashier_id: metadata?.cashierId ?? null,
              member_id: metadata?.memberId ?? null,
              payload: snapshot as unknown as Json,
            },
            { onConflict: "sale_id" }
          );
      } catch (error) {
        console.error("Failed to persist receipt snapshot", error);
        toast.warning("Receipt saved locally but failed to sync online.");
      }
    },
    [isSupabaseConfigured]
  );

  const handlePrintReceipt = () => {
    if (!receiptRef.current || !receiptData) {
      toast.error("Receipt is not ready to print yet.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) {
      toast.error("Pop-up blocked. Enable pop-ups to print the receipt.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${receiptData.saleNumber ?? receiptData.saleId}</title>
          <style>
            :root { color-scheme: light; }
            body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 24px; background: #ffffff; }
            .receipt-wrapper { max-width: 520px; margin: 0 auto; border: 1px dashed #d4d4d8; padding: 20px; }
            .receipt-wrapper h2 { letter-spacing: 0.25em; text-transform: uppercase; font-size: 16px; text-align: center; margin-bottom: 4px; }
            .receipt-wrapper p { margin: 0; }
            .section-divider { border-top: 1px dashed #d4d4d8; margin: 16px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; font-size: 12px; padding: 4px 0; }
            th:nth-child(2), td:nth-child(2) { text-align: center; }
            th:nth-child(3), td:nth-child(3) { text-align: right; }
          </style>
        </head>
        <body>
          <div class="receipt-wrapper">${receiptRef.current.innerHTML}</div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownloadReceipt = async () => {
    if (!receiptRef.current || !receiptData) {
      toast.error("Receipt is not ready to download yet.");
      return;
    }

    setIsDownloadingReceipt(true);
    try {
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = html2pdfModule.default ?? html2pdfModule;
      const filename = `receipt-${receiptData.saleNumber ?? receiptData.saleId}.pdf`;
      await html2pdf()
        .set({
          margin: 8,
          filename,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a5", orientation: "portrait" },
        })
        .from(receiptRef.current)
        .save();
      toast.success("Receipt downloaded");
    } catch (error) {
      console.error(error);
      toast.error("Failed to download receipt.");
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  const handleEmailReceipt = async () => {
    if (!receiptData?.memberEmail) {
      toast.error("No email found for this member.");
      return;
    }

    if (!isSupabaseConfigured) {
      toast.info("Supabase is not configured. Email sending is unavailable.");
      return;
    }

    setIsSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-pos-receipt", {
        body: {
          saleId: receiptData.saleId,
          saleNumber: receiptData.saleNumber,
          email: receiptData.memberEmail,
          memberName: receiptData.memberName,
          paymentMethod: receiptData.paymentMethod,
          subtotal: receiptData.subtotal,
          discount: receiptData.discount,
          tax: receiptData.tax,
          total: receiptData.total,
          branch: receiptData.branch,
          createdAt: receiptData.createdAt,
          items: receiptData.items,
        },
      });

      if (error) throw error;

      toast.success("Receipt emailed successfully");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unable to email receipt right now.";
      toast.error(message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCloseReceipt = () => {
    setIsReceiptOpen(false);
    setReceiptData(null);
    if (shouldRedirectAfterReceipt) {
      navigate("/pos");
    }
    setShouldRedirectAfterReceipt(false);
  };

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
      if (!isSupabaseConfigured) {
        const stored = readLocalReceipt();
        if (!stored) {
          setReprintError("No receipts are stored yet in demo mode.");
          setIsReprintLoading(false);
          return;
        }

        const storedSaleNumber = stored.saleNumber ? normalizeSaleNumber(stored.saleNumber) : null;
        if (storedSaleNumber && storedSaleNumber !== code && normalizeSaleNumber(stored.saleId) !== code) {
          setReprintError("Only the most recent receipt is available in demo mode.");
          setIsReprintLoading(false);
          return;
        }

        setShouldRedirectAfterReceipt(false);
        setReceiptData(stored);
        setIsReceiptOpen(true);
        setIsReprintDialogOpen(false);
        setIsReprintLoading(false);
        return;
      }

      let receiptQuery = supabase.from("sale_receipts").select("payload");
      const uuidPattern = /^[0-9a-fA-F-]{36}$/;
      if (uuidPattern.test(code)) {
        receiptQuery = receiptQuery.or(`sale_id.eq.${code},sale_number.eq.${code}`);
      } else {
        receiptQuery = receiptQuery.eq("sale_number", code);
      }

      const { data, error } = await receiptQuery.maybeSingle();

      if (error) throw error;

      if (!data?.payload || typeof data.payload !== "object") {
        setReprintError("Receipt not found.");
        setIsReprintLoading(false);
        return;
      }

      const payload = data.payload as unknown as ReceiptData;
      setShouldRedirectAfterReceipt(false);
      setReceiptData(payload);
      writeLocalReceipt(payload);
      setIsReceiptOpen(true);
      setIsReprintDialogOpen(false);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unable to load receipt.";
      setReprintError(message);
      toast.error(message);
    } finally {
      setIsReprintLoading(false);
    }
  };

  const handleHoldCart = async () => {
    if (!cart.length) {
      toast.error("Add items to the cart before holding");
      return;
    }

    if (!heldLabel.trim()) {
      toast.error("Provide a label to hold this cart");
      return;
    }

    if (!isSupabaseConfigured) {
      holdCurrentCartLocal(heldLabel.trim());
      clearCart();
      handleClearMemberSelection();
      setCurrentReceiptNumber(readLocalReceiptSettings()?.currentNumber ?? null);
      toast.success("Cart held (demo mode)");
      setHeldLabel("");
      return;
    }

    if (isHolding) return;
    setIsHolding(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        toast.error("Please sign in to hold carts.");
        setIsHolding(false);
        return;
      }

      const branch = profile?.branch ?? null;
      const { data: createdCart, error: createError } = await supabase
        .from("held_carts")
        .insert({
          label: heldLabel.trim(),
          created_by: user.id,
          branch,
        })
        .select()
        .single();

      if (createError) throw createError;

      const itemsPayload = cart.map((item) => ({
        held_cart_id: createdCart.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
      }));

      const { error: itemsError } = await supabase.from("held_cart_items").insert(itemsPayload);
      if (itemsError) throw itemsError;

      clearCart();
      handleClearMemberSelection();
      setHeldLabel("");
      toast.success("Cart held successfully");
      await queryClient.invalidateQueries({ queryKey: ["held-carts"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to hold cart.";
      console.error(error);
      toast.error(message);
    } finally {
      setIsHolding(false);
    }
  };

  const handleResumeCart = async (cartId: string, label: string) => {
    if (!isSupabaseConfigured) {
      resumeHeldCartLocal(label);
      toast.success(`Resumed cart "${label}"`);
      return;
    }

    try {
      const target = heldCartsRemote.find((cart) => cart.id === cartId);
      if (!target) {
        toast.error("Held cart not found");
        return;
      }

      const itemsForStore = target.items
        .filter((item) => item.product)
        .map((item) => ({
          id: item.product!.id,
          sku: item.product!.sku,
          name: item.product!.name,
          price: item.product!.selling_price,
          cost: item.product!.cost_price ?? undefined,
          quantity: item.quantity,
          maxQuantity: item.product!.stock_quantity ?? item.quantity,
          categoryId: item.product!.category_id ?? null,
          categoryName: (item.product as any)?.category?.name ?? null,
        }));

      setCart(itemsForStore);
      handleClearMemberSelection();
      setCurrentReceiptNumber(readLocalReceiptSettings()?.currentNumber ?? null);
      const { error: deleteError } = await supabase.from("held_carts").delete().eq("id", cartId);
      if (deleteError) throw deleteError;

      await queryClient.invalidateQueries({ queryKey: ["held-carts"] });
      toast.success(`Resumed cart "${target.label}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resume cart.";
      console.error(error);
      toast.error(message);
    }
  };

  const handleCompleteSale = async () => {
    if (!cart.length) {
      toast.error("Add items to the cart before completing a sale");
      return;
    }

    if (isCompleting) return;

    const rentalsMissingMapping = rentalCartItems.filter((item) => !rentalSpacesByProductId.get(item.id));
    if (rentalsMissingMapping.length) {
      toast.error("Link all rental products to a rental space before completing the sale.");
      return;
    }

    const rentalsWithoutDate = rentalCartItems.filter((item) => !item.rentalDate);
    if (rentalsWithoutDate.length) {
      toast.error(`Select a rental date for ${rentalsWithoutDate[0].name} before completing the sale.`);
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
      space: rentalSpacesByProductId.get(item.id)!,
    }));

    const conflictingRental = rentalsToRecord.find(({ item, space }) =>
      (bookingsBySpace.get(space.id) ?? []).some((booking) => booking.booking_date === item.rentalDate)
    );

    if (conflictingRental) {
      toast.error(`The selected date for ${conflictingRental.item.name} is already booked. Choose another date.`);
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
    }));
    const totalsSnapshot = totals();
    const memberSnapshot = member;
    const clientNameSnapshot = memberSnapshot?.name ?? (manualClientNameSnapshot || null);
    const branch = profile?.branch ?? "Main Branch";
    const timestamp = new Date().toISOString();
    const saleReference = `POS-${Date.now()}`;

    let receiptNumberUsed: number | null = null;
    let receiptIssuedDateUsed: string | null = null;
    let supabaseSeriesUpdate: { id: string; nextValue: number; endNumber: number } | null = null;
    let localSeries: ReturnType<typeof readLocalReceiptSettings> = null;
    let shouldWarnSeriesComplete = false;

    setIsCompleting(true);

    if (isSupabaseConfigured) {
      try {
        const { data: series, error: seriesError } = await supabase
          .from("receipt_settings")
          .select("id,start_number,end_number,current_number,date_issued,updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (seriesError) throw seriesError;

        if (series) {
          const nextNumber = series.current_number ?? series.start_number;
          if (nextNumber > series.end_number) {
            toast.error("Receipt series exhausted. Please configure a new range.");
            setIsCompleting(false);
            return;
          }
          receiptNumberUsed = nextNumber;
          receiptIssuedDateUsed = series.date_issued ?? timestamp;
          shouldWarnSeriesComplete = nextNumber === series.end_number;
          supabaseSeriesUpdate = {
            id: series.id,
            nextValue: Math.min(nextNumber + 1, series.end_number + 1),
            endNumber: series.end_number,
          };
        } else {
          toast.warning("Receipt series not configured. Save a series in Receipt Settings.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load receipt settings.";
        toast.error(message);
        setIsCompleting(false);
        return;
      }
    } else {
      localSeries = readLocalReceiptSettings();
      if (localSeries) {
        const nextNumber = localSeries.currentNumber ?? localSeries.startNumber;
        if (nextNumber > localSeries.endNumber) {
          toast.error("Receipt series completed. Please configure a new range.");
          setIsCompleting(false);
          return;
        }
        receiptNumberUsed = nextNumber;
        receiptIssuedDateUsed = localSeries.dateIssued;
        shouldWarnSeriesComplete = nextNumber === localSeries.endNumber;
      } else {
        toast.info("Receipt series is not configured locally. Proceeding without receipt number.");
      }
    }

    if (!isSupabaseConfigured) {
      const receiptPayload: ReceiptData = {
        saleId: saleReference,
        saleNumber: saleReference,
        createdAt: timestamp,
        paymentMethod,
        branch,
        subtotal: totalsSnapshot.subtotal,
        discount: totalsSnapshot.discount,
        tax: totalsSnapshot.tax,
        total: totalsSnapshot.total,
        items: itemsSnapshot,
        memberName: clientNameSnapshot ?? undefined,
        memberEmail: memberSnapshot?.email ?? null,
        memberDiscountRate: memberSnapshot?.discountRate,
        thankYouMessage: clientNameSnapshot ? `Thank you, ${clientNameSnapshot}!` : undefined,
        receiptNumber: receiptNumberUsed,
        receiptIssuedAt: (receiptIssuedDateUsed ?? timestamp).slice(0, 10),
      };

      setReceiptData(receiptPayload);
      setShouldRedirectAfterReceipt(true);
      setIsReceiptOpen(true);
      await persistReceiptSnapshot(receiptPayload, {
        saleId: receiptPayload.saleId,
        saleNumber: receiptPayload.saleNumber,
        cashierId: profile?.id ?? null,
        memberId: memberSnapshot?.id ?? null,
      });
      if (rentalsToRecord.length) {
        rentalsToRecord.forEach(({ item, space }) => {
          appendLocalRentalBooking({
            rental_space_id: space.id,
            booking_date: item.rentalDate!,
            status: "confirmed",
            sale_id: receiptPayload.saleId,
            notes: clientNameSnapshot ?? null,
          });
        });
      }
      if (localSeries && receiptNumberUsed !== null) {
        const nextValue = Math.min(receiptNumberUsed + 1, localSeries.endNumber + 1);
        writeLocalReceiptSettings({
          ...localSeries,
          currentNumber: nextValue,
          updatedAt: new Date().toISOString(),
          updatedBy: profile?.full_name ?? profile?.id ?? null,
        });
        setCurrentReceiptNumber(nextValue);
        if (shouldWarnSeriesComplete) {
          toast.warning("Receipt series completed. Please configure a new range.");
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["receipt-history"] });
      clearCart();
      handleClearMemberSelection();
      await refetchBookings();
      toast.info("Supabase is not configured. Transaction recorded locally for demo purposes.");
      setIsCompleting(false);
      return;
    }

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        toast.error("Please sign in to process sales.");
        return;
      }

      const normalizedPaymentMethod = (
        paymentMethod === "mixed" ? "cash" : paymentMethod
      ) as Database["public"]["Enums"]["payment_method"];

      const baseSalePayload: Database["public"]["Tables"]["sales"]["Insert"] = {
        sale_number: saleReference,
        cashier_id: user.id,
        branch,
        subtotal: totalsSnapshot.subtotal,
        discount_amount: totalsSnapshot.discount,
        tax_amount: totalsSnapshot.tax,
        total_amount: totalsSnapshot.total,
        payment_method: normalizedPaymentMethod,
        member_id: memberSnapshot?.id ?? null,
        payment_reference: null,
        notes: null,
        receipt_number: receiptNumberUsed,
        receipt_issued_at: (receiptIssuedDateUsed ?? timestamp).slice(0, 10),
        status: "completed",
      };

      const { data: saleRecord, error: saleError } = await supabase
        .from("sales")
        .insert(baseSalePayload)
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItemsPayload = itemsSnapshot.map((item) => ({
        sale_id: saleRecord.id,
        product_id: item.id,
        quantity: Number(item.quantity ?? 0),
        unit_price: Number(item.price ?? 0),
        unit_cost: Number(item.cost ?? 0),
        subtotal: Number(item.subtotal ?? 0),
      }));

      const { error: itemsError } = await supabase.from("sale_items").insert(saleItemsPayload);
      if (itemsError) throw itemsError;

      await Promise.all(
        cart
          .filter((item) => {
            const categoryName = item.categoryName ?? null;
            return !(categoryName && RENTAL_CATEGORY_NAMES.has(categoryName));
          })
          .map(async (item) => {
            const { error: stockError } = await (supabase.rpc as any)("decrement_product_stock", {
              p_product_id: item.id,
              p_quantity: item.quantity,
            });
            if (stockError) throw stockError;
          })
      );

      if (rentalsToRecord.length) {
        const bookingPayload = rentalsToRecord.map(({ item, space }) => ({
          rental_space_id: space.id,
          booking_date: item.rentalDate!,
          status: "confirmed" as const,
          sale_id: saleRecord.id,
          created_by: user.id ?? null,
          notes: clientNameSnapshot ?? null,
        }));
        const { error: rentalsError } = await supabase.from("rental_bookings").insert(bookingPayload);
        if (rentalsError) {
          if ((rentalsError as any)?.code === "23505") {
            await supabase.from("sale_items").delete().eq("sale_id", saleRecord.id);
            await supabase.from("sales").delete().eq("id", saleRecord.id);
            throw new Error("RENTAL_BOOKING_CONFLICT");
          }
          throw rentalsError;
        }
      }

      const receiptSnapshot: ReceiptData = {
        saleId: saleRecord.id,
        saleNumber: saleRecord.sale_number ?? saleReference,
        createdAt: saleRecord.created_at ?? timestamp,
        paymentMethod,
        branch,
        subtotal: totalsSnapshot.subtotal,
        discount: totalsSnapshot.discount,
        tax: totalsSnapshot.tax,
        total: totalsSnapshot.total,
        items: itemsSnapshot,
        memberName: clientNameSnapshot ?? undefined,
        memberEmail: memberSnapshot?.email ?? null,
        memberDiscountRate: memberSnapshot?.discountRate,
        thankYouMessage: clientNameSnapshot ? `Thank you, ${clientNameSnapshot}!` : undefined,
        receiptNumber: receiptNumberUsed ?? saleRecord.receipt_number ?? undefined,
        receiptIssuedAt: (
          receiptIssuedDateUsed ??
          saleRecord.receipt_issued_at ??
          timestamp
        ).slice(0, 10),
      };

      setReceiptData(receiptSnapshot);
      setShouldRedirectAfterReceipt(true);
      await persistReceiptSnapshot(receiptSnapshot, {
        saleId: saleRecord.id,
        saleNumber: receiptSnapshot.saleNumber,
        cashierId: user.id,
        memberId: memberSnapshot?.id ?? null,
      });
      if (supabaseSeriesUpdate) {
        const { error: updateError } = await supabase
          .from("receipt_settings")
          .update({ current_number: supabaseSeriesUpdate.nextValue })
          .eq("id", supabaseSeriesUpdate.id);

        if (updateError) {
          console.error(updateError);
          toast.error("Failed to update receipt series. Please verify in settings.");
        } else if (shouldWarnSeriesComplete) {
          toast.warning("Receipt series completed. Please configure a new range.");
        }

        setCurrentReceiptNumber(supabaseSeriesUpdate.nextValue);
      }
      await queryClient.invalidateQueries({ queryKey: ["receipt-history"] });
      setIsReceiptOpen(true);
      clearCart();
      handleClearMemberSelection();
      toast.success("Sale completed successfully!");
      await refetchBookings();
      await queryClient.invalidateQueries({ queryKey: ["held-carts"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to complete sale.";
      console.error(error);
      if (message === "RENTAL_BOOKING_CONFLICT") {
        toast.error("Another booking claimed that rental slot. Please choose a different date.");
      } else {
        toast.error(message);
      }
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <header className="sticky top-[64px] z-30 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Cart Overview</h1>
            <p className="text-sm text-muted-foreground">
              Review items, manage quantities, and complete the sale.
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
        <div className="mx-auto w-full border-t border-border/60 bg-muted/40 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-muted-foreground">Held Orders</h2>
              <p className="text-xs text-muted-foreground/80">
                Keep an eye on paused carts and resume them when customers return.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  id="hold-label"
                  placeholder="New hold label"
                  value={heldLabel}
                  onChange={(event) => setHeldLabel(event.target.value)}
                  className="h-9 w-48"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleHoldCart}
                  disabled={isHolding || cart.length === 0}
                >
                  {isHolding ? (
                    <span className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Holding…
                    </span>
                  ) : (
                    <>
                      <Pause className="mr-2 h-4 w-4" /> Hold
                    </>
                  )}
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {isSupabaseConfigured && loadingHeldCarts ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading holds…
                  </span>
                ) : heldCarts.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No held orders.</span>
                ) : (
                  heldCarts.map((held) => (
                    <Button
                      key={held.id}
                      size="sm"
                      variant="secondary"
                      onClick={() => handleResumeCart(held.id, held.label)}
                      className="flex items-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      {held.label}
                      <Badge variant="outline" className="ml-1">
                        {held.items.length}
                      </Badge>
                    </Button>
                  ))
                )}
              </div>
            </div>
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
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
            <Card className="border-border lg:flex-1 lg:min-w-0">
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
                      const categoryNormalized = item.categoryName?.toLowerCase() ?? "";
                      const isRentalItem = categoryNormalized ? RENTAL_CATEGORY_NAMES.has(categoryNormalized) : false;
                      const rentalSpace = isRentalItem ? rentalSpacesByProductId.get(item.id) ?? null : null;
                      const spaceBookings = rentalSpace ? bookingsBySpace.get(rentalSpace.id) ?? [] : [];
                      const bookedDateObjects = spaceBookings.map((booking) => normalizeDate(booking.booking_date));
                      const selectedRentalDate = item.rentalDate ? normalizeDate(item.rentalDate) : null;
                      const dateIsBooked =
                        selectedRentalDate != null &&
                        spaceBookings.some((booking) => booking.booking_date === item.rentalDate);
                      const disabledMatchers: { before?: Date; dates?: Date[] }[] = [{ before: today }];
                      if (bookedDateObjects.length) {
                        disabledMatchers.push({ dates: bookedDateObjects });
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
                                          booked: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
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
                                      Rental dates are required to finalise bookings and prevent double scheduling.
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
                                onChange={(event) => handleQuantityInputChange(item.id, event.target.value)}
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

            <div className="flex w-full flex-col gap-6 lg:ml-auto lg:max-w-md">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-card-foreground">Summary</CardTitle>
                  <CardDescription>Review totals and complete the sale.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
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

                  <div className="space-y-2">
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

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatCurrency(cartTotals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{discountSummaryLabel}</span>
                      <span>-{formatCurrency(cartTotals.discount)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax (12%)</span>
                      <span>{formatCurrency(cartTotals.tax)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-lg font-semibold text-card-foreground">
                      <span>Total</span>
                      <span>{formatCurrency(cartTotals.total)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-dashed border-emerald-200/60 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
                    <span className="font-semibold uppercase tracking-wide">Next Receipt</span>
                    <span className="font-mono text-sm">
                      {currentReceiptNumber != null ? `#${currentReceiptNumber}` : "Not configured"}
                    </span>
                  </div>

                  <div className="space-y-3 text-sm">
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
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({candidate.code})
                                  </span>
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
                          <p>Rental discounts are applied using the selector above.</p>
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

                  <Button className="w-full" size="lg" onClick={handleCompleteSale} disabled={isCompleting}>
                    {isCompleting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Completing…
                      </span>
                    ) : (
                      "Complete Sale"
                    )}
                  </Button>
                </CardContent>
              </Card>

            </div>
          </div>
        )}
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
              {!isSupabaseConfigured ? (
                <p className="text-[11px] text-muted-foreground">
                  Demo mode keeps only the most recent receipt locally.
                </p>
              ) : null}
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
      <Dialog
        open={isReceiptOpen}
        onOpenChange={(open) => {
          setIsReceiptOpen(open);
          if (!open) {
            setReceiptData(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sale Receipt</DialogTitle>
            <DialogDescription>Print, download, or email the receipt for this transaction.</DialogDescription>
          </DialogHeader>
          {receiptData ? (
            <div className="space-y-6">
              <div
                ref={receiptRef}
                className="rounded-lg border border-dashed border-muted-foreground/40 bg-white p-6 font-mono text-sm text-foreground shadow-inner"
              >
                <div className="text-center">
                  <h2 className="text-lg font-semibold tracking-[0.35em] uppercase">Girl Scout Shop</h2>
                  <p className="text-xs text-muted-foreground">{receiptData.branch ?? "Main Branch"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(receiptData.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="my-4 border-t border-dashed border-muted-foreground/50" />

                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-muted-foreground">Sale ID</span>
                  <span className="text-right font-medium">
                    {receiptData.saleNumber ?? receiptData.saleId}
                  </span>
                  {typeof receiptData.receiptNumber === "number" ? (
                    <>
                      <span className="text-muted-foreground">Receipt #</span>
                      <span className="text-right font-medium">#{receiptData.receiptNumber}</span>
                    </>
                  ) : null}
                  {receiptData.memberName ? (
                    <>
                      <span className="text-muted-foreground">Member</span>
                      <span className="text-right font-medium">{receiptData.memberName}</span>
                      <span className="text-muted-foreground">Discount</span>
                      <span className="text-right font-medium">
                        {formatPercent(Number(receiptData.memberDiscountRate ?? 0))}%
                      </span>
                    </>
                  ) : null}
                  <span className="text-muted-foreground">Payment</span>
                  <span className="text-right font-medium uppercase">{receiptData.paymentMethod}</span>
                </div>

                <div className="my-4 border-t border-dashed border-muted-foreground/50" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <span>Item</span>
                    <span>Qty × Price</span>
                    <span>Total</span>
                  </div>
                  {receiptData.items.map((item) => (
                    <div
                      key={`${item.id}-${item.sku}`}
                      className="flex items-end justify-between rounded border border-transparent px-1 py-1 transition hover:border-muted-foreground/30"
                    >
                      <div>
                        <span className="block text-sm font-semibold">{item.name}</span>
                        {item.sku ? (
                          <span className="text-[10px] uppercase text-muted-foreground">SKU: {item.sku}</span>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.price)}
                      </span>
                      <span className="text-sm font-semibold">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="my-4 border-t border-dashed border-muted-foreground/50" />

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="uppercase tracking-widest text-muted-foreground">Subtotal</span>
                    <span className="font-semibold">{formatCurrency(receiptData.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="uppercase tracking-widest text-muted-foreground">Discount</span>
                    <span className="font-semibold">-{formatCurrency(receiptData.discount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="uppercase tracking-widest text-muted-foreground">Tax</span>
                    <span className="font-semibold">{formatCurrency(receiptData.tax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-muted-foreground/40 pt-2 text-base font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(receiptData.total)}</span>
                  </div>
                </div>

                {receiptData.thankYouMessage ? (
                  <p className="mt-4 text-center text-xs font-semibold text-emerald-600">
                    {receiptData.thankYouMessage}
                  </p>
                ) : (
                  <p className="mt-4 text-center text-xs text-muted-foreground">Thank you for your purchase!</p>
                )}
              </div>

              <DialogFooter className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={handlePrintReceipt}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Receipt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadReceipt}
                    disabled={isDownloadingReceipt}
                  >
                    {isDownloadingReceipt ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Preparing…
                      </span>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </>
                    )}
                  </Button>
                  {receiptData.memberEmail ? (
                    <Button variant="outline" onClick={handleEmailReceipt} disabled={isSendingEmail}>
                      {isSendingEmail ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending…
                        </span>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Email Receipt
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
                <Button onClick={handleCloseReceipt}>
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Done
                  </span>
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">Preparing receipt…</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
