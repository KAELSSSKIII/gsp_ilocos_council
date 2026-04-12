import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { format, endOfMonth, startOfMonth } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { formatCurrencyForPdf } from "@/utils/format";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { cn } from "@/lib/utils";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { readBusinessSettings } from "@/utils/businessSettings";

type IncomeRow = {
  date: string;
  grossSales: number;
  discounts: number;
  netSales: number;
  cogs: number;
};

type Summary = {
  grossSales: number;
  discounts: number;
  netSales: number;
  cogs: number;
};

type IncomeSaleItem = {
  unit_cost?: number | null;
  quantity?: number | null;
};

type IncomeSaleRow = {
  created_at?: string | null;
  status?: string | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  items?: IncomeSaleItem[] | null;
};

// Build the list of yyyy-MM options for the past 24 months
const buildMonthOptions = () => {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy"),
    });
  }
  return options;
};
const MONTH_OPTIONS = buildMonthOptions();

const fetchIncomeData = async (
  from: string,
  to: string,
  cashierId?: string
): Promise<IncomeRow[]> => {
  const params = new URLSearchParams({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to:   new Date(`${to}T23:59:59`).toISOString(),
    include_items: "true",
  });
  if (cashierId && cashierId !== "all") {
    params.set("cashier_id", cashierId);
  }

  const { sales } = await api.get<{ sales: IncomeSaleRow[] }>(`/sales?${params.toString()}`);

  const grouped = new Map<string, IncomeRow>();

  (sales ?? []).forEach((sale) => {
    if (!sale || !sale.created_at) return;
    if (sale.status === "voided") return;

    const key = format(new Date(sale.created_at), "yyyy-MM-dd");

    const entry = grouped.get(key) ?? {
      date: format(new Date(sale.created_at), "MMM d"),
      grossSales: 0,
      discounts: 0,
      netSales: 0,
      cogs: 0,
    };

    const grossSales = Number(sale.subtotal ?? 0);
    const discounts  = Number(sale.discount_amount ?? 0);
    const cogs = Array.isArray(sale.items)
        ? sale.items.reduce(
          (sum: number, item) => sum + Number(item.unit_cost ?? 0) * Number(item.quantity ?? 0),
          0
        )
      : 0;

    entry.grossSales += grossSales;
    entry.discounts  += discounts;
    entry.netSales   += grossSales - discounts;
    entry.cogs       += cogs;

    grouped.set(key, entry);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, value]) => value);
};

const computeSummary = (rows: IncomeRow[]): Summary =>
  rows.reduce<Summary>(
    (acc, row) => ({
      grossSales: acc.grossSales + row.grossSales,
      discounts:  acc.discounts  + row.discounts,
      netSales:   acc.netSales   + row.netSales,
      cogs:       acc.cogs       + row.cogs,
    }),
    { grossSales: 0, discounts: 0, netSales: 0, cogs: 0 }
  );

