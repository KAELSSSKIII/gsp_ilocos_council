import { useMemo } from "react";
import { DollarSign, ShoppingCart, PackageSearch, Users } from "lucide-react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/format";

type Metric = {
  title: string;
  value: string;
  change: string;
  icon: typeof DollarSign;
  color: string;
};

type SalesRecord = {
  id: string;
  branch: string | null;
  created_at: string;
  total_amount: number;
};

type InventoryRecord = {
  id: string;
  name: string;
  stock_quantity: number;
  reorder_level: number;
};

type SalesPoint = {
  total: number;
  date?: string;
  week?: string;
  month?: string;
};

type DashboardData = {
  metrics: Metric[];
  recentSales: SalesRecord[];
  lowStock: InventoryRecord[];
  currency: string;
  salesAnalytics: {
    daily: SalesPoint[];
    weekly: SalesPoint[];
    monthly: SalesPoint[];
  };
};

const CURRENCY = "PHP";

const demoData: DashboardData = {
  currency: CURRENCY,
  metrics: [
    {
      title: "Sales (30d)",
      value: "₱1,957.76",
      change: "Demo data",
      icon: DollarSign,
      color: "text-emerald-600",
    },
    {
      title: "Transactions",
      value: "18",
      change: "Demo data",
      icon: ShoppingCart,
      color: "text-emerald-600",
    },
    {
      title: "Active SKUs",
      value: "12",
      change: "Demo inventory",
      icon: PackageSearch,
      color: "text-emerald-600",
    },
    {
      title: "Team Members",
      value: "5",
      change: "Demo profiles",
      icon: Users,
      color: "text-emerald-600",
    },
  ],
  recentSales: [
    {
      id: "demo-1",
      branch: "Main Branch",
      created_at: "Nov 8, 2025",
      total_amount: 1957.76,
    },
    {
      id: "demo-2",
      branch: "Downtown",
      created_at: "Nov 7, 2025",
      total_amount: 672,
    },
  ],
  lowStock: [
    { id: "demo-p1", name: "Sample Pro", stock_quantity: 18, reorder_level: 10 },
    { id: "demo-p2", name: "Junior Uniform", stock_quantity: 20, reorder_level: 10 },
  ],
  salesAnalytics: {
    daily: [
      { date: "Oct 10", total: 320 },
      { date: "Oct 11", total: 410 },
      { date: "Oct 12", total: 280 },
    ],
    weekly: [
      { week: "Week 40", total: 2150 },
      { week: "Week 41", total: 1890 },
    ],
    monthly: [
      { month: "Jun", total: 7800 },
      { month: "Jul", total: 8120 },
      { month: "Aug", total: 8610 },
      { month: "Sep", total: 9050 },
      { month: "Oct", total: 9320 },
      { month: "Nov", total: 9745 },
    ],
  },
};

const fetchDashboardData = async (): Promise<DashboardData> => {
  if (!isSupabaseConfigured) {
    return demoData;
  }

  const end = new Date();
  const startForSales = new Date();
  startForSales.setMonth(startForSales.getMonth() - 6);

  const [{ data: salesData, error: salesError }, { data: productsData, error: productsError }, { data: teamData, error: teamError }] =
    await Promise.all([
      supabase
        .from("sales")
        .select("id,total_amount,created_at,branch,status")
        .gte("created_at", startForSales.toISOString())
        .neq("status", "voided")
        .order("created_at", { ascending: false }),
      supabase.from("products").select("id,name,stock_quantity,reorder_level"),
      supabase.from("profiles").select("id"),
    ]);

  if (salesError) throw salesError;
  if (productsError) throw productsError;
  if (teamError) throw teamError;

  const sales = (salesData ?? [])
    .filter((sale) => sale.status !== "voided")
    .map((sale) => ({
    id: sale.id,
    branch: sale.branch,
    created_at: sale.created_at,
    total_amount: Number(sale.total_amount ?? 0),
  }));

  const products = productsData ?? [];
  const teamMembers = teamData?.length ?? 0;

  const recentSales = sales.slice(0, 8).map((sale) => ({
    ...sale,
    created_at: formatDateLabel(sale.created_at),
  }));

  const lowStock = products
    .filter((product) => product.reorder_level !== undefined && product.stock_quantity !== undefined)
    .filter((product) => product.stock_quantity <= product.reorder_level)
    .slice(0, 8);

  const sales30d = filterByDays(sales, 30);
  const sales30dTotal = sales30d.reduce((sum, sale) => sum + sale.total_amount, 0);
  const sales30dCount = sales30d.length;

  const activeSkus = products.filter((product) => (product.stock_quantity ?? 0) > 0).length;

  const metrics: Metric[] = [
    {
      title: "Sales (30d)",
      value: formatCurrency(sales30dTotal, CURRENCY),
      change: "Live data",
      icon: DollarSign,
      color: "text-emerald-600",
    },
    {
      title: "Transactions",
      value: `${sales30dCount}`,
      change: "Last 30 days",
      icon: ShoppingCart,
      color: "text-emerald-600",
    },
    {
      title: "Active SKUs",
      value: `${activeSkus}`,
      change: "In-stock products",
      icon: PackageSearch,
      color: "text-emerald-600",
    },
    {
      title: "Team Members",
      value: `${teamMembers}`,
      change: "Supabase Auth",
      icon: Users,
      color: "text-emerald-600",
    },
  ];

  const analytics = buildAnalyticsDatasets(sales, end);

  return {
    metrics,
    recentSales,
    lowStock,
    currency: CURRENCY,
    salesAnalytics: analytics,
  };
};

