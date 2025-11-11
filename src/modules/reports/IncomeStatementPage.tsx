import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import jsPDF from "jspdf";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type IncomeRow = {
  date: string;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;
  operatingExpenses: number;
  otherIncome: number;
  otherExpenses: number;
  incomeTax: number;
  operatingIncome: number;
  netIncomeBeforeTax: number;
  netIncome: number;
};

type Summary = {
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;
  operatingExpenses: number;
  otherIncome: number;
  otherExpenses: number;
  incomeTax: number;
};

const buildDemoIncome = (): IncomeRow[] => {
  const today = new Date();
  const rows: IncomeRow[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const grossSales = 7500 + Math.random() * 3500;
    const discounts = grossSales * (0.03 + Math.random() * 0.02);
    const returns = grossSales * 0.01;
    const netSales = grossSales - discounts - returns;
    const cogs = netSales * (0.45 + Math.random() * 0.1);
    const operatingExpenses = netSales * (0.18 + Math.random() * 0.04);
    const otherIncome = 150 + Math.random() * 120;
    const otherExpenses = 90 + Math.random() * 80;
    const incomeTaxBase = netSales - cogs - operatingExpenses + otherIncome - otherExpenses;
    const incomeTax = Math.max(incomeTaxBase * 0.1, 0);
    const operatingIncome = netSales - cogs - operatingExpenses;
    const netIncomeBeforeTax = operatingIncome + otherIncome - otherExpenses;
    const netIncome = netIncomeBeforeTax - incomeTax;
    rows.push({
      date: format(day, "MMM d"),
      grossSales,
      discounts,
      returns,
      netSales,
      cogs,
      operatingExpenses,
      otherIncome,
      otherExpenses,
      incomeTax,
      operatingIncome,
      netIncomeBeforeTax,
      netIncome,
    });
  }
  return rows;
};

type SaleRecord = Database["public"]["Tables"]["sales"]["Row"] & {
  sale_items: Array<
    Pick<Database["public"]["Tables"]["sale_items"]["Row"], "quantity" | "unit_cost">
  > | null;
};

const fetchIncomeData = async (period: string): Promise<IncomeRow[]> => {
  const rangeDays = period === "30d" ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - (rangeDays - 1));

  const { data, error } = await supabase
    .from("sales")
    .select(
      `
        id,
        created_at,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        status,
        sale_items(quantity, unit_cost)
      `
    )
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error) throw error;

  const grouped = new Map<string, IncomeRow>();

  ((data as SaleRecord[] | null) ?? []).forEach((sale) => {
    if (!sale || !sale.created_at) return;
    if (sale.status === "voided") return;

    const saleDate = new Date(sale.created_at);
    const key = format(saleDate, "yyyy-MM-dd");

    const entry =
      grouped.get(key) ??
      {
        date: format(saleDate, "MMM d"),
        grossSales: 0,
        discounts: 0,
        returns: 0,
        netSales: 0,
        cogs: 0,
        operatingExpenses: 0,
        otherIncome: 0,
        otherExpenses: 0,
        incomeTax: 0,
        operatingIncome: 0,
        netIncomeBeforeTax: 0,
        netIncome: 0,
      };

    const grossSales = Number(sale.subtotal ?? 0);
    const discounts = Number(sale.discount_amount ?? 0);
    const returns = 0;
    const netSales = grossSales - discounts - returns;
    const cogs = Array.isArray(sale.sale_items)
      ? sale.sale_items.reduce(
          (sum, item) => sum + Number(item.unit_cost ?? 0) * Number(item.quantity ?? 0),
          0
        )
      : 0;
    const operatingExpenses = 0;
    const otherIncome = 0;
    const otherExpenses = 0;
    const incomeTax = Number(sale.tax_amount ?? 0);
    const operatingIncome = netSales - cogs - operatingExpenses;
    const netIncomeBeforeTax = operatingIncome + otherIncome - otherExpenses;
    const netIncome = netIncomeBeforeTax - incomeTax;

    entry.grossSales += grossSales;
    entry.discounts += discounts;
    entry.returns += returns;
    entry.netSales += netSales;
    entry.cogs += cogs;
    entry.operatingExpenses += operatingExpenses;
    entry.otherIncome += otherIncome;
    entry.otherExpenses += otherExpenses;
    entry.incomeTax += incomeTax;
    entry.operatingIncome += operatingIncome;
    entry.netIncomeBeforeTax += netIncomeBeforeTax;
    entry.netIncome += netIncome;

    grouped.set(key, entry);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, value]) => value);
};

