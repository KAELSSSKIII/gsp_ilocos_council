import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
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
import { Loader2, FileText, Download, Printer, FileSpreadsheet, FileType } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import { readBusinessSettings } from "@/utils/businessSettings";
import * as XLSX from "xlsx";

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

type SaleReportItem = {
  quantity?: number | string | null;
  product_name?: string | null;
  category_name?: string | null;
  subtotal?: number | string | null;
};

type SaleReportRow = {
  id: string;
  sale_number?: string | null;
  receipt_number?: number | string | null;
  total_amount?: number | string | null;
  payment_method?: string | null;
  status?: string | null;
  created_at: string;
  cashier_id?: string | null;
  cashier_name?: string | null;
  items?: unknown;
};

const formatDateInput = (value: Date) => value.toISOString().slice(0, 10);

export function DCCRPage() {
  const profile = useSessionStore(selectProfile);
  const isCashier = profile?.role === "cashier";

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
    queryFn: async () => {
      const { users } = await api.get<{ users: { id: string; full_name: string; role: string }[] }>("/auth/users");
      return (users ?? []).filter((u) => ["cashier", "admin", "accountant"].includes(u.role));
    },
  });

  const reportQuery = useQuery({
    queryKey: ["dccr-report", selectedDate, selectedCashier, refreshKey],
    enabled: hasGenerated,
    queryFn: async (): Promise<ReportRow[]> => {
      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const params = new URLSearchParams({
        from: start.toISOString(),
        to: end.toISOString(),
        include_items: "true",
      });
      if (selectedCashier && selectedCashier !== "all") {
        params.set("cashier_id", selectedCashier);
      }

      const { sales } = await api.get<{ sales: SaleReportRow[] }>(`/sales?${params.toString()}`);

      return (sales ?? []).map((row) => {
        const rawItems: SaleReportItem[] = Array.isArray(row.items) ? row.items : [];

        let salesAmount = 0;
        let rentalAmount = 0;

        const lineItems = rawItems.map((item) => {
          const quantity = Number(item?.quantity ?? 0);
          const name = item.product_name ?? "Unspecified item";
          const categoryName = item.category_name ?? undefined;
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
          receiptNumber: row.receipt_number != null ? Number(row.receipt_number) : null,
          totalAmount: Number(row.total_amount ?? 0),
          paymentMethod: row.payment_method ?? "unknown",
          status: row.status ?? "completed",
          createdAt: row.created_at,
          cashierId: row.cashier_id ?? "unknown",
          cashierName: row.cashier_name ?? "Unknown cashier",
          lineItems,
          salesAmount,
          rentalAmount,
        };
      });
    },
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
    if (selectedCashier === "all" || !selectedCashier) return "All Accounts";
    if (selectedCashier === profile?.id) {
      return profile?.full_name ? `${profile.full_name} (You)` : "Current cashier";
    }
    const match = cashiersQuery.data?.find((cashier) => cashier.id === selectedCashier);
    return match?.full_name ?? selectedCashier;
  }, [selectedCashier, profile?.id, profile?.full_name, cashiersQuery.data]);

  const buildPrintableMarkup = () => {
    const biz = readBusinessSettings();
    const orgName = biz.orgName;
    const councilName = biz.councilName;
    const orgAddress = biz.orgAddress;
    const preparedByName = biz.reportPreparedByName;
    const preparedByTitle = biz.reportPreparedByTitle;
    const verifiedByName = biz.reportVerifiedByName;
    const verifiedByTitle = biz.reportVerifiedByTitle;
    const approvedByName = biz.reportApprovedByName;
    const approvedByTitle = biz.reportApprovedByTitle;

    const rows = (reportQuery.data ?? [])
      .map((row) => {
        const itemsMarkup = row.lineItems.length
          ? row.lineItems.map((item: string) => `<div class="item-line">${item}</div>`).join("")
          : `<span class="no-items">—</span>`;
        const isVoid = row.status === "voided";
        return `
          <tr class="${isVoid ? "void-row" : ""}">
            <td class="center">${row.receiptNumber ?? "—"}</td>
            <td>${row.cashierName}</td>
            <td class="items-cell">${itemsMarkup}</td>
            <td class="right mono">${formatCurrency(row.salesAmount)}</td>
            <td class="right mono">${formatCurrency(row.rentalAmount)}</td>
            <td class="right mono bold ${isVoid ? "void-amt" : ""}">${isVoid ? `<span class="void-badge">VOID</span>` : formatCurrency(row.totalAmount)}</td>
            <td class="center capitalize">${row.paymentMethod}</td>
            <td class="center">${new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
          </tr>
        `;
      })
      .join("");

    const cashierRows = cashierBreakdown
      .map((item) => `
        <tr>
          <td>${item.cashierName}</td>
          <td class="right mono">${formatCurrency(item.completedTotal)}</td>
          <td class="right mono void-amt">${item.voidedTotal > 0 ? formatCurrency(item.voidedTotal) : "—"}</td>
          <td class="right mono bold">${formatCurrency(item.net)}</td>
        </tr>
      `).join("");

    const breakdownSection = cashierBreakdown.length > 1 ? `
      <div class="section-gap"></div>
      <div class="section-header">Summary by Cashier</div>
      <table>
        <thead>
          <tr>
            <th>Cashier</th>
            <th class="right">Total Sales</th>
            <th class="right">Voided</th>
            <th class="right">Net Collection</th>
          </tr>
        </thead>
        <tbody>${cashierRows}</tbody>
      </table>
    ` : "";

    return `
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 28px 32px; background: #fff; }

        /* ── Letterhead ── */
        .letterhead { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 12px; border-bottom: 3px solid #166534; margin-bottom: 16px; }
        .letterhead-left .org-name { font-size: 15px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 2px; }
        .letterhead-left .council-name { font-size: 11px; font-weight: 600; color: #15803d; margin: 0 0 2px; }
        .letterhead-left .org-address { font-size: 10px; color: #475569; margin: 0; }
        .letterhead-right { text-align: right; }
        .letterhead-right .report-title { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 2px; }
        .letterhead-right .report-meta { font-size: 10px; color: #64748b; margin: 0; line-height: 1.5; }

        /* ── Summary strip ── */
        .summary-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0; margin: 14px 0 18px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
        .summary-item { padding: 10px 10px 8px; border-right: 1px solid #e2e8f0; background: #f8fafc; }
        .summary-item:last-child { border-right: none; }
        .summary-item.highlight { background: #f0fdf4; }
        .summary-item .s-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px; }
        .summary-item .s-value { font-size: 13px; font-weight: 700; color: #0f172a; }
        .summary-item.highlight .s-value { color: #166534; }

        /* ── Section ── */
        .section-header { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
        .section-gap { margin-top: 22px; }

        /* ── Table ── */
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        thead tr { background: #1e293b; }
        thead th { color: #f8fafc; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 7px 10px; text-align: left; }
        thead th.right { text-align: right; }
        thead th.center { text-align: center; }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        tbody tr.void-row { background: #fef2f2 !important; }
        tbody td { padding: 6px 10px; vertical-align: top; color: #1e293b; }
        tbody td.right { text-align: right; }
        tbody td.center { text-align: center; }
        tbody td.mono { font-variant-numeric: tabular-nums; }
        tbody td.bold { font-weight: 600; }
        tbody td.void-amt { color: #dc2626; }
        tbody td.capitalize { text-transform: capitalize; }
        tfoot td { padding: 7px 10px; font-weight: 700; font-size: 11px; border-top: 2px solid #1e293b; background: #f1f5f9; }
        tfoot td.right { text-align: right; }
        tfoot td.mono { font-variant-numeric: tabular-nums; }

        .item-line { color: #334155; font-size: 10px; line-height: 1.5; }
        .no-items { color: #94a3b8; font-style: italic; }
        .void-badge { display: inline-block; background: #dc2626; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; letter-spacing: 0.05em; }

        /* ── Footer ── */
        .doc-footer { margin-top: 32px; padding-top: 10px; padding-bottom: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; break-inside: avoid; }
        .sig-block { text-align: center; }
        .sig-line { border-top: 1px solid #0f172a; width: 180px; margin: 24px auto 4px; }
        .sig-label { font-size: 10px; color: #475569; }
        .sig-name { font-size: 11px; font-weight: 600; color: #1e293b; }
        .doc-generated { font-size: 9px; color: #94a3b8; text-align: right; line-height: 1.6; }

        @media print {
          body { padding: 0; }
          @page { margin: 18mm 16mm 22mm; size: A4; }
        }
      </style>

      <!-- Letterhead -->
      <div class="letterhead">
        <div class="letterhead-left">
          <p class="org-name">${orgName}</p>
          <p class="council-name">${councilName}</p>
          <p class="org-address">${orgAddress}</p>
        </div>
        <div class="letterhead-right">
          <p class="report-title">Daily Cash Collection Report</p>
          <p class="report-meta">
            Date: <strong>${formattedDate}</strong><br/>
            Cashier: <strong>${selectedCashierLabel}</strong>
          </p>
        </div>
      </div>

      <!-- Summary strip -->
      <div class="summary-strip">
        <div class="summary-item">
          <div class="s-label">Cash Sales</div>
          <div class="s-value">${formatCurrency(summary.totalCashSales)}</div>
        </div>
        <div class="summary-item">
          <div class="s-label">Merchandise</div>
          <div class="s-value">${formatCurrency(summary.totalSalesMerch)}</div>
        </div>
        <div class="summary-item">
          <div class="s-label">Rental Revenue</div>
          <div class="s-value">${formatCurrency(summary.totalRental)}</div>
        </div>
        <div class="summary-item">
          <div class="s-label">Voided</div>
          <div class="s-value" style="color:#dc2626">${formatCurrency(summary.totalVoidedSales)}</div>
        </div>
        <div class="summary-item highlight">
          <div class="s-label">Net Collection</div>
          <div class="s-value">${formatCurrency(summary.netCollection)}</div>
        </div>
        <div class="summary-item">
          <div class="s-label">Receipt Range</div>
          <div class="s-value">${summary.receiptRange}</div>
        </div>
        <div class="summary-item">
          <div class="s-label">Receipts Issued</div>
          <div class="s-value">${summary.totalReceiptsIssued}</div>
        </div>
      </div>

      <!-- Transactions -->
      <div class="section-header">Transactions</div>
      <table>
        <thead>
          <tr>
            <th class="center">OR No.</th>
            <th>Cashier</th>
            <th>Items</th>
            <th class="right">Merch.</th>
            <th class="right">Rental</th>
            <th class="right">Total</th>
            <th class="center">Payment</th>
            <th class="center">Time</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px">No transactions for this period.</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:right">Totals</td>
            <td class="right mono">${formatCurrency(summary.totalSalesMerch)}</td>
            <td class="right mono">${formatCurrency(summary.totalRental)}</td>
            <td class="right mono">${formatCurrency(summary.netCollection)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      ${breakdownSection}

      <!-- Signature footer -->
      <div class="doc-footer">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-name">${preparedByName || (selectedCashierLabel !== "All Accounts" ? selectedCashierLabel.replace(/\s*\(You\)$/i, "") : "")}</div>
          <div class="sig-label">${preparedByTitle}</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-name">${verifiedByName}</div>
          <div class="sig-label">${verifiedByTitle}</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-name">${approvedByName}</div>
          <div class="sig-label">${approvedByTitle}</div>
        </div>
        <div class="doc-generated">
          Generated: ${new Date().toLocaleString()}<br/>
          ${orgName} – ${councilName}
        </div>
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
        margin: [12, 12, 24, 12],
        filename,
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { avoid: ".doc-footer" },
      })
      .from(element)
      .save();
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ──────────────────────────────────────────────────────────
    const summaryData = [
      ["Daily Cash Collection Report"],
      [`Date: ${formattedDate}`, `Cashier: ${selectedCashierLabel}`],
      [],
      ["Metric", "Value"],
      ["Total Cash Sales",    formatCurrency(summary.totalCashSales)],
      ["Total Voided Sales",  formatCurrency(summary.totalVoidedSales)],
      ["Net Sales (excl. voids)", formatCurrency(summary.netCollection)],
      ["Rental Revenue",      formatCurrency(summary.totalRental)],
      ["Merchandise Sales",   formatCurrency(summary.totalSalesMerch)],
      ["Receipt Range",       summary.receiptRange],
      ["Receipts Issued",     summary.totalReceiptsIssued],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Summary");

    // ── Transactions sheet ─────────────────────────────────────────────────────
    const txHeaders = ["Receipt No.", "Cashier", "Items", "Sale Amount", "Payment Method", "Date / Time", "Status"];
    const txRows = (reportQuery.data ?? []).map((row) => [
      row.receiptNumber ?? "—",
      row.cashierName,
      row.lineItems.join("; "),
      row.totalAmount,
      row.paymentMethod,
      new Date(row.createdAt).toLocaleString(),
      row.status === "voided" ? "Void" : "Completed",
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]), "Transactions");

    // ── Cashier Breakdown sheet ────────────────────────────────────────────────
    if (cashierBreakdown.length > 1) {
      const cbHeaders = ["Cashier", "Total Sales", "Voided", "Net"];
      const cbRows = cashierBreakdown.map((item) => [
        item.cashierName,
        item.completedTotal,
        item.voidedTotal,
        item.net,
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cbHeaders, ...cbRows]), "By Cashier");
    }

    XLSX.writeFile(wb, `dccr-${selectedDate}.xlsx`);
  };

  const handleExportDoc = () => {
    const rows = (reportQuery.data ?? [])
      .map((row) => `
        <tr>
          <td>${row.receiptNumber ?? "—"}</td>
          <td>${row.cashierName}</td>
          <td>${row.lineItems.join("<br/>") || "—"}</td>
          <td>${formatCurrency(row.totalAmount)}</td>
          <td style="text-transform:capitalize">${row.paymentMethod}</td>
          <td>${new Date(row.createdAt).toLocaleString()}</td>
          <td>${row.status === "voided" ? "Void" : "Completed"}</td>
        </tr>`)
      .join("");

    const breakdownRows = cashierBreakdown.length > 1
      ? cashierBreakdown.map((item) => `
          <tr>
            <td>${item.cashierName}</td>
            <td>${formatCurrency(item.completedTotal)}</td>
            <td>${formatCurrency(item.voidedTotal)}</td>
            <td>${formatCurrency(item.net)}</td>
          </tr>`).join("")
      : "";

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/>
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #0f172a; }
        h1 { font-size: 16pt; margin-bottom: 4px; }
        h2 { font-size: 13pt; margin-top: 18pt; margin-bottom: 6px; }
        table { border-collapse: collapse; width: 100%; margin-top: 8px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 10pt; text-align: left; }
        th { background: #f1f5f9; font-weight: bold; }
      </style></head>
      <body>
        <h1>Daily Cash Collection Report</h1>
        <p><b>Date:</b> ${formattedDate} &nbsp;&nbsp; <b>Cashier:</b> ${selectedCashierLabel}</p>

        <h2>Summary</h2>
        <table>
          <tr><th>Metric</th><th>Value</th></tr>
          <tr><td>Total Cash Sales</td><td>${formatCurrency(summary.totalCashSales)}</td></tr>
          <tr><td>Total Voided Sales</td><td>${formatCurrency(summary.totalVoidedSales)}</td></tr>
          <tr><td>Net Sales (excl. voids)</td><td>${formatCurrency(summary.netCollection)}</td></tr>
          <tr><td>Rental Revenue</td><td>${formatCurrency(summary.totalRental)}</td></tr>
          <tr><td>Merchandise Sales</td><td>${formatCurrency(summary.totalSalesMerch)}</td></tr>
          <tr><td>Receipt Range</td><td>${summary.receiptRange}</td></tr>
          <tr><td>Receipts Issued</td><td>${summary.totalReceiptsIssued}</td></tr>
        </table>

        <h2>Transactions</h2>
        <table>
          <thead><tr><th>Receipt No.</th><th>Cashier</th><th>Items</th><th>Amount</th><th>Payment</th><th>Date/Time</th><th>Status</th></tr></thead>
          <tbody>${rows || "<tr><td colspan=7>No data</td></tr>"}</tbody>
        </table>

        ${cashierBreakdown.length > 1 ? `
        <h2>Summary by Cashier</h2>
        <table>
          <thead><tr><th>Cashier</th><th>Total Sales</th><th>Voided</th><th>Net</th></tr></thead>
          <tbody>${breakdownRows}</tbody>
        </table>` : ""}
      </body></html>`;

    const blob = new Blob([html], { type: "application/msword" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `dccr-${selectedDate}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const markup = buildPrintableMarkup();
    const html = `<html><head><title>DCCR ${selectedDate}</title></head><body>${markup}</body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!iframeDoc) { document.body.removeChild(iframe); return; }
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
    };
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

            {!isCashier && (
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
                    <SelectItem value="all">All Accounts</SelectItem>
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
            )}

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
                  <Button
                    type="button"
                    variant="outline"
                    className="hidden sm:inline-flex"
                    onClick={handleExportExcel}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="hidden sm:inline-flex"
                    onClick={handleExportDoc}
                  >
                    <FileType className="mr-2 h-4 w-4" />
                    Export DOC
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
                <Button type="button" variant="outline" className="flex-1" onClick={handleExportExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Excel
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={handleExportDoc}>
                  <FileType className="mr-2 h-4 w-4" />
                  DOC
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