export function useDashboardData() {
  const { data, isLoading } = useSupabaseQuery(["dashboard", "summary"], fetchDashboardData, {
    enabled: isSupabaseConfigured,
  });

  const payload = useMemo(() => {
    if (!isSupabaseConfigured) {
      return demoData;
    }
    return data ?? demoData;
  }, [data]);

  return {
    metrics: payload.metrics,
    recentSales: payload.recentSales,
    lowStock: payload.lowStock,
    currency: payload.currency,
    salesAnalytics: payload.salesAnalytics,
    loading: isLoading && isSupabaseConfigured,
  };
}

function filterByDays(records: SalesRecord[], days: number) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - (days - 1));
  return records.filter((record) => new Date(record.created_at) >= threshold);
}

function formatDateLabel(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildAnalyticsDatasets(records: SalesRecord[], endDate: Date) {
  const daily = buildDailyDataset(records, endDate, 30);
  const weekly = buildWeeklyDataset(records, endDate, 8);
  const monthly = buildMonthlyDataset(records, endDate, 6);
  return { daily, weekly, monthly };
}

function buildDailyDataset(records: SalesRecord[], endDate: Date, days: number): SalesPoint[] {
  const dataset: SalesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const total = records
      .filter((record) => sameDay(new Date(record.created_at), date))
      .reduce((sum, record) => sum + record.total_amount, 0);
    dataset.push({ date: label, total: Number(total.toFixed(2)) });
  }
  return dataset;
}

function buildWeeklyDataset(records: SalesRecord[], endDate: Date, weeks: number): SalesPoint[] {
  const dataset: SalesPoint[] = [];
  const tempDate = new Date(endDate);
  tempDate.setHours(0, 0, 0, 0);
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(tempDate);
    weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay());
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    const label = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    const total = records
      .filter((record) => {
        const created = new Date(record.created_at);
        created.setHours(0, 0, 0, 0);
        return created >= weekStart && created <= new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59);
      })
      .reduce((sum, record) => sum + record.total_amount, 0);
    dataset.push({ week: label, total: Number(total.toFixed(2)) });
  }
  return dataset;
}

function buildMonthlyDataset(records: SalesRecord[], endDate: Date, months: number): SalesPoint[] {
  const dataset: SalesPoint[] = [];
  const tempDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  for (let i = months - 1; i >= 0; i--) {
    const monthDate = new Date(tempDate.getFullYear(), tempDate.getMonth() - i, 1);
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    const label = monthDate.toLocaleDateString("en-US", { month: "short" });
    const total = records
      .filter((record) => {
        const created = new Date(record.created_at);
        return created >= monthDate && created < nextMonth;
      })
      .reduce((sum, record) => sum + record.total_amount, 0);
    dataset.push({ month: label, total: Number(total.toFixed(2)) });
  }
  return dataset;
}

function sameDay(dateA: Date, dateB: Date) {
  return dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth() && dateA.getDate() === dateB.getDate();
}

