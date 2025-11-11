import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Download, Printer } from "lucide-react";
import { formatCurrency } from "@/utils/format";

type ReportRow = {
  id: string;
  saleNumber: string;
  receiptNumber: number | null;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  cashierId: string;
  cashierName: string;
  lineItems: string[];
  salesAmount: number;
  rentalAmount: number;
};

type SummaryTotals = {
  totalCashSales: number;
  totalVoidedSales: number;
  netCollection: number;
  receiptRange: string;
  totalReceiptsIssued: number;
  totalSalesMerch: number;
  totalRental: number;
};

type CashierSummary = {
  cashierId: string;
  cashierName: string;
  completedTotal: number;
  voidedTotal: number;
  net: number;
};

const formatDateInput = (value: Date) => value.toISOString().slice(0, 10);

export function DCCRPage() {
  const profile = useSessionStore(selectProfile);

  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [selectedCashier, setSelectedCashier] = useState<string>(
    profile?.id ?? "all"
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      setSelectedCashier(profile.id);
    }
  }, [profile?.id]);

  const cashiersQuery = useQuery({
    queryKey: ["dccr-cashiers"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["cashier", "admin", "accountant"])
        .order("full_name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const reportQuery = useQuery({
    queryKey: ["dccr-report", selectedDate, selectedCashier, refreshKey],
    enabled: hasGenerated,
    queryFn: async (): Promise<ReportRow[]> => {
      if (!isSupabaseConfigured) {
        return [];
      }

      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      let query = supabase
        .from("sales")
        .select(
          `
            id,
            sale_number,
            receipt_number,
            total_amount,
            status,
            created_at,
            payment_method,
            cashier_id,
            profiles!sales_cashier_id_fkey(full_name),
            sale_items(quantity, subtotal, products(name, category:product_categories(name)))
          `
        )
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: true });

      if (selectedCashier && selectedCashier !== "all") {
        query = query.eq("cashier_id", selectedCashier);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row) => {
        const rawItems = Array.isArray(row.sale_items)
          ? row.sale_items
          : row.sale_items
            ? [row.sale_items]
            : [];

        let salesAmount = 0;
        let rentalAmount = 0;

        const lineItems = rawItems.map((item: any) => {
          const quantity = Number(item?.quantity ?? 0);
          const name =
            (item?.products?.name as string | null) ??
            "Unspecified item";
          const categoryName =
            (item?.products?.category?.name as string | undefined) ??
            undefined;
          const subtotal = Number(item?.subtotal ?? 0);
          const isRental = categoryName && /rental/i.test(categoryName);
          if (isRental) {
            rentalAmount += subtotal;
          } else {
            salesAmount += subtotal;
          }
          const prefix = isRental ? "Rental" : "Sale";
          return `${prefix}: ${quantity} × ${name}`;
        });

        return {
          id: row.id,
          saleNumber: row.sale_number ?? "—",
          receiptNumber: row.receipt_number ?? null,
          totalAmount: Number(row.total_amount ?? 0),
          paymentMethod: row.payment_method ?? "unknown",
          status: row.status ?? "completed",
          createdAt: row.created_at,
          cashierId: row.cashier_id ?? "unknown",
          cashierName:
            (Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name) ??
            "Unknown cashier",
          lineItems,
          salesAmount,
          rentalAmount,
        };
      });
    },
    keepPreviousData: true,
  });

  const summary: SummaryTotals = useMemo(() => {
    const rows = reportQuery.data ?? [];

    const totalCashSales = rows
      .filter((row) => row.status !== "voided" && row.paymentMethod === "cash")
      .reduce((sum, row) => sum + row.totalAmount, 0);

    const totalVoidedSales = rows
      .filter((row) => row.status === "voided")
      .reduce((sum, row) => sum + row.totalAmount, 0);

    const totalCompleted = rows
      .filter((row) => row.status !== "voided")
      .reduce((sum, row) => sum + row.totalAmount, 0);
    const netCollection = totalCompleted;

    const totalRental = rows
      .filter((row) => row.status !== "voided")
      .reduce((sum, row) => sum + row.rentalAmount, 0);

    const totalSalesMerch = rows
      .filter((row) => row.status !== "voided")
      .reduce((sum, row) => sum + row.salesAmount, 0);

    const receiptNumbers = rows
      .map((row) => (row.receiptNumber != null ? Number(row.receiptNumber) : null))
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b);

    const receiptRange =
      receiptNumbers.length > 0
        ? `${receiptNumbers[0]} – ${receiptNumbers[receiptNumbers.length - 1]}`
        : "—";

    return {
      totalCashSales,
      totalVoidedSales,
      netCollection,
      receiptRange,
      totalReceiptsIssued: receiptNumbers.length,
      totalSalesMerch,
      totalRental,
    };
  }, [reportQuery.data]);

  const cashierBreakdown: CashierSummary[] = useMemo(() => {
    const rows = reportQuery.data ?? [];
    const groups = new Map<string, CashierSummary>();

    rows.forEach((row) => {
      const key = row.cashierId;
      if (!groups.has(key)) {
        groups.set(key, {
          cashierId: row.cashierId,
          cashierName: row.cashierName,
          completedTotal: 0,
          voidedTotal: 0,
          net: 0,
        });
      }

      const group = groups.get(key)!;
      if (row.status === "voided") {
        group.voidedTotal += row.totalAmount;
      } else {
        group.completedTotal += row.totalAmount;
      }
      group.net = group.completedTotal;
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.cashierName.localeCompare(b.cashierName)
    );
  }, [reportQuery.data]);

  const selectedCashierLabel = useMemo(() => {
    if (selectedCashier === "all" || !selectedCashier) return "All cashiers";
    if (selectedCashier === profile?.id) {
      return profile?.full_name ? `${profile.full_name} (You)` : "Current cashier";
    }
    const match = cashiersQuery.data?.find((cashier) => cashier.id === selectedCashier);
    return match?.full_name ?? selectedCashier;
  }, [selectedCashier, profile?.id, profile?.full_name, cashiersQuery.data]);

  const buildPrintableMarkup = () => {
    const summaryCards = `
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Total Cash Sales</h3>
          <div>${formatCurrency(summary.totalCashSales)}</div>
        </div>
        <div class="summary-card">
          <h3>Total Voided Sales</h3>
          <div>${formatCurrency(summary.totalVoidedSales)}</div>
        </div>
        <div class="summary-card">
          <h3>Net Sales (excludes voids)</h3>
          <div>${formatCurrency(summary.netCollection)}</div>
        </div>
        <div class="summary-card">
          <h3>Rental Revenue</h3>
          <div>${formatCurrency(summary.totalRental)}</div>
        </div>
        <div class="summary-card">
          <h3>Merchandise Sales</h3>
          <div>${formatCurrency(summary.totalSalesMerch)}</div>
        </div>
        <div class="summary-card">
          <h3>Receipt Range</h3>
          <div>${summary.receiptRange}</div>
        </div>
        <div class="summary-card">
          <h3>Receipts Issued</h3>
          <div>${summary.totalReceiptsIssued}</div>
        </div>
      </div>
    `;

    const rows = (reportQuery.data ?? [])
      .map((row) => {
        const itemsMarkup = row.lineItems.length
          ? `<ul class="items-list">${row.lineItems.map((item) => `<li>${item}</li>`).join("")}</ul>`
          : `<span class="no-items">No items</span>`;

        return `
          <tr>
            <td>${row.receiptNumber ?? "—"}</td>
            <td>${row.cashierName}</td>
            <td>${itemsMarkup}</td>
            <td>${formatCurrency(row.totalAmount)}</td>
            <td class="capitalize">${row.paymentMethod}</td>
            <td>${new Date(row.createdAt).toLocaleString()}</td>
            <td>${row.status === "voided" ? "Void" : "Completed"}</td>
          </tr>
        `;
      })
      .join("");

    const cashierRows = cashierBreakdown
      .map(
        (item) => `
          <tr>
            <td>${item.cashierName}</td>
            <td>${formatCurrency(item.completedTotal)}</td>
            <td>${formatCurrency(item.voidedTotal)}</td>
            <td>${formatCurrency(item.net)}</td>
          </tr>
        `
      )
      .join("");

    const breakdownTable =
      cashierBreakdown.length > 1
        ? `
            <h3 class="section-title">Summary by Cashier</h3>
            <table>
              <thead>
                <tr>
                  <th>Cashier</th>
                  <th>Total Sales</th>
                  <th>Voided</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>${cashierRows}</tbody>
            </table>
          `
        : "";

    return `
      <style>
        .report-root { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; }
        .report-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
        .report-header h1 { font-size: 20px; margin: 0 0 4px; }
        .report-header p { font-size: 12px; color: #475569; margin: 0; }
        .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin: 16px 0 24px; }
        .summary-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
        .summary-card h3 { font-size: 11px; text-transform: uppercase; color: #64748b; margin: 0 0 6px; }
        .summary-card div { font-size: 16px; font-weight: 600; color: #0f172a; }
        .items-list { margin: 0; padding-left: 16px; }
        .items-list li { margin: 2px 0; font-size: 11px; color: #334155; }
        .no-items { font-size: 11px; color: #94a3b8; font-style: italic; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 12px; }
        th { background: #f1f5f9; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #475569; }
        .section-title { margin-top: 24px; font-size: 14px; font-weight: 600; color: #1e293b; }
      </style>
      <div class="report-root">
        <header class="report-header">
          <div>
            <h1>Daily Cash Collection Report</h1>
            <p>${formattedDate} · ${selectedCashierLabel}</p>
          </div>
        </header>
        ${summaryCards}
        <h3 class="section-title">Transactions</h3>
        <table>
          <thead>
            <tr>
              <th>Receipt No.</th>
              <th>Cashier</th>
              <th>Items</th>
              <th>Sale Amount</th>
              <th>Payment Method</th>
              <th>Date / Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows || "<tr><td colspan=7>No data</td></tr>"}
          </tbody>
        </table>
        ${breakdownTable}
      </div>
    `;
  };

  const handleGenerateReport = () => {
    setRefreshKey((prev) => prev + 1);
    if (!hasGenerated) {
      setHasGenerated(true);
    }
  };

  const handleExportPdf = async () => {
    const markup = buildPrintableMarkup();
    const element = document.createElement("div");
    element.innerHTML = markup;

    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default ?? html2pdfModule;
    const filename = `dccr-${selectedDate}${
      selectedCashier && selectedCashier !== "all" ? `-${selectedCashier}` : ""
    }.pdf`;

    await html2pdf()
      .set({
        margin: 12,
        filename,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(element)
      .save();
  };

  const handlePrint = () => {
    const markup = buildPrintableMarkup();
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>DCCR ${selectedDate}</title>
          <style>
            :root { color-scheme: light; font-family: "Segoe UI", Arial, sans-serif; }
            body { margin: 24px; color: #0f172a; background: #ffffff; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 12px; }
            th { background: #f8fafc; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #475569; }
            .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: 16px; }
            .summary-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .summary-card h3 { font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
            .summary-card div { font-size: 16px; font-weight: 600; color: #0f172a; }
            .report-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
            .report-header h1 { font-size: 20px; margin-bottom: 4px; }
            .report-header p { font-size: 12px; color: #475569; }
            .section-title { margin-top: 24px; font-size: 14px; font-weight: 600; color: #1e293b; }
          </style>
        </head>
        <body>
          ${markup}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const formattedDate = useMemo(() => {
    const date = new Date(selectedDate);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [selectedDate]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-800">Daily Cash Collection Report</h1>
          <p className="text-sm text-slate-500">
            Monitor and export daily cashier collections.
          </p>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="py-3">
            <CardTitle className="text-base font-semibold text-amber-800">
              Supabase connection inactive
            </CardTitle>
            <CardDescription className="text-sm text-amber-700">
              Connect your Supabase project to generate real DCCR data. Showing 0 totals until a
              connection is configured.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <FileText className="h-5 w-5 text-emerald-700" />
            Report Filters
          </CardTitle>
          <CardDescription>
            Choose a date and cashier, then generate the collection report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Date</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Cashier</label>
              <Select
                value={selectedCashier}
                onValueChange={(value) => setSelectedCashier(value)}
                disabled={cashiersQuery.isLoading}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select cashier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cashiers</SelectItem>
                  {profile?.id && (
                    <SelectItem value={profile.id}>
                      {profile.full_name ? `${profile.full_name} (You)` : "Current cashier"}
                    </SelectItem>
                  )}
                  {cashiersQuery.data
                    ?.filter((cashier) => cashier.id !== profile?.id)
                    .map((cashier) => (
                      <SelectItem key={cashier.id} value={cashier.id}>
                        {cashier.full_name ?? cashier.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                onClick={handleGenerateReport}
                className="w-full sm:w-auto"
                disabled={reportQuery.isFetching && hasGenerated}
              >
                {reportQuery.isFetching && hasGenerated ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  "Generate Report"
                )}
              </Button>
              {hasGenerated && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="hidden sm:inline-flex"
                    onClick={handlePrint}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="hidden sm:inline-flex"
                    onClick={handleExportPdf}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export PDF
                  </Button>
                </>
              )}
            </div>
          </div>

          {hasGenerated && (
            <>
              <div className="flex items-center gap-2 sm:hidden">
                <Button type="button" variant="outline" className="flex-1" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={handleExportPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
              </div>

              <div id="dccr-report-container" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card className="border-emerald-100 bg-emerald-50">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-emerald-600">
                      Total Cash Sales
                    </CardDescription>
                    <CardTitle className="text-emerald-800 text-xl">
                      {formatCurrency(summary.totalCashSales)}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-rose-100 bg-rose-50">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-rose-600">
                      Total Voided Sales
                    </CardDescription>
                    <CardTitle className="text-rose-700 text-xl">
                      {formatCurrency(summary.totalVoidedSales)}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-sky-100 bg-sky-50">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-sky-600">
                      Net Sales (excludes voids)
                    </CardDescription>
                    <CardTitle className="text-sky-700 text-xl">
                      {formatCurrency(summary.netCollection)}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-emerald-100 bg-white">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-emerald-600">
                      Rental Revenue
                    </CardDescription>
                    <CardTitle className="text-emerald-700 text-xl">
                      {formatCurrency(summary.totalRental)}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-emerald-100 bg-white">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-emerald-600">
                      Merchandise Sales
                    </CardDescription>
                    <CardTitle className="text-emerald-700 text-xl">
                      {formatCurrency(summary.totalSalesMerch)}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-amber-100 bg-amber-50">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-amber-600">
                      Receipt Range
                    </CardDescription>
                    <CardTitle className="text-amber-700 text-xl">
                      {summary.receiptRange}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-violet-100 bg-violet-50">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-violet-600">
                      Receipts Issued
                    </CardDescription>
                    <CardTitle className="text-violet-700 text-xl">
                      {summary.totalReceiptsIssued}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-slate-100 bg-white">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase text-slate-500">
                      Report Date
                    </CardDescription>
                    <CardTitle className="text-slate-700 text-lg">{formattedDate}</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-card-foreground">Transactions</CardTitle>
                    <CardDescription>
                      {reportQuery.isFetching
                        ? "Fetching report..."
                        : `${reportQuery.data?.length ?? 0} transactions`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Receipt No.</TableHead>
                            <TableHead>Cashier</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Sale Amount</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead>Date / Time</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportQuery.isFetching ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-sm">
                                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading transactions...
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : reportQuery.data && reportQuery.data.length > 0 ? (
                            reportQuery.data.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="font-medium">
                                  {row.receiptNumber ?? "—"}
                                </TableCell>
                                <TableCell>{row.cashierName}</TableCell>
                                <TableCell className="w-[260px]">
                                  {row.lineItems.length ? (
                                    <ul className="space-y-1 text-xs text-muted-foreground">
                                      {row.lineItems.map((item, index) => (
                                        <li key={`${row.id}-item-${index}`}>{item}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No items</span>
                                  )}
                                </TableCell>
                                <TableCell>{formatCurrency(row.totalAmount)}</TableCell>
                                <TableCell className="capitalize">{row.paymentMethod}</TableCell>
                                <TableCell>
                                  {new Date(row.createdAt).toLocaleString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={row.status === "voided" ? "destructive" : "secondary"}
                                    className="capitalize"
                                  >
                                    {row.status === "voided" ? "Void" : "Completed"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-sm">
                                <div className="py-6 text-muted-foreground">
                                  No transactions found for the selected filters.
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {cashierBreakdown.length > 1 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-card-foreground">
                        Summary by Cashier
                      </CardTitle>
                      <CardDescription>
                        Totals for each cashier working on {formattedDate}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cashier</TableHead>
                              <TableHead>Total Sales</TableHead>
                              <TableHead>Voided</TableHead>
                              <TableHead>Net</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cashierBreakdown.map((item) => (
                              <TableRow key={item.cashierId}>
                                <TableCell>{item.cashierName}</TableCell>
                                <TableCell>{formatCurrency(item.completedTotal)}</TableCell>
                                <TableCell>{formatCurrency(item.voidedTotal)}</TableCell>
                                <TableCell>{formatCurrency(item.net)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

