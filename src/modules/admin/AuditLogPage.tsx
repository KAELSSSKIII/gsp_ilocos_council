import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldCheck, PackageSearch } from "lucide-react";

type StockAdjustment = {
  id: string;
  product_id: string | null;
  product_name: string;
  old_quantity: number;
  new_quantity: number;
  adjustment: number;
  reason: string | null;
  adjusted_by: string | null;
  adjusted_by_name: string | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  actor_username: string | null;
  actor_role: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  user_login: "Login",
  user_created: "User Created",
  user_updated: "User Updated",
  user_deleted: "User Deleted",
  sale_created: "Sale Created",
  sale_voided: "Sale Voided",
  employee_created: "Employee Created",
  employee_updated: "Employee Updated",
  payroll_created: "Payroll Created",
  payroll_status_updated: "Payroll Updated",
  member_created: "Member Created",
  member_updated: "Member Updated",
  member_deleted: "Member Deleted",
  product_created: "Product Created",
  product_updated: "Product Updated",
  stock_adjusted: "Stock Adjusted",
  category_created: "Category Created",
  category_updated: "Category Updated",
  category_deleted: "Category Deleted",
  receipt_settings_created: "Receipt Settings Created",
  receipt_settings_updated: "Receipt Settings Updated",
  business_settings_updated: "Business Settings Updated",
  voucher_created: "Voucher Created",
  voucher_status_updated: "Voucher Updated",
  account_created: "Account Created",
  account_updated: "Account Updated",
  accounting_mappings_updated: "Mappings Updated",
  journal_entry_created: "Journal Entry Created",
};

const ACTION_VARIANTS: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  sale_voided: "destructive",
  user_deleted: "destructive",
  member_deleted: "destructive",
  category_deleted: "destructive",
};

// Format a Date as YYYY-MM-DDTHH:mm in LOCAL time so that
// datetime-local inputs show the correct local clock and round-trip
// correctly with new Date(value).toISOString() (which treats the value
// as local time).
function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function StockAdjustmentsTab() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [from, setFrom] = useState(toDatetimeLocal(startOfDay));
  const [to,   setTo]   = useState(toDatetimeLocal(now));
  const [page, setPage] = useState(0);
  const limit = 100;

  const { data, isLoading } = useQuery({
    queryKey: ["stock-adjustments", from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({
        from: new Date(from).toISOString(),
        to:   new Date(to).toISOString(),
        limit: String(limit),
        offset: String(page * limit),
      });
      return api.get<{ adjustments: StockAdjustment[]; total: number }>(`/products/stock-adjustments?${params}`);
    },
    placeholderData: (prev) => prev,
  });

  const adjustments = data?.adjustments ?? [];
  const total       = data?.total       ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="datetime-local"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(0); }}
              className="w-52"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="datetime-local"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(0); }}
              className="w-52"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5" />
            Stock Adjustments
          </CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : `${total.toLocaleString()} adjustment${total !== 1 ? "s" : ""} found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : adjustments.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No stock adjustments found for the selected period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Date & Time</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24 text-right">Old Qty</TableHead>
                  <TableHead className="w-24 text-right">New Qty</TableHead>
                  <TableHead className="w-28 text-right">Change</TableHead>
                  <TableHead className="w-40">Adjusted By</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(a.created_at), "MMM d, yyyy HH:mm:ss")}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{a.product_name}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{a.old_quantity}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{a.new_quantity}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={a.adjustment >= 0 ? "secondary" : "destructive"}
                        className={a.adjustment > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : ""}
                      >
                        {a.adjustment >= 0 ? "+" : ""}{a.adjustment}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a.adjusted_by_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AuditLogPage() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [from, setFrom] = useState(toDatetimeLocal(startOfDay));
  const [to,   setTo]   = useState(toDatetimeLocal(now));
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 100;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", from, to, action, page],
    queryFn: () => {
      const params = new URLSearchParams({
        from: new Date(from).toISOString(),
        to:   new Date(to).toISOString(),
        limit: String(limit),
        offset: String(page * limit),
      });
      if (action !== "all") params.set("action", action);
      return api.get<{ logs: AuditLog[]; total: number }>(`/audit-logs?${params}`);
    },
    placeholderData: (prev) => prev,
  });

  const logs  = data?.logs  ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Audit Log</h1>
        <p className="text-muted-foreground">Complete record of all admin and system actions.</p>
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Activity Log
          </TabsTrigger>
          <TabsTrigger value="stock" className="flex items-center gap-1.5">
            <PackageSearch className="h-4 w-4" />
            Stock Adjustments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4 space-y-4">

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="datetime-local"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(0); }}
              className="w-52"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="datetime-local"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(0); }}
              className="w-52"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Activity Records
          </CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : `${total.toLocaleString()} record${total !== 1 ? "s" : ""} found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No activity records found for the selected filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Date & Time</TableHead>
                  <TableHead className="w-44">Action</TableHead>
                  <TableHead className="w-36">Actor</TableHead>
                  <TableHead className="w-32">Entity</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANTS[log.action] ?? "secondary"} className="text-[11px]">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.actor_name ?? log.actor_username ?? "System"}
                      {log.actor_role && (
                        <span className="ml-1 text-xs text-muted-foreground capitalize">({log.actor_role})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">
                      {log.entity_type}
                    </TableCell>
                    <TableCell className="text-sm">{log.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <StockAdjustmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