export function IncomeStatementPage() {
  const profile = useSessionStore(selectProfile);
  const { orgName, councilName } = readBusinessSettings();
  const orgLabel = `${orgName} — ${councilName}`;

  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedCashier, setSelectedCashier] = useState<string>("all");
  const [manualExpenses, setManualExpenses] = useState("");

  // Default to own profile for cashier role
  useEffect(() => {
    if (profile?.role === "cashier" && profile?.id) {
      setSelectedCashier(profile.id);
    }
  }, [profile?.id, profile?.role]);

  const fromDate  = `${selectedMonth}-01`;
  const toDate    = format(endOfMonth(new Date(fromDate)), "yyyy-MM-dd");
  const monthLabel = format(startOfMonth(new Date(fromDate)), "MMMM yyyy");

  // Fetch cashiers list
  const { data: cashiers = [] } = useQuery({
    queryKey: ["income-statement-cashiers"],
    queryFn: async () => {
      const { users } = await api.get<{ users: { id: string; full_name: string; role: string }[] }>("/auth/users");
      return (users ?? []).filter((u) => ["cashier", "admin", "accountant"].includes(u.role));
    },
  });

  const cashierLabel = useMemo(() => {
    if (selectedCashier === "all") return "All Accounts";
    if (selectedCashier === profile?.id) return profile?.full_name ? `${profile.full_name}` : "You";
    return cashiers.find((c) => c.id === selectedCashier)?.full_name ?? "Unknown";
  }, [selectedCashier, cashiers, profile]);

  const { data: incomeRows = [] } = useQuery({
    queryKey: ["income-statement", fromDate, toDate, selectedCashier],
    queryFn: () => fetchIncomeData(fromDate, toDate, selectedCashier),
  });

  // Operating expenses are org-wide (payroll + vouchers) — only show when viewing all cashiers
  const { data: pnlData } = useQuery({
    queryKey: ["pnl-expenses", fromDate, toDate],
    queryFn: () => api.get<{ expenses: { totalExpenses: number } }>(`/accounting/pnl?from=${fromDate}&to=${toDate}`),
    enabled: selectedCashier === "all",
    staleTime: 2 * 60 * 1000,
  });

  const summary = useMemo(() => computeSummary(incomeRows), [incomeRows]);

  const manualExpensesValue    = Number(manualExpenses) || 0;
  const realOperatingExpenses  = selectedCashier === "all" ? (pnlData?.expenses?.totalExpenses ?? 0) : 0;
  const totalOperatingExpenses = realOperatingExpenses + (selectedCashier === "all" ? manualExpensesValue : 0);
  const grossProfit = summary.netSales - summary.cogs;
  const netIncome   = grossProfit - totalOperatingExpenses;

  const isCashierFiltered = selectedCashier !== "all";

  const chartData = incomeRows.map((row) => ({
    name: row.date,
    "Net Sales": Number(row.netSales.toFixed(2)),
    COGS:        Number(row.cogs.toFixed(2)),
  }));

  const fmt = (v: number) => `₱${v.toFixed(2)}`;

  const statementTitle = isCashierFiltered
    ? `Statement of Income — ${cashierLabel} — ${monthLabel}`
    : `Statement of Income — ${monthLabel}`;

  const generateExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows: Array<Array<string | number>> = [
      [orgLabel],
      ["Income Statement"],
      [`Period: ${monthLabel}`],
      [`Cashier: ${cashierLabel}`],
      [`Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")}`],
      [],
      ["Line Item", "Amount (₱)"],
      ["Gross Sales", summary.grossSales],
      ["Less: Discounts", summary.discounts],
      ["Net Sales", summary.netSales],
      ["Less: Cost of Goods Sold", summary.cogs],
      ["Gross Profit", grossProfit],
    ];

    if (!isCashierFiltered) {
      rows.push(
        ["Less: Operating Expenses", totalOperatingExpenses],
        ["  — Payroll + Vouchers", realOperatingExpenses],
        ["  — Ad-hoc (manual)", manualExpensesValue],
        ["Net Income", netIncome]
      );
    } else {
      rows.push(
        [],
        ["Note: Operating expenses are organization-wide and not attributed per cashier."],
        ["Gross Profit (before org expenses)", grossProfit]
      );
    }

    rows.push([], ["Income Tax", "₱0.00 — Tax-exempt (non-stock, non-profit · RA 7278)"]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
    const suffix = isCashierFiltered ? `-${cashierLabel.replace(/\s+/g, "_")}` : "";
    XLSX.writeFile(wb, `income-statement-${selectedMonth}${suffix}.xlsx`);
  };

  const generatePDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait" });
    const generatedAt = format(new Date(), "MMMM d, yyyy h:mm a");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(orgLabel, 14, 16);
    doc.setFontSize(13);
    doc.text("Income Statement", 14, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Period: ${monthLabel}`, 14, 31);
    doc.text(`Cashier: ${cashierLabel}`, 14, 37);
    doc.text(`Generated: ${generatedAt}`, 14, 43);

    const pw = doc.internal.pageSize.getWidth();
    let y = 56;
    const lh = 8;

    const pdfRow = (label: string, value: string, bold = false) => {
      if (bold) doc.setFont("helvetica", "bold");
      else doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(label, 14, y);
      doc.text(value, pw - 14, y, { align: "right" });
      y += lh;
    };
    const sep = () => {
      doc.setDrawColor(200);
      doc.line(14, y - 2, pw - 14, y - 2);
    };

    pdfRow("Gross Sales", formatCurrencyForPdf(summary.grossSales), true);
    pdfRow("Less: Discounts", formatCurrencyForPdf(summary.discounts));
    sep();
    pdfRow("Net Sales", formatCurrencyForPdf(summary.netSales), true);
    pdfRow("Less: Cost of Goods Sold", formatCurrencyForPdf(summary.cogs));
    sep();
    pdfRow("Gross Profit", formatCurrencyForPdf(grossProfit), true);

    if (!isCashierFiltered) {
      pdfRow("Less: Operating Expenses", formatCurrencyForPdf(totalOperatingExpenses));
      sep();
      pdfRow("Net Income", formatCurrencyForPdf(netIncome), true);
    } else {
      y += 4;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text("Operating expenses are organization-wide and not attributed per cashier.", 14, y);
      doc.setTextColor(33);
      y += 6;
    }

    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Tax-exempt organization (non-stock, non-profit — RA 7278)", 14, y);

    const suffix = isCashierFiltered ? `-${cashierLabel.replace(/\s+/g, "_")}` : "";
    doc.save(`income-statement-${selectedMonth}${suffix}.pdf`);
  };

  return (
    <div className="space-y-6 pb-24">

        {/* Header */}
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold text-emerald-900">Income Statement</h1>
            <p className="text-sm text-emerald-800/80">Monthly profitability report — GSP Ilocos Sur Council.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Month picker */}
            <label className="sr-only" htmlFor="income-statement-month">Reporting month</label>
            <select
              id="income-statement-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 rounded-xl border border-emerald-200 bg-white px-3 text-sm text-emerald-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Cashier picker */}
            <label className="sr-only" htmlFor="income-statement-cashier">Cashier filter</label>
            <select
              id="income-statement-cashier"
              value={selectedCashier}
              onChange={(e) => setSelectedCashier(e.target.value)}
              disabled={profile?.role === "cashier"}
              className="h-10 rounded-xl border border-emerald-200 bg-white px-3 text-sm text-emerald-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
            >
              <option value="all">All Accounts</option>
              {cashiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}{c.id === profile?.id ? " (You)" : ""}
                </option>
              ))}
            </select>

            {/* Manual expenses — only for all-cashier view */}
            {!isCashierFiltered && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-sm">
                <Label htmlFor="manual-expenses" className="text-xs text-emerald-700 whitespace-nowrap">
                  + Ad-hoc Expenses
                </Label>
                <Input
                  id="manual-expenses"
                  type="number"
                  min="0"
                  value={manualExpenses}
                  onChange={(e) => setManualExpenses(e.target.value)}
                  className="h-9 w-28 rounded-lg border-emerald-200 bg-white text-right text-sm"
                  placeholder="0.00"
                />
              </div>
            )}

            <Button onClick={generatePDF} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm shadow hover:bg-emerald-700">
              Export PDF
            </Button>
            <Button onClick={generateExcel} variant="outline" className="h-10 rounded-xl border-emerald-300 px-4 text-sm shadow hover:bg-emerald-50">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Gross Sales",  value: summary.grossSales, desc: "Total sales before discounts" },
            { label: "Net Sales",    value: summary.netSales,   desc: "After discounts" },
            { label: "Gross Profit", value: grossProfit,        desc: summary.netSales > 0 ? `${((grossProfit / summary.netSales) * 100).toFixed(1)}% margin` : "Net sales minus COGS" },
            {
              label: isCashierFiltered ? "Gross Profit" : "Net Income",
              value: isCashierFiltered ? grossProfit : netIncome,
              desc:  isCashierFiltered ? "Before org-wide expenses" : "After all operating expenses",
              highlight: true,
            },
          ].map(({ label, value, desc, highlight }) => (
            <Card key={label + desc} className="rounded-2xl border border-emerald-200 bg-white shadow-md">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase tracking-wide text-emerald-700">{label}</CardDescription>
                <CardTitle className={cn("text-2xl font-semibold", highlight && value < 0 ? "text-red-600" : "text-emerald-900")}>
                  {fmt(value)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-emerald-700/80">{desc}</CardContent>
            </Card>
          ))}
        </div>

        {/* Trend chart */}
        <Card className="rounded-2xl border border-emerald-200/70 bg-white shadow-lg">
          <CardHeader className="border-b border-emerald-100 pb-4">
            <CardTitle className="text-lg font-semibold text-emerald-900">
              Sales vs COGS — {isCashierFiltered ? `${cashierLabel} · ` : ""}{monthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="h-[280px]" aria-label={`Income statement trend chart for ${monthLabel}`} role="img">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="name" stroke="#0f766e" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Line type="monotone" dataKey="Net Sales" stroke="#047857" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="COGS"      stroke="#f97316" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-lg border border-emerald-200/70">
                <table className="min-w-full text-sm">
                  <thead className="bg-emerald-50/70 text-left text-emerald-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">Period</th>
                      <th className="px-3 py-2 font-medium">Net Sales</th>
                      <th className="px-3 py-2 font-medium">COGS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row) => (
                      <tr key={row.name} className="border-t border-emerald-100">
                        <td className="px-3 py-2 text-emerald-800">{row.name}</td>
                        <td className="px-3 py-2 text-emerald-900">{fmt(row["Net Sales"])}</td>
                        <td className="px-3 py-2 text-emerald-900">{fmt(row.COGS)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statement */}
        <Card className="rounded-2xl border border-emerald-200/70 bg-white shadow-lg">
          <CardHeader className="border-b border-emerald-100 pb-4">
            <CardTitle className="text-lg font-semibold text-emerald-900">{statementTitle}</CardTitle>
            <p className="text-xs text-emerald-700/80">{orgLabel}</p>
            {isCashierFiltered && (
              <p className="text-xs text-amber-600">
                Showing sales by <strong>{cashierLabel}</strong> only. Operating expenses are org-wide and shown separately.
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-inner text-sm">

              <div className="flex justify-between font-semibold text-emerald-900">
                <span>Gross Sales</span><span>{fmt(summary.grossSales)}</span>
              </div>
              <div className="flex justify-between text-emerald-800">
                <span>Less: Discounts</span><span>({fmt(summary.discounts)})</span>
              </div>
              <Separator className="bg-emerald-200/70" />
              <div className="flex justify-between font-semibold text-emerald-900">
                <span>Net Sales</span><span>{fmt(summary.netSales)}</span>
              </div>

              <div className="flex justify-between text-emerald-800 mt-1">
                <span>Less: Cost of Goods Sold</span><span>({fmt(summary.cogs)})</span>
              </div>
              <Separator className="bg-emerald-200/70" />
              <div className="flex justify-between font-semibold text-emerald-900">
                <span>Gross Profit</span>
                <span>
                  {fmt(grossProfit)}
                  {summary.netSales > 0 && (
                    <span className="ml-2 text-xs font-normal text-emerald-600">
                      ({((grossProfit / summary.netSales) * 100).toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>

              {!isCashierFiltered && (
                <>
                  <div className="flex justify-between text-emerald-800 mt-1">
                    <span className="flex flex-col">
                      <span>Less: Operating Expenses</span>
                      <span className="text-xs text-emerald-600">
                        Payroll + vouchers: {fmt(realOperatingExpenses)}
                        {manualExpensesValue > 0 && ` · Ad-hoc: ${fmt(manualExpensesValue)}`}
                      </span>
                    </span>
                    <span>({fmt(totalOperatingExpenses)})</span>
                  </div>
                  <Separator className="bg-emerald-300 my-1" />
                  <div className={cn("flex justify-between font-bold text-base", netIncome >= 0 ? "text-emerald-900" : "text-red-600")}>
                    <span>Net Income</span><span>{fmt(netIncome)}</span>
                  </div>
                </>
              )}

              {isCashierFiltered && (
                <p className="text-xs text-amber-600/80 mt-1 italic">
                  Operating expenses (payroll, vouchers) are organization-wide costs — not attributed to individual cashiers.
                  Switch to "All Accounts" to view the full income statement with net income.
                </p>
              )}

              <p className="text-xs text-emerald-600/80 mt-2 italic">
                Income tax: ₱0.00 — Tax-exempt organization (non-stock, non-profit · RA 7278)
              </p>
            </div>

            {!isCashierFiltered && (
              <p className="mt-3 text-xs text-emerald-700/70">
                Operating expenses are pulled from posted payroll and approved vouchers for {monthLabel}.
                Use the "Ad-hoc Expenses" field above to add any costs not yet recorded (utilities, petty cash, etc.).
              </p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
