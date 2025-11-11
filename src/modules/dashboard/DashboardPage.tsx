import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDashboardData } from "@/modules/dashboard/hooks/useDashboardData";
import { formatCurrency } from "@/utils/format";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  LineChart,
  TooltipProps,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { gradientId } from "@/modules/dashboard/utils/chartUtils";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export function DashboardPage() {
  const { metrics, recentSales, lowStock, currency, loading, salesAnalytics } = useDashboardData();
  const [salesView, setSalesView] = useState<"daily" | "weekly" | "monthly">("daily");

  const salesDatasets = useMemo(() => {
    const base = salesAnalytics ?? { daily: [], weekly: [], monthly: [] };
    return {
      daily: base.daily ?? [],
      weekly: base.weekly ?? [],
      monthly: base.monthly ?? [],
    };
  }, [salesAnalytics]);

  const currentData = salesDatasets[salesView];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Central overview of Girl Scout operations</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-card-foreground">{metric.title}</CardTitle>
              <metric.icon className={`h-4 w-4 ${metric.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-card-foreground">{metric.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{metric.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Recent Sales</CardTitle>
            <CardDescription>Live view of the latest council transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-12 w-full rounded-md bg-muted" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-card-foreground">{sale.branch ?? "Main Branch"}</p>
                      <p className="text-sm text-muted-foreground">{sale.created_at}</p>
                    </div>
                    <p className="font-semibold text-primary">{formatCurrency(sale.total_amount, currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">Low Stock Alert</CardTitle>
              <CardDescription>Monitor inventory items nearing reorder thresholds.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-10 w-full rounded-md bg-muted" />
                  ))}
                </div>
              ) : lowStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inventory levels look healthy. No low stock items.</p>
              ) : (
                <div className="space-y-4">
                  {lowStock.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-card-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Reorder level {item.reorder_level}</p>
                      </div>
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600">
                        {item.stock_quantity} left
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <AddMemberCard />
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-card-foreground">Sales Analytics</CardTitle>
              <CardDescription>Interactive trends for the last 30 days, 8 weeks, and 6 months.</CardDescription>
            </div>
            <Tabs defaultValue="daily" onValueChange={setSalesView} className="w-[180px]">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="min-h-[320px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={salesView}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {currentData.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                  No data available for this timeframe.
                </div>
              ) : (
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {salesView === "daily" && (
                      <LineChart data={currentData} margin={{ top: 20, right: 24, left: 0, bottom: 8 }}>
                        <defs>
                          <linearGradient id={gradientId("daily" )} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#198754" stopOpacity={0.5} />
                            <stop offset="95%" stopColor="#198754" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 8" stroke="#E5F3ED" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} stroke="#0F5132" />
                        <YAxis hide tickCount={6} />
                        <Tooltip content={<SalesTooltip />} />
                        <Line type="monotone" dataKey="total" stroke="#198754" strokeWidth={2.5} dot={false} />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="none"
                          fill={`url(#${gradientId("daily")})`}
                        />
                      </LineChart>
                    )}
                    {salesView === "weekly" && (
                      <BarChart data={currentData} margin={{ top: 20, right: 24, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="4 8" stroke="#E5F3ED" />
                        <XAxis dataKey="week" tickLine={false} axisLine={false} stroke="#0F5132" />
                        <YAxis hide />
                        <Tooltip content={<SalesTooltip />} />
                        <Bar dataKey="total" radius={[8, 8, 0, 0]} fill="#198754" />
                      </BarChart>
                    )}
                    {salesView === "monthly" && (
                      <AreaChart data={currentData} margin={{ top: 20, right: 24, left: 0, bottom: 8 }}>
                        <defs>
                          <linearGradient id={gradientId("monthly")} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#146C43" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#146C43" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 8" stroke="#E5F3ED" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="#0F5132" />
                        <YAxis hide />
                        <Tooltip content={<SalesTooltip />} />
                        <Area type="monotone" dataKey="total" stroke="#146C43" strokeWidth={2} fill={`url(#${gradientId("monthly")})`} />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
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
    <div className="min-w-[160px] rounded-lg border border-emerald-200 bg-white/95 p-3 text-sm shadow-lg">
      <p className="font-medium text-emerald-900">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">Total</p>
      <p className="text-lg font-semibold text-emerald-700">{formatter.format(payload[0].value as number)}</p>
    </div>
  );
};

export default DashboardPage;

const addMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Member name must be at least 2 characters long."),
  code: z
    .string()
    .trim()
    .min(3, "Member code must be at least 3 characters.")
    .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers, or dashes."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
});

type AddMemberValues = z.infer<typeof addMemberSchema>;

const defaultValues: AddMemberValues = {
  name: "",
  code: "",
  email: "",
};

function AddMemberCard() {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset(defaultValues);
    }
  };

  const onSubmit = async (values: AddMemberValues) => {
    if (!isSupabaseConfigured) {
      toast.info("Connect Supabase to enable member enrollment.");
      return;
    }

    const payload = {
      name: values.name.trim(),
      code: values.code.trim().toUpperCase(),
      email: values.email?.trim() ? values.email.trim() : null,
    };

    setIsSubmitting(true);
    try {
      const { error } = await (supabase as any).from("members").insert(payload);
      if (error) {
        throw error;
      }
      toast.success("Member added successfully.");
      form.reset(defaultValues);
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add member.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-border">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <UserPlus className="h-5 w-5 text-primary" />
              Member Enrollment
            </CardTitle>
            <CardDescription>
              Register members so cashiers can apply loyalty discounts at the point of sale.
            </CardDescription>
          </div>
          <Button onClick={() => setOpen(true)} disabled={!isSupabaseConfigured}>
            Add Member
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {isSupabaseConfigured ? (
            <p>Use this tool to issue new membership codes and manage loyalty perks.</p>
          ) : (
            <p>Supabase connection is required before new members can be added from the dashboard.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Member</DialogTitle>
            <DialogDescription>Fill out the details below to enroll a member in the loyalty program.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="member-name">Member Name</Label>
                <Input
                  id="member-name"
                  placeholder="e.g. Alex Rivera"
                  autoComplete="name"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-rose-600">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-code">Member Code</Label>
                <Input
                  id="member-code"
                  placeholder="e.g. MEM-123"
                  autoComplete="off"
                  {...form.register("code")}
                />
                {form.formState.errors.code && (
                  <p className="text-sm text-rose-600">{form.formState.errors.code.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-email">Email (optional)</Label>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-rose-600">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !isSupabaseConfigured}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}



