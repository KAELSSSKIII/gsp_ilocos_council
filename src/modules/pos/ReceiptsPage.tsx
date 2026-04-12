import { useState, useCallback, FormEvent, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { FEATURE_ACCESS, hasRoleAccess } from "@/lib/permissions";
import { formatCurrency } from "@/utils/format";
import api from "@/lib/api";
import { useSessionStore, selectProfile, selectRole } from "@/store/sessionStore";
import { ReceiptData, ReceiptHistoryItem } from "@/modules/pos/types";
import { readLocalReceipt, writeLocalReceipt } from "@/modules/pos/utils/receiptStorage";
import {
  Loader2,
  Download,
  Printer,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceiptSettingsPage } from "@/modules/pos/ReceiptSettingsPage";
import { BIRInvoiceTemplate } from "@/modules/pos/components/BIRInvoiceTemplate";
import { ThermalReceiptTemplate } from "@/modules/pos/components/ThermalReceiptTemplate";
import { readLocalReceiptSettings } from "@/modules/pos/utils/receiptSettingsStorage";

type ReceiptRecord = {
  sale_id: string;
  sale_number?: string | null;
  created_at: string;
  cashier_id?: string | null;
  cashier?: { full_name?: string | null } | { full_name?: string | null }[] | null;
  payload?: ReceiptData | null;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
};

export function ReceiptsPage() {
  const profile = useSessionStore(selectProfile);
  const role = useSessionStore(selectRole);
  const canManageReceiptSettings = hasRoleAccess(role, FEATURE_ACCESS.manageReceiptSettings);
  const canFilterByCashier = hasRoleAccess(role, FEATURE_ACCESS.filterReceiptsByCashier);
  const canViewStaffDirectory = hasRoleAccess(role, FEATURE_ACCESS.viewStaffDirectory);
  const queryClient = useQueryClient();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState<string>(todayStr);
  const [dateTo,   setDateTo]   = useState<string>(todayStr);
  const [selectedCashier, setSelectedCashier] = useState<string>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);
  const [, setIsReprintDialogOpen] = useState(false);
  const [reprintSaleNumber, setReprintSaleNumber] = useState("");
  const [reprintError, setReprintError] = useState<string | null>(null);
  const [isReprintLoading, setIsReprintLoading] = useState(false);
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptHistoryItem | null>(null);
  const [, setLocalReceiptsVersion] = useState(0);

  const fromISO = dateFrom ? new Date(dateFrom + "T00:00:00").toISOString() : null;
  const toISO   = dateTo   ? new Date(dateTo   + "T23:59:59").toISOString() : null;
  const historyPageSize = 25;

  // Cashier list for admin/accountant filter dropdown
  const { data: cashierList = [] } = useQuery({
    queryKey: ["receipts-cashier-list"],
    queryFn: () =>
      api.get<{ users: { id: string; full_name: string; role: string }[] }>("/auth/users")
        .then((r) => r.users.filter((u) => u.role === "cashier" || u.role === "admin")),
    enabled: canViewStaffDirectory,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: receiptHistoryResponse,
    isFetching: loadingReceipts,
    refetch: refetchReceipts,
  } = useQuery({
    queryKey: ["receipt-history", fromISO, toISO, selectedCashier, historyPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromISO) params.set("from", fromISO);
      if (toISO)   params.set("to",   toISO);
      if (selectedCashier !== "all") params.set("cashier_id", selectedCashier);
      params.set("page", String(historyPage));
      params.set("page_size", String(historyPageSize));
      const qs = params.toString();
      const { receipts, total } = await api.get<{ receipts: ReceiptRecord[]; total: number }>(`/sales/receipts${qs ? `?${qs}` : ""}`);

      const items = (
        receipts?.flatMap((record) => {
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

      return { items, total };
    },
  });

  const remoteReceipts = receiptHistoryResponse?.items ?? [];
  const remoteReceiptTotal = receiptHistoryResponse?.total ?? 0;
  const totalHistoryPages = Math.max(1, Math.ceil(remoteReceiptTotal / historyPageSize));

  const localReceipts = (() => {
    const stored = readLocalReceipt();
    if (!stored) return [];
    const storedDate = new Date(stored.createdAt);
    if (Number.isNaN(storedDate.getTime())) return [];
    const afterFrom = fromISO ? storedDate >= new Date(fromISO) : true;
    const beforeTo  = toISO   ? storedDate <= new Date(toISO)   : true;
    return afterFrom && beforeTo
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
  })();

  const receiptHistoryList = remoteReceipts.length > 0 ? remoteReceipts : localReceipts;
  const hasReceipts = receiptHistoryList.length > 0;
  const canVoid = hasRoleAccess(profile?.role, FEATURE_ACCESS.voidSales);

  const handleHistoryFilterChange = useCallback((updater: () => void) => {
    updater();
    setHistoryPage(1);
  }, []);

  const normalizeSaleNumber = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const cleaned = trimmed.replace(/^#/, "");
    const uuidPattern = /^[0-9a-fA-F-]{36}$/;
    if (uuidPattern.test(cleaned)) return cleaned;
    return cleaned.toUpperCase();
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

  const handlePrintReceipt = useCallback(() => {
    if (!receiptRef.current || !receiptData) {
      toast.error("Receipt is not ready to print yet.");
      return;
    }

    const prefs = readLocalReceiptSettings();
    const paperWidth = prefs?.paperWidth ?? "a4";
    const thermalStyle = paperWidth === "a4" ? "" : paperWidth === "58mm" ? `
      @page { margin: 0; size: 58mm; }
      body { width: 58mm; padding: 2px 3mm; font-size: 9px; margin: 0; }
      .receipt-wrapper { max-width: 52mm; margin: 0; border: none; padding: 0; }
    ` : `
      @page { margin: 0; size: 80mm; }
      body { width: 80mm; padding: 4px 6px; font-size: 11px; }
      .receipt-wrapper { max-width: 100%; border: none; padding: 0; }
    `;

    const html = `
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
            ${thermalStyle}
          </style>
        </head>
        <body>
          <div class="receipt-wrapper">${receiptRef.current.innerHTML}</div>
        </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      toast.error("Could not prepare print frame.");
      return;
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    };
  }, [receiptData]);

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
      const resolvedSaleId: string | null = activeReceipt.saleId ?? null;

      if (!resolvedSaleId) {
        throw new Error("SALE_NOT_FOUND");
      }

      const voidResult = await api.post<{ success: boolean; accountingError?: boolean; warning?: string }>(`/sales/${resolvedSaleId}/void`, { reason });

      try {
        await api.patch(`/rental/bookings/by-sale/${resolvedSaleId}`, { status: "cancelled" });
      } catch (bookingError) {
        if (import.meta.env.DEV) console.warn("Failed to cancel rental bookings", bookingError);
      }

      applyLocalUpdate(resolvedSaleId);
      if (voidResult.accountingError) {
        toast.error(voidResult.warning ?? "Sale voided but accounting reversal failed. Post a manual reversal in Accounting → Manual Journal.");
      } else {
        toast.success("Receipt voided successfully.");
      }
      await refetchReceipts();
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
      await queryClient.invalidateQueries({ queryKey: ["products", "inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["receipt-history"] });
      await queryClient.invalidateQueries({ queryKey: ["rental-bookings"] });
      setIsVoidDialogOpen(false);
      setVoidReason("");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
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
      if (import.meta.env.DEV) console.error(error);
      toast.error("Failed to download receipt.");
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  const handleEmailReceipt = async () => {
    toast.info("Email receipt feature is not currently available.");
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
      const uuidPattern = /^[0-9a-fA-F-]{36}$/;
      const numericPattern = /^\d+$/;

      const params = new URLSearchParams({
        search: code,
        page: "1",
        page_size: "25",
      });
      const { receipts } = await api.get<{ receipts: ReceiptRecord[] }>(`/sales/receipts?${params.toString()}`);

      const found = receipts?.find((record) => {
        if (uuidPattern.test(code)) {
          return record.sale_id === code || record.sale_number === code;
        }
        if (numericPattern.test(code)) {
          return (
            record.sale_number === code ||
            String(record.payload?.receiptNumber) === code
          );
        }
        return record.sale_number === code;
      }) ?? null;

      if (!found?.payload || typeof found.payload !== "object") {
        setReprintError("Receipt not found.");
        setIsReprintLoading(false);
        return;
      }

      const payload = found.payload as unknown as ReceiptData;
      const cashierNameFromJoin = Array.isArray(found?.cashier)
        ? found.cashier[0]?.full_name
        : found?.cashier?.full_name;
      const normalizedPayload: ReceiptData = {
        ...payload,
        cashierId: payload.cashierId ?? found?.cashier_id ?? null,
        cashierName: payload.cashierName ?? cashierNameFromJoin ?? null,
      };
      setReceiptData(normalizedPayload);
      writeLocalReceipt(normalizedPayload);
      setIsReceiptOpen(true);
      setIsReprintDialogOpen(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
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
        <div className="flex w-full flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Receipts</h1>
            <p className="text-sm text-muted-foreground">
              Browse daily transactions, reprint receipts, and manage your receipt series.
            </p>
          </div>
        </div>
      </header>

      <div className="w-full">
        <Tabs defaultValue="history">
          <TabsList className="mb-6">
            <TabsTrigger value="history">Receipt History</TabsTrigger>
            {canManageReceiptSettings && (
              <TabsTrigger value="settings">Receipt Settings</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="history">
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border-border">
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-card-foreground">Receipt History</CardTitle>
              <CardDescription>Filter by date range{canFilterByCashier ? " and cashier" : ""}.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <Label htmlFor="receipts-date-from" className="text-xs">From</Label>
                <Input
                  id="receipts-date-from"
                  type="date"
                  value={dateFrom}
                  max={dateTo || todayStr}
                  onChange={(e) => handleHistoryFilterChange(() => setDateFrom(e.target.value))}
                  className="h-9 w-36 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="receipts-date-to" className="text-xs">To</Label>
                <Input
                  id="receipts-date-to"
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  max={todayStr}
                  onChange={(e) => handleHistoryFilterChange(() => setDateTo(e.target.value))}
                  className="h-9 w-36 text-sm"
                />
              </div>
              {canFilterByCashier && cashierList.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="receipts-cashier-filter">Cashier</Label>
                  <Select value={selectedCashier} onValueChange={(value) => handleHistoryFilterChange(() => setSelectedCashier(value))}>
                    <SelectTrigger id="receipts-cashier-filter" className="h-9 w-44 text-sm">
                      <SelectValue placeholder="All Accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      {cashierList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenReceipt(item)}
                        aria-label={`View receipt ${item.saleNumber}`}
                      >
                        View
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-muted-foreground/50 px-3 py-6 text-center text-sm text-muted-foreground">
                No receipts matched your current filters. Try widening the date range or changing the cashier filter.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Looking for a different receipt? Use the reprint tool to search by sale or receipt number.
            </p>
            {remoteReceiptTotal > historyPageSize ? (
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Page {historyPage} of {totalHistoryPages} · {remoteReceiptTotal} receipt{remoteReceiptTotal === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyPage <= 1 || loadingReceipts}
                    onClick={() => setHistoryPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= totalHistoryPages || loadingReceipts}
                    onClick={() => setHistoryPage((value) => Math.min(totalHistoryPages, value + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
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
                  placeholder="POS-NO or receipt ID"
                  value={reprintSaleNumber}
                  onChange={(event) => setReprintSaleNumber(event.target.value)}
                />
                {reprintError ? <p className="text-xs font-medium text-destructive">{reprintError}</p> : null}
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
          </TabsContent>

          {canManageReceiptSettings && (
            <TabsContent value="settings">
              <ReceiptSettingsPage embedded />
            </TabsContent>
          )}
        </Tabs>
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
                aria-label="Receipt preview"
                className="rounded-lg border border-muted-foreground/30 bg-white shadow-inner overflow-auto max-h-[60vh]"
              >
                {readLocalReceiptSettings()?.paperWidth === "58mm" ? (
                  <ThermalReceiptTemplate receiptData={receiptData} />
                ) : (
                  <BIRInvoiceTemplate receiptData={receiptData} />
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
                    <Button variant="outline" onClick={handleEmailReceipt}>
                      <Mail className="mr-2 h-4 w-4" />
                      Email Receipt
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

