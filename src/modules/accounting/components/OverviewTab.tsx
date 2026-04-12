import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, FileWarning, FileSpreadsheet } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";
import { readBusinessSettings } from "@/utils/businessSettings";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyPoint { month: number; monthLabel: string; revenue: number; expenses: number; }
interface BreakdownItem { name: string; value: number; }
interface OverviewResponse {
  monthly: MonthlyPoint[];
  ytd: { totalRevenue: number; totalExpenses: number; netIncome: number; outstandingInvoices: number };
  incomeBreakdown: BreakdownItem[];
  expenseBreakdown: BreakdownItem[];
}

type ChartTooltipItem = {
  name?: string;
  value?: number | string;
  fill?: string;
  color?: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const INCOME_COLORS  = ["#059669", "#10b981", "#34d399", "#6ee7b7"];
const EXPENSE_COLORS = ["#ef4444", "#f87171", "#fca5a5"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const phpFormatter = (v: number) =>
  v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`;

const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm space-y-1">
      <p className="font-semibold">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.fill ?? entry.color }}>
          {entry.name}: {formatCurrency(Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export function OverviewTab({ year }: { year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["accounting-overview", year],
    queryFn: () => api.get<OverviewResponse>(`/accounting/overview?year=${year}`),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  const { monthly = [], ytd, incomeBreakdown = [], expenseBreakdown = [] } = data ?? {};
  const { totalRevenue = 0, totalExpenses = 0, netIncome = 0, outstandingInvoices = 0 } = ytd ?? {};

  const { orgName, councilName } = readBusinessSettings();

  const exportExcel = () => {
    const header = [
      [`${orgName} — ${councilName}`],
      [`Accounting Overview — ${year}`],
      [],
      ["YTD SUMMARY"],
      ["Total Revenue (YTD)", totalRevenue],
      ["Total Expenses (YTD)", totalExpenses],
      ["Net Income (YTD)", netIncome],
      ["Outstanding Invoices", outstandingInvoices],
      [],
      ["MONTHLY BREAKDOWN"],
      ["Month", "Revenue", "Expenses", "Net"],
      ...monthly.map((m) => [m.monthLabel, m.revenue, m.expenses, m.revenue - m.expenses]),
      [],
      ["INCOME BREAKDOWN BY SOURCE"],
      ["Source", "Amount"],
      ...incomeBreakdown.map((d) => [d.name, d.value]),
      [],
      ["EXPENSE BREAKDOWN BY TYPE"],
      ["Type", "Amount"],
      ...expenseBreakdown.map((d) => [d.name, d.value]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(header);
    ws["!cols"] = [{ wch: 36 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overview");
    XLSX.writeFile(wb, `accounting-overview-${year}.xlsx`);
  };

  const allBreakdown = [
    ...incomeBreakdown.map((d, i) => ({ ...d, color: INCOME_COLORS[i % INCOME_COLORS.length] })),
    ...expenseBreakdown.map((d, i) => ({ ...d, color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!data}>
          <FileSpreadsheet className="mr-2 h-4 w-4 text-green-700" />
          Export Excel
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 space-y-0">
            <CardDescription className="flex items-center gap-1 text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Total Revenue (YTD)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 space-y-0">
            <CardDescription className="flex items-center gap-1 text-xs">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" /> Total Expenses (YTD)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 space-y-0">
            <CardDescription className="flex items-center gap-1 text-xs">
              <DollarSign className="h-3.5 w-3.5 text-primary" /> Net Income (YTD)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${netIncome >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {formatCurrency(netIncome)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 space-y-0">
            <CardDescription className="flex items-center gap-1 text-xs">
              <FileWarning className="h-3.5 w-3.5 text-amber-500" /> Outstanding Invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(outstandingInvoices)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {/* Bar Chart — Revenue vs Expenses by Month */}
        <Card className="md:col-span-2 border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Revenue vs Expenses — {year}</CardTitle>
            <CardDescription>Monthly comparison of income and expenditure</CardDescription>
          </CardHeader>
          <CardContent>
            {monthly.every((m) => m.revenue === 0 && m.expenses === 0) ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No data for {year}</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={phpFormatter} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="revenue"  name="Revenue"  fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart — Breakdown */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Income & Expense Mix</CardTitle>
            <CardDescription>Year-to-date breakdown by source</CardDescription>
          </CardHeader>
          <CardContent>
            {allBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No data</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={allBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                    >
                      {allBreakdown.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {allBreakdown.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                        {entry.name}
                      </span>
                      <span className="font-medium">{formatCurrency(entry.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profit summary */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Year Summary — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="py-4 md:py-0 md:px-6 first:pl-0 last:pr-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Income</p>
              <p className="text-3xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="py-4 md:py-0 md:px-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Expenses</p>
              <p className="text-3xl font-bold text-destructive">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="py-4 md:py-0 md:px-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Profit / Loss</p>
              <p className={`text-3xl font-bold ${netIncome >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {netIncome < 0 ? "(" : ""}{formatCurrency(Math.abs(netIncome))}{netIncome < 0 ? ")" : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
