import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Boxes,
  Search,
  WalletCards,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { useDashboardData } from "@/modules/dashboard/hooks/useDashboardData";
import { gradientId } from "@/modules/dashboard/utils/chartUtils";
import { formatCurrency, formatDate } from "@/utils/format";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import type { UserRole } from "@/lib/permissions";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      staggerChildren: 0.08,
      ease: "easeOut",
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

const METRIC_ROLES: Record<string, readonly UserRole[]> = {
  "Sales (30d)":    ["admin", "accountant", "manager"],
  "Transactions":   ["admin", "accountant", "manager"],
  "Active SKUs":    ["admin", "accountant", "inventory_clerk"],
  "Team Members":   ["admin", "hr", "manager"],
};

export function DashboardPage() {
  const { metrics, lowStock, currency, loading, salesAnalytics } = useDashboardData();
  const profile = useSessionStore(selectProfile);
  const role = profile?.role as UserRole | undefined;

  const visibleMetrics = metrics.filter((m) => {
    const allowed = METRIC_ROLES[m.title];
    return !allowed || !role || allowed.includes(role);
  });

  const showSalesFeed    = !role || ["admin", "accountant", "manager"].includes(role);
  const showLowStock     = !role || ["admin", "inventory_clerk"].includes(role);
  const showAnalytics    = !role || ["admin", "accountant", "manager"].includes(role);

  const [salesView, setSalesView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [transactionSearch, setTransactionSearch] = useState("");

  // ── Transaction feed date filter ──────────────────────────────────────────
  type TxnPreset = "today" | "week" | "month" | "last-month";
  const [txnPreset, setTxnPreset] = useState<TxnPreset | null>("month");
  const [browseMonth, setBrowseMonth] = useState<string>(""); // "YYYY-MM" when preset is null

  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      return { value, label };
    });
  }, []);

  const { txnFrom, txnTo } = useMemo(() => {
    const now = new Date();
    if (txnPreset === "today") {
      return {
        txnFrom: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
        txnTo:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString(),
      };
    }
    if (txnPreset === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return { txnFrom: start.toISOString(), txnTo: now.toISOString() };
    }
    if (txnPreset === "last-month") {
      return {
        txnFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
        txnTo:   new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).toISOString(),
      };
    }
    if (txnPreset === "month") {
      return {
        txnFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        txnTo:   now.toISOString(),
      };
    }
    // browse a specific past month
    const [y, m] = browseMonth ? browseMonth.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
    return {
      txnFrom: new Date(y, m - 1, 1).toISOString(),
      txnTo:   new Date(y, m, 0, 23, 59, 59, 999).toISOString(),
    };
  }, [txnPreset, browseMonth]);

  type TxnSale = {
    id: string;
    sale_number?: string | null;
    receipt_number?: number | null;
    branch: string | null;
    created_at: string;
    total_amount: number;
    status?: string | null;
    cashier_name?: string | null;
    cashier_email?: string | null;
    customer_name?: string | null;
  };

  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ["dashboard-transactions", txnFrom, txnTo],
    queryFn: () =>
      api.get<{ sales: TxnSale[] }>(
        `/sales?from=${encodeURIComponent(txnFrom)}&to=${encodeURIComponent(txnTo)}`,
      ),
    staleTime: 60_000,
  });

  const salesDatasets = useMemo(() => {
    const base = salesAnalytics ?? { daily: [], weekly: [], monthly: [] };
    return {
      daily: base.daily ?? [],
      weekly: base.weekly ?? [],
      monthly: base.monthly ?? [],
    };
  }, [salesAnalytics]);

  const filteredRecentSales = useMemo(() => {
    const raw = (txnData?.sales ?? []).filter((s) => s.status !== "voided");
    const query = transactionSearch.trim().toLowerCase();
    if (!query) return raw.slice(0, 50);
    return raw
      .filter((sale) => {
        const haystack = [
          sale.sale_number,
          sale.receipt_number != null ? String(sale.receipt_number) : null,
          sale.cashier_name,
          sale.cashier_email,
          sale.customer_name,
          sale.branch,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 50);
  }, [txnData, transactionSearch]);

  const currentData = salesDatasets[salesView];
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleMetrics.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.28 }}
          >
            <Card className="glass-panel overflow-hidden rounded-[1.75rem] border-white/60">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardDescription className="text-xs uppercase tracking-[0.24em] text-primary/60">
                      {metric.title}
                    </CardDescription>
                    <CardTitle className="mt-3 text-3xl text-foreground">{metric.value}</CardTitle>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                    <metric.icon className={`h-5 w-5 ${metric.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between pt-0">
                <p className="text-sm text-muted-foreground">{metric.change}</p>
                <div className="flex items-center gap-1 text-sm font-semibold text-primary">
                  <ArrowUpRight className="h-4 w-4" />
                  Active
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {(showSalesFeed || showLowStock) && (
        <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[1.55fr_0.95fr]">
        {showSalesFeed && <Card className="glass-panel rounded-[2rem] border-white/60">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardDescription className="text-xs uppercase tracking-[0.24em] text-primary/60">
                Recent Sales
              </CardDescription>
              <CardTitle className="mt-2 text-3xl text-foreground">Latest transaction pulse</CardTitle>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                A clean feed of the newest council transactions so the team can confirm activity at a glance.
              </p>
            </div>
            <div className="hidden rounded-2xl border border-primary/10 bg-primary/10 p-3 text-primary sm:flex">
              <WalletCards className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Date filter — one-click presets + month browse */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "today",      label: "Today"      },
                  { id: "week",       label: "This Week"  },
                  { id: "month",      label: "This Month" },
                  { id: "last-month", label: "Last Month" },
                ] as { id: TxnPreset; label: string }[]
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => { setTxnPreset(id); setBrowseMonth(""); }}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                    txnPreset === id
                      ? "bg-primary text-primary-foreground"
                      : "border border-white/60 bg-white/70 text-foreground hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
              <Select
                value={txnPreset === null ? browseMonth : ""}
                onValueChange={(v) => { setBrowseMonth(v); setTxnPreset(null); }}
              >
                <SelectTrigger className={`h-8 w-[160px] rounded-full text-xs ${txnPreset === null ? "border-primary bg-primary/10 text-primary font-medium" : "border-white/60 bg-white/70"}`}>
                  <SelectValue placeholder="Browse month…" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!txnLoading && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {filteredRecentSales.length} result{filteredRecentSales.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={transactionSearch}
                onChange={(event) => setTransactionSearch(event.target.value)}
                placeholder="Search POS no., receipt no., cashier, customer, or branch"
                className="h-11 rounded-[1rem] border-white/60 bg-white/80 pl-10"
              />
            </div>
            {txnLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 rounded-[1.25rem] bg-muted/80" />
              ))
            ) : filteredRecentSales.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-primary/20 bg-primary/5 p-5 text-sm text-muted-foreground">
                No transactions matched that search.
              </div>
            ) : (
              filteredRecentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex flex-col gap-3 rounded-[1.5rem] border border-white/65 bg-white/80 p-4 shadow-sm transition-transform duration-300 hover:-translate-y-1 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {sale.cashier_name ?? sale.cashier_email ?? "Unknown cashier"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Processed by cashier
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Buyer: {sale.customer_name ?? "Walk-in customer"}
                    </p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-primary/70">
                      POS No. {sale.sale_number ?? sale.id}
                      {sale.receipt_number != null ? ` | Receipt #${sale.receipt_number}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {sale.branch ?? "Main Branch"} | {formatDate(sale.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Synced
                    </span>
                    <p className="text-lg font-semibold text-primary">{formatCurrency(sale.total_amount, currency)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>}

        {showLowStock && <div className="grid gap-6">
          <Card className="glass-panel rounded-[2rem] border-white/60">
            <CardHeader>
              <CardDescription className="text-xs uppercase tracking-[0.24em] text-primary/60">
                Inventory Watch
              </CardDescription>
              <CardTitle className="mt-2 text-3xl text-foreground">Low stock alert</CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Quickly spot which items need replenishment before they affect selling hours.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-[1.25rem] bg-muted/80" />
                ))
              ) : lowStock.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-primary/20 bg-primary/5 p-5 text-sm text-muted-foreground">
                  Inventory levels look healthy. No urgent stock items need action.
                </div>
              ) : (
                lowStock.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-[1.5rem] border border-white/65 bg-white/80 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{item.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Reorder level {item.reorder_level}
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600">
                      {item.stock_quantity} left
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>}
        </motion.div>
      )}

      {showAnalytics && <motion.div variants={itemVariants}>
        <Card className="glass-panel rounded-[2rem] border-white/60">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardDescription className="text-xs uppercase tracking-[0.24em] text-primary/60">
                  Sales Analytics
                </CardDescription>
                <CardTitle className="mt-2 text-3xl text-foreground">Revenue trend explorer</CardTitle>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Toggle between daily, weekly, and monthly views to understand momentum with less noise.
                </p>
              </div>
              <Tabs
                defaultValue="daily"
                onValueChange={(value) => setSalesView(value as "daily" | "weekly" | "monthly")}
                className="w-full sm:w-[220px]"
              >
                <TabsList className="grid w-full grid-cols-3 rounded-full bg-primary/10 p-1">
                  <TabsTrigger value="daily" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Daily
                  </TabsTrigger>
                  <TabsTrigger value="weekly" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Weekly
                  </TabsTrigger>
                  <TabsTrigger value="monthly" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    Monthly
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="min-h-[340px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={salesView}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                {currentData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center rounded-[1.75rem] border border-dashed border-primary/20 bg-primary/5 text-sm text-muted-foreground">
                    No data available for this timeframe.
                  </div>
                ) : (
                  <div className="rounded-[1.75rem] border border-white/60 bg-white/55 p-4 sm:p-6">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        {salesView} range
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Boxes className="h-4 w-4 text-primary" />
                        Interactive performance tracking
                      </div>
                    </div>
                    <div className="h-[320px] w-full" aria-label={`Sales analytics chart for ${salesView} view`} role="img">
                      <ResponsiveContainer width="100%" height="100%">
                        {salesView === "weekly" ? (
                          <BarChart data={currentData} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="4 10" stroke="#d8e7de" vertical={false} />
                            <XAxis dataKey="week" tickLine={false} axisLine={false} stroke="#5d7764" />
                            <YAxis hide />
                            <Tooltip content={<SalesTooltip />} />
                            <Bar dataKey="total" radius={[12, 12, 4, 4]} fill="#1d7a54" />
                          </BarChart>
                        ) : salesView === "monthly" ? (
                          <AreaChart data={currentData} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}>
                            <defs>
                              <linearGradient id={gradientId("monthly")} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#17563c" stopOpacity={0.38} />
                                <stop offset="100%" stopColor="#17563c" stopOpacity={0.04} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="4 10" stroke="#d8e7de" vertical={false} />
                            <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="#5d7764" />
                            <YAxis hide />
                            <Tooltip content={<SalesTooltip />} />
                            <Area type="monotone" dataKey="total" stroke="#17563c" strokeWidth={3} fill={`url(#${gradientId("monthly")})`} />
                          </AreaChart>
                        ) : (
                          <LineChart data={currentData} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}>
                            <defs>
                              <linearGradient id={gradientId("daily")} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#1d7a54" stopOpacity={0.42} />
                                <stop offset="100%" stopColor="#1d7a54" stopOpacity={0.03} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="4 10" stroke="#d8e7de" vertical={false} />
                            <XAxis dataKey="date" tickLine={false} axisLine={false} stroke="#5d7764" />
                            <YAxis hide tickCount={6} />
                            <Tooltip content={<SalesTooltip />} />
                            <Line type="monotone" dataKey="total" stroke="#1d7a54" strokeWidth={3} dot={false} />
                            <Area type="monotone" dataKey="total" stroke="none" fill={`url(#${gradientId("daily")})`} />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>}
    </motion.div>
  );
}

const SalesTooltip = ({ active, payload, label }: TooltipProps<string, string>) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });

  return (
    <div className="min-w-[180px] rounded-[1.25rem] border border-white/70 bg-white/95 p-4 text-sm shadow-[0_18px_40px_rgba(26,46,34,0.14)] backdrop-blur">
      <p className="text-xs uppercase tracking-[0.18em] text-primary/60">{label}</p>
      <p className="mt-2 text-sm text-muted-foreground">Total recorded sales</p>
      <p className="mt-1 text-xl font-semibold text-primary">{formatter.format(payload[0].value as unknown as number)}</p>
    </div>
  );
};

export default DashboardPage;

