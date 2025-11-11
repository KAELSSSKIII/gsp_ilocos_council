import { useState, useMemo, useCallback, FormEvent, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { ReceiptData, ReceiptHistoryItem } from "@/modules/pos/types";
import { readLocalReceipt, writeLocalReceipt } from "@/modules/pos/utils/receiptStorage";
import { updateLocalRentalBookingsForSale } from "@/modules/pos/utils/rentalBookingsStorage";
import {
  Loader2,
  CalendarIcon,
  Download,
  Printer,
  Mail,
  CheckCircle2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

export function ReceiptsPage() {
  const profile = useSessionStore(selectProfile);
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isReprintDialogOpen, setIsReprintDialogOpen] = useState(false);
  const [reprintSaleNumber, setReprintSaleNumber] = useState("");
  const [reprintError, setReprintError] = useState<string | null>(null);
  const [isReprintLoading, setIsReprintLoading] = useState(false);
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptHistoryItem | null>(null);
  const [localReceiptsVersion, setLocalReceiptsVersion] = useState(0);

  const dayRange = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      start,
      end,
      isoStart: start.toISOString(),
      isoEnd: end.toISOString(),
    };
  }, [selectedDate]);

  const { data: remoteReceipts = [], isFetching: loadingReceipts, refetch: refetchReceipts } = useQuery({
    queryKey: ["receipt-history", dayRange.isoStart],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_receipts")
        .select(
          `
            sale_id,
            sale_number,
            cashier_id,
            created_at,
            payload,
            voided_at,
            voided_by,
            void_reason,
            cashier:profiles!sale_receipts_cashier_id_fkey(full_name)
          `
        )
        .gte("created_at", dayRange.isoStart)
        .lt("created_at", dayRange.isoEnd)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (
        data?.flatMap((record: any) => {
          if (!record?.payload || typeof record.payload !== "object") return [];
          const payload = record.payload as unknown as ReceiptData;
          const voidedAt = record.voided_at ?? payload.voidedAt ?? null;
          const voidedBy = record.voided_by ?? payload.voidedBy ?? null;
          const voidReason = record.void_reason ?? payload.voidReason ?? null;
          const cashierNameFromJoin = Array.isArray(record.cashier)
            ? record.cashier[0]?.full_name
            : record.cashier?.full_name;
          const normalizedPayload: ReceiptData = {
            ...payload,
            voidedAt,
            voidedBy,
            voidReason,
            cashierId: payload.cashierId ?? record.cashier_id ?? null,
            cashierName: payload.cashierName ?? cashierNameFromJoin ?? null,
          };
          return [
            {
              saleId: record.sale_id,
              saleNumber: record.sale_number ?? record.sale_id,
              createdAt: record.created_at,
              total: payload.total,
              memberName: payload.memberName ?? null,
              voidedAt,
              voidedBy,
              voidReason,
              receiptNumber: normalizedPayload.receiptNumber ?? null,
              receiptIssuedAt: normalizedPayload.receiptIssuedAt ?? null,
              cashierId: normalizedPayload.cashierId ?? record.cashier_id ?? null,
              cashierName: normalizedPayload.cashierName ?? cashierNameFromJoin ?? null,
              payload: normalizedPayload,
            } satisfies ReceiptHistoryItem,
          ];
        }) ?? []
      );
    },
  });

  const localReceipts = useMemo(() => {
    if (isSupabaseConfigured) return [];
    const stored = readLocalReceipt();
    if (!stored) return [];
    const storedDate = new Date(stored.createdAt);
    if (Number.isNaN(storedDate.getTime())) return [];
    return isSameDay(storedDate, selectedDate)
      ? [
          {
            saleId: stored.saleId,
            saleNumber: stored.saleNumber ?? stored.saleId,
            createdAt: stored.createdAt,
            total: stored.total,
            memberName: stored.memberName ?? null,
            voidedAt: stored.voidedAt ?? null,
            voidedBy: stored.voidedBy ?? null,
            voidReason: stored.voidReason ?? null,
            receiptNumber: stored.receiptNumber ?? null,
            receiptIssuedAt: stored.receiptIssuedAt ?? null,
            cashierId: stored.cashierId ?? null,
            cashierName: stored.cashierName ?? null,
            payload: stored,
          } satisfies ReceiptHistoryItem,
        ]
      : [];
  }, [selectedDate, localReceiptsVersion]);

  const receiptHistoryList = isSupabaseConfigured ? remoteReceipts : localReceipts;
  const hasReceipts = receiptHistoryList.length > 0;
  const canVoid = profile?.role === "admin";

  const normalizeSaleNumber = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const cleaned = trimmed.replace(/^#/, "");
    const uuidPattern = /^[0-9a-fA-F-]{36}$/;
    if (uuidPattern.test(cleaned)) return cleaned;
    return cleaned.toUpperCase();
  }, []);

  const formatPercent = useCallback((rate: number) => {
    const percentage = rate * 100;
    return Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1);
  }, []);

  const handleOpenReceipt = useCallback((item: ReceiptHistoryItem) => {
    const normalizedPayload: ReceiptData = {
      ...item.payload,
      voidedAt: item.voidedAt ?? item.payload.voidedAt ?? null,
      voidedBy: item.voidedBy ?? item.payload.voidedBy ?? null,
      voidReason: item.voidReason ?? item.payload.voidReason ?? null,
      receiptNumber: item.receiptNumber ?? item.payload.receiptNumber ?? null,
      receiptIssuedAt: item.receiptIssuedAt ?? item.payload.receiptIssuedAt ?? null,
      cashierId: item.cashierId ?? item.payload.cashierId ?? null,
      cashierName: item.cashierName ?? item.payload.cashierName ?? null,
    };
    const normalizedItem: ReceiptHistoryItem = {
      ...item,
      voidedAt: normalizedPayload.voidedAt ?? null,
      voidedBy: normalizedPayload.voidedBy ?? null,
      voidReason: normalizedPayload.voidReason ?? null,
      receiptNumber: normalizedPayload.receiptNumber ?? null,
      receiptIssuedAt: normalizedPayload.receiptIssuedAt ?? null,
      cashierId: normalizedPayload.cashierId ?? null,
      cashierName: normalizedPayload.cashierName ?? null,
      payload: normalizedPayload,
    };
    setActiveReceipt(normalizedItem);
    setReceiptData(normalizedPayload);
    writeLocalReceipt(normalizedPayload);
    setIsReceiptOpen(true);
  }, []);

  const handleCloseReceipt = () => {
    setIsReceiptOpen(false);
    setReceiptData(null);
    setActiveReceipt(null);
  };

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

  const handleVoidReceipt = useCallback(async () => {
    if (!activeReceipt || !receiptData) return;
    const reason = voidReason.trim() || null;
    const timestamp = new Date().toISOString();

    const applyLocalUpdate = (resolvedSaleId?: string | null) => {
      const updatedPayload: ReceiptData = {
        ...receiptData,
        voidedAt: timestamp,
        voidedBy: profile?.id ?? null,
        voidReason: reason,
        saleId: resolvedSaleId ?? receiptData.saleId,
      };
      const updatedHistory: ReceiptHistoryItem = {
        ...activeReceipt,
        saleId: resolvedSaleId ?? activeReceipt.saleId,
        voidedAt: timestamp,
        voidedBy: profile?.id ?? null,
        voidReason: reason,
        payload: updatedPayload,
      };
      setReceiptData(updatedPayload);
      setActiveReceipt(updatedHistory);
      writeLocalReceipt(updatedPayload);
      setLocalReceiptsVersion((value) => value + 1);
    };

    setIsVoiding(true);
    try {
      if (!isSupabaseConfigured) {
        applyLocalUpdate(activeReceipt.saleId ?? null);
        updateLocalRentalBookingsForSale(activeReceipt.saleId ?? null, "cancelled");
        toast.success("Receipt voided (demo mode).");
      } else {
        let resolvedSaleId: string | null = activeReceipt.saleId ?? null;

        if (!resolvedSaleId && activeReceipt.saleNumber) {
          const { data: saleByNumber, error: lookupError } = await supabase
            .from("sales")
            .select("id")
            .eq("sale_number", activeReceipt.saleNumber)
            .maybeSingle();

          if (lookupError) throw lookupError;
          resolvedSaleId = saleByNumber?.id ?? null;
        }

        if (!resolvedSaleId) {
          throw new Error("SALE_NOT_FOUND");
        }

        const { error: voidError } = await supabase.rpc("void_sale", {
          p_sale_id: resolvedSaleId,
          p_reason: reason,
          p_voided_by: profile?.id ?? null,
        });

        if (voidError) {
          const details = `${voidError.details ?? ""} ${voidError.message ?? ""}`;
          if (details.includes("SALE_ALREADY_VOIDED")) {
            toast.info("This sale has already been voided.");
          } else if (details.includes("SALE_NOT_FOUND")) {
            throw new Error("Sale not found. Please refresh and try again.");
          } else {
            throw voidError;
          }
        } else {
          toast.success("Receipt voided successfully.");
        }

        const { error: bookingUpdateError } = await supabase
          .from("rental_bookings")
          .update({ status: "cancelled" })
          .eq("sale_id", resolvedSaleId);
        if (bookingUpdateError) {
          console.warn("Failed to cancel rental bookings", bookingUpdateError);
        }

        applyLocalUpdate(resolvedSaleId);
        await refetchReceipts();
        await queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
        await queryClient.invalidateQueries({ queryKey: ["products", "inventory"] });
        await queryClient.invalidateQueries({ queryKey: ["receipt-history"] });
        await queryClient.invalidateQueries({ queryKey: ["rental-bookings"] });
      }
      setIsVoidDialogOpen(false);
      setVoidReason("");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to void the receipt. Void failed. Try again.";
      toast.error(message);
    } finally {
      setIsVoiding(false);
    }
  }, [
    activeReceipt,
    receiptData,
    voidReason,
    profile?.id,
    isSupabaseConfigured,
    refetchReceipts,
    queryClient,
  ]);

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
        const storedReceiptNumber =
          stored.receiptNumber != null ? normalizeSaleNumber(String(stored.receiptNumber)) : null;
        if (
          storedSaleNumber &&
          storedSaleNumber !== code &&
          normalizeSaleNumber(stored.saleId) !== code &&
          (!storedReceiptNumber || storedReceiptNumber !== code)
        ) {
          setReprintError("Only the most recent receipt is available in demo mode.");
          setIsReprintLoading(false);
          return;
        }

        const normalizedStored: ReceiptData = {
          ...stored,
          cashierId: stored.cashierId ?? null,
          cashierName: stored.cashierName ?? null,
        };
        setReceiptData(normalizedStored);
        writeLocalReceipt(normalizedStored);
        setIsReceiptOpen(true);
        setIsReprintDialogOpen(false);
        setIsReprintLoading(false);
        return;
      }

      let receiptQuery = supabase
        .from("sale_receipts")
        .select(
          `
            payload,
            cashier_id,
            cashier:profiles!sale_receipts_cashier_id_fkey(full_name)
          `
        )
        .limit(1);
      const uuidPattern = /^[0-9a-fA-F-]{36}$/;
      const numericPattern = /^\d+$/;
      if (uuidPattern.test(code)) {
        receiptQuery = receiptQuery.or(`sale_id.eq.${code},sale_number.eq.${code}`);
      } else {
        receiptQuery = receiptQuery.eq("sale_number", code);
      }

      let { data, error } = await receiptQuery.maybeSingle();

      if (!data && !error && numericPattern.test(code)) {
        const fallback = await supabase
          .from("sale_receipts")
          .select(
            `
              payload,
              cashier_id,
              cashier:profiles!sale_receipts_cashier_id_fkey(full_name)
            `
          )
          .filter("payload->>receiptNumber", "eq", code)
          .limit(1)
          .maybeSingle();
        data = fallback.data;
        if (!error) {
          error = fallback.error;
        }
      }

      if (error) throw error;

      if (!data?.payload || typeof data.payload !== "object") {
        setReprintError("Receipt not found.");
        setIsReprintLoading(false);
        return;
      }

      const payload = data.payload as unknown as ReceiptData;
      const cashierNameFromJoin = Array.isArray((data as any)?.cashier)
        ? (data as any).cashier[0]?.full_name
        : (data as any).cashier?.full_name;
      const normalizedPayload: ReceiptData = {
        ...payload,
        cashierId: payload.cashierId ?? data?.cashier_id ?? null,
        cashierName: payload.cashierName ?? cashierNameFromJoin ?? null,
      };
      setReceiptData(normalizedPayload);
      writeLocalReceipt(normalizedPayload);
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

  return (
    <div className="space-y-6 pb-24">
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Receipt History</h1>
            <p className="text-sm text-muted-foreground">
              Browse daily transactions and reopen receipts for printing, downloads, or emailing.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Search className="h-4 w-4" />
            Reprint or resend receipts in just a few clicks.
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 sm:px-6 lg:px-8 lg:grid-cols-[2fr_1fr]">
        <Card className="border-border">
          <CardHeader className="space-y-3 sm:flex sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-card-foreground">Daily Receipts</CardTitle>
              <CardDescription>Receipts processed on the selected day.</CardDescription>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start sm:w-auto", !selectedDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(value) => {
                    if (value) {
                      const normalized = new Date(value);
                      normalized.setHours(0, 0, 0, 0);
                      setSelectedDate(normalized);
                      if (isSupabaseConfigured) {
                        refetchReceipts();
                      }
                    }
                  }}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingReceipts ? (
              <div className="flex items-center justify-center rounded-md border border-dashed border-muted-foreground/50 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading receipts…
              </div>
            ) : hasReceipts ? (
              <div className="space-y-3">
                {receiptHistoryList.map((item) => {
                  const isVoided = Boolean(item.voidedAt);
                  return (
                    <div
                      key={`${item.saleId}-${item.createdAt}`}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-md border px-3 py-2 transition",
                        isVoided
                          ? "border-destructive/40 bg-destructive/5 text-destructive-foreground/80"
                          : "border-muted/60 bg-muted/20 text-foreground"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold">{item.saleNumber}</div>
                          {isVoided ? <Badge variant="destructive">Voided</Badge> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(item.createdAt), "p")} · {formatCurrency(item.total)}
                          {item.memberName ? ` · ${item.memberName}` : ""}
                        </div>
                        {item.receiptIssuedAt ? (
                          <div className="text-xs text-muted-foreground/80">
                            Issued {format(new Date(item.receiptIssuedAt), "PP")}
                          </div>
                        ) : null}
                        {item.cashierName ? (
                          <div className="text-xs text-muted-foreground/80">
                            Cashier: {item.cashierName}
                          </div>
                        ) : null}
                        {typeof item.receiptNumber === "number" ? (
                          <div className="text-xs text-muted-foreground/80">
                            Receipt #: {item.receiptNumber}
                          </div>
                        ) : null}
                        {isVoided && item.voidReason ? (
                          <div className="text-xs text-muted-foreground/80">Reason: {item.voidReason}</div>
                        ) : null}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleOpenReceipt(item)}>
                        View
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-muted-foreground/50 px-3 py-6 text-center text-sm text-muted-foreground">
                No receipts recorded for this day yet.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Looking for a different receipt? Use the reprint tool to search by sale or receipt number.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Reprint Receipt</CardTitle>
            <CardDescription>Search for specific receipts using sale or receipt numbers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-3" onSubmit={handleReprintLookup}>
              <div className="space-y-2">
                <Label htmlFor="receipt-code">Sale or Receipt Number</Label>
                <Input
                  id="receipt-code"
                  placeholder="POS-123456789 or receipt ID"
                  value={reprintSaleNumber}
                  onChange={(event) => setReprintSaleNumber(event.target.value)}
                />
                {reprintError ? <p className="text-xs font-medium text-destructive">{reprintError}</p> : null}
                {!isSupabaseConfigured ? (
                  <p className="text-[11px] text-muted-foreground">
                    Demo mode keeps only the most recent receipt locally.
                  </p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={isReprintLoading}>
                {isReprintLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </span>
                ) : (
                  "Open Receipt"
                )}
              </Button>
            </form>
            <Separator />
            <div className="rounded-md border border-muted/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              Tip: searching by the sale number (e.g., POS-123456789) is fastest. You can also paste the receipt UUID if
              you have it.
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isReceiptOpen} onOpenChange={(open) => (open ? setIsReceiptOpen(true) : handleCloseReceipt())}>
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
                {receiptData.voidedAt ? (
                  <div className="mb-4 flex flex-col items-center gap-1 rounded border border-destructive/50 bg-destructive/10 p-3 text-destructive">
                    <span className="text-sm font-semibold uppercase tracking-wide">Voided Receipt</span>
                    <span className="text-xs">
                      Voided on {format(new Date(receiptData.voidedAt), "PPpp")}
                      {receiptData.voidReason ? ` · ${receiptData.voidReason}` : ""}
                    </span>
                  </div>
                ) : null}
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
                  <span className="text-right font-medium">{receiptData.saleNumber ?? receiptData.saleId}</span>
                  {receiptData.cashierName ? (
                    <>
                      <span className="text-muted-foreground">Cashier</span>
                      <span className="text-right font-medium">{receiptData.cashierName}</span>
                    </>
                  ) : null}
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
                  {receiptData.receiptIssuedAt ? (
                    <>
                      <span className="text-muted-foreground">Issued</span>
                      <span className="text-right font-medium">
                        {format(new Date(receiptData.receiptIssuedAt), "PPP")}
                      </span>
                    </>
                  ) : null}
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
                  <Button variant="outline" onClick={handleDownloadReceipt} disabled={isDownloadingReceipt}>
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
                <div className="flex flex-wrap items-center gap-2">
                   {canVoid && !receiptData.voidedAt ? (
                     <Button variant="destructive" onClick={() => setIsVoidDialogOpen(true)}>
                       Void Receipt
                     </Button>
                   ) : null}
                  <Button onClick={handleCloseReceipt}>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Done
                    </span>
                  </Button>
                </div>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">Preparing receipt…</div>
          )}
        </DialogContent>
      </Dialog>

       <AlertDialog open={isVoidDialogOpen} onOpenChange={setIsVoidDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Are you sure you want to void this receipt?</AlertDialogTitle>
             <AlertDialogDescription>
               Voiding will remove the sale from analytics, restock the products involved, and log this action.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <div className="space-y-3 py-2">
             <Label htmlFor="void-reason">Void reason (optional)</Label>
             <Textarea
               id="void-reason"
               placeholder="Reason for voiding the receipt"
               value={voidReason}
               onChange={(event) => setVoidReason(event.target.value)}
               rows={3}
               disabled={isVoiding}
             />
             <p className="text-xs text-muted-foreground">
               This action cannot be undone. Inventory will be restored automatically.
             </p>
           </div>
           <AlertDialogFooter>
             <AlertDialogCancel disabled={isVoiding}>Cancel</AlertDialogCancel>
             <AlertDialogAction
               disabled={isVoiding}
               onClick={(event) => {
                 event.preventDefault();
                 void handleVoidReceipt();
               }}
               className="flex items-center gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               {isVoiding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
               {isVoiding ? "Voiding…" : "Confirm Void"}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
    </div>
  );
}