const computeSummary = (rows: IncomeRow[]): Summary => {
  return rows.reduce<Summary>(
    (acc, row) => ({
      grossSales: acc.grossSales + row.grossSales,
      discounts: acc.discounts + row.discounts,
      returns: acc.returns + row.returns,
      netSales: acc.netSales + row.netSales,
      cogs: acc.cogs + row.cogs,
      operatingExpenses: acc.operatingExpenses + row.operatingExpenses,
      otherIncome: acc.otherIncome + row.otherIncome,
      otherExpenses: acc.otherExpenses + row.otherExpenses,
      incomeTax: acc.incomeTax + row.incomeTax,
    }),
    {
      grossSales: 0,
      discounts: 0,
      returns: 0,
      netSales: 0,
      cogs: 0,
      operatingExpenses: 0,
      otherIncome: 0,
      otherExpenses: 0,
      incomeTax: 0,
    }
  );
};

const deriveChartData = (rows: IncomeRow[]) =>
  rows.map((row) => ({
    name: row.date,
    Sales: Number(row.netSales.toFixed(2)),
    COGS: Number(row.cogs.toFixed(2)),
    OperatingExpenses: Number(row.operatingExpenses.toFixed(2)),
  }));

export function IncomeStatementPage() {
  const [period, setPeriod] = useState("7d");
  const [manualExpenses, setManualExpenses] = useState("");

  const { data: incomeRows = [], isLoading } = useQuery({
    queryKey: ["income-statement", period],
    enabled: isSupabaseConfigured,
    queryFn: () => fetchIncomeData(period),
  });

  const rows = useMemo(() => {
    if (isSupabaseConfigured) {
      return incomeRows;
    }
    return buildDemoIncome();
  }, [incomeRows, isSupabaseConfigured]);

  const summary = useMemo(() => computeSummary(rows), [rows]);

  const manualExpensesValue = Number(manualExpenses) || 0;
  const adjustedOperatingExpenses = summary.operatingExpenses + manualExpensesValue;
  const grossProfit = summary.netSales - summary.cogs;
  const operatingIncome = grossProfit - adjustedOperatingExpenses;
  const netIncomeBeforeTax = operatingIncome + summary.otherIncome - summary.otherExpenses;
  const netIncome = netIncomeBeforeTax - summary.incomeTax;

  const formatCurrencyForPdf = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      currencyDisplay: "code",
      minimumFractionDigits: 2,
    })
      .format(value)
      .replace(/\u00A0/g, " ");

  const chartData = useMemo(() => deriveChartData(rows), [rows]);

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const generatedAt = format(new Date(), "MMMM d, yyyy h:mm a");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Girl Scout Business Suite", 14, 16);
    doc.setFontSize(14);
    doc.text("Income Statement", 14, 25);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Reporting Period: Last ${period === "7d" ? "7 days" : "30 days"}`, 14, 33);
    doc.text(`Generated: ${generatedAt}`, 14, 40);

    const pageWidth = doc.internal.pageSize.getWidth();
    const startY = 52;
    const lineHeight = 9;
    const entries = [
      ["Gross Sales", formatCurrencyForPdf(summary.grossSales)],
      ["Discounts", formatCurrencyForPdf(summary.discounts)],
      ["Sales Returns", formatCurrencyForPdf(summary.returns)],
      ["Net Sales", formatCurrencyForPdf(summary.netSales)],
      ["Cost of Goods Sold", formatCurrencyForPdf(summary.cogs)],
      ["Gross Profit", formatCurrencyForPdf(grossProfit)],
      ["Operating Expenses", formatCurrencyForPdf(adjustedOperatingExpenses)],
      ["Operating Income", formatCurrencyForPdf(operatingIncome)],
      ["Other Income", formatCurrencyForPdf(summary.otherIncome)],
      ["Other Expenses", formatCurrencyForPdf(summary.otherExpenses)],
      ["Net Income Before Tax", formatCurrencyForPdf(netIncomeBeforeTax)],
      ["Income Tax", formatCurrencyForPdf(summary.incomeTax)],
      ["Net Income", formatCurrencyForPdf(netIncome)],
    ];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Summary", 14, startY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    let y = startY + 6;
    entries.forEach(([label, value]) => {
      doc.text(label, 14, y);
      doc.text(value, pageWidth - 14, y, { align: "right" });
      y += lineHeight;
    });

    doc.save(`income-statement-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
  };

  return (
    <div className="pb-24">
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-emerald-900">Income Statement</h1>
            <p className="text-sm text-emerald-800/80">Monitor profitability and costs with real-time POS insights.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-10 w-full rounded-xl border-emerald-200 bg-white text-emerald-700 shadow-sm sm:w-48">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-emerald-200 shadow-lg">
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-sm">
              <Label htmlFor="manual-expenses" className="text-xs text-emerald-700">
                Manual Expenses
              </Label>
              <Input
                id="manual-expenses"
                type="number"
                min="0"
                value={manualExpenses}
                onChange={(event) => setManualExpenses(event.target.value)}
                className="h-9 w-28 rounded-lg border-emerald-200 bg-white text-right text-sm"
                placeholder="0.00"
              />
            </div>
            <Button
              onClick={generatePDF}
              className="h-10 rounded-xl bg-emerald-600 px-4 text-sm shadow hover:bg-emerald-700"
            >
              Export to PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          <Card className="rounded-2xl border border-emerald-200 bg-white shadow-md">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide text-emerald-700">
                Net Sales
              </CardDescription>
              <CardTitle className="text-2xl font-semibold text-emerald-900">
                ₱{summary.netSales.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-emerald-700/80">
              Gross sales less returns and discounts for the period.
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-emerald-200 bg-white shadow-md">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide text-emerald-700">
                Cost of Goods Sold
              </CardDescription>
              <CardTitle className="text-2xl font-semibold text-emerald-900">
                ₱{summary.cogs.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-emerald-700/80">
              Direct costs from items sold within the selected window.
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-emerald-200 bg-white shadow-md">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide text-emerald-700">
                Gross Profit
              </CardDescription>
              <CardTitle className="text-2xl font-semibold text-emerald-900">
                ₱{grossProfit.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-emerald-700/80">
              Sales minus cost of goods sold.
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-emerald-200 bg-white shadow-md">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide text-emerald-700">
                Net Income
              </CardDescription>
              <CardTitle className={cn("text-2xl font-semibold", netIncome >= 0 ? "text-emerald-900" : "text-red-600")}>
                ₱{netIncome.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-emerald-700/80">
              Gross profit less total expenses.
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border border-emerald-200/70 bg-white shadow-lg">
          <CardHeader className="flex flex-col gap-2 border-b border-emerald-100 pb-4">
            <CardTitle className="text-lg font-semibold text-emerald-900">Income Trends</CardTitle>
            <p className="text-xs text-emerald-700/80">
              Visualise sales, cost of goods, and expense fluctuations across the selected window.
            </p>
          </CardHeader>
          <CardContent className="h-[320px] pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="name" stroke="#0f766e" />
                <Tooltip />
                <Line type="monotone" dataKey="Sales" stroke="#047857" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="COGS" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="OperatingExpenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-emerald-200/70 bg-white shadow-lg">
          <CardHeader className="flex flex-col gap-2 border-b border-emerald-100 pb-4">
            <CardTitle className="text-lg font-semibold text-emerald-900">Statement Overview</CardTitle>
            <p className="text-xs text-emerald-700/80">
              Breakdown of revenue, expenses, and profitability for audit or presentation purposes.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-inner">
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
                <span>Gross Sales</span>
                <span>₱{summary.grossSales.toFixed(2)}</span>
              </div>
              <Separator className="bg-emerald-200/70" />
              <div className="flex items-center justify-between text-sm text-emerald-800">
                <span>Less: Discounts</span>
                <span>₱{summary.discounts.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-800">
                <span>Less: Sales Returns</span>
                <span>₱{summary.returns.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
                <span>Net Sales</span>
                <span>₱{summary.netSales.toFixed(2)}</span>
              </div>
              <Separator className="bg-emerald-200/70" />
              <div className="flex items-center justify-between text-sm text-emerald-800">
                <span>Cost of Goods Sold</span>
                <span>₱{summary.cogs.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
                <span>Gross Profit</span>
                <span>₱{grossProfit.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-800">
                <span>Operating Expenses</span>
                <span>₱{adjustedOperatingExpenses.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
                <span>Operating Income</span>
                <span>₱{operatingIncome.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-800">
                <span>Other Income</span>
                <span>₱{summary.otherIncome.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-800">
                <span>Other Expenses</span>
                <span>₱{summary.otherExpenses.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
                <span>Net Income Before Tax</span>
                <span>₱{netIncomeBeforeTax.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-emerald-800">
                <span>Income Tax</span>
                <span>₱{summary.incomeTax.toFixed(2)}</span>
              </div>
              <Separator className="bg-emerald-200/70" />
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-900">
                <span>Net Income</span>
                <span className={cn(netIncome >= 0 ? "text-emerald-700" : "text-red-600")}>
                  ₱{netIncome.toFixed(2)}
                </span>
              </div>
            </div>
            <p className="text-xs text-emerald-700/80">
              Expenses include manual adjustments entered above. Update manual expenses for ad-hoc cost entries such as
              utilities, payroll, or marketing.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


