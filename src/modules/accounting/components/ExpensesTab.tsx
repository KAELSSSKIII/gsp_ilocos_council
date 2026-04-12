import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, Receipt, Hash } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";

interface Voucher {
  id: string;
  voucher_number: string;
  voucher_type: string;
  amount: number;
  description: string;
  status: string;
  created_by_name: string | null;
  posted_at: string | null;
  created_at: string;
}

const MONTH_LABELS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function ExpensesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["vouchers-expenses"],
    queryFn: () =>
      api.get<{ vouchers: Voucher[] }>("/vouchers?type=payment&status=posted")
        .then((r) => r.vouchers),
    staleTime: 2 * 60 * 1000,
  });

  const expenses = useMemo(() => data ?? [], [data]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s, v) => s + Number(v.amount), 0);
  const largest       = expenses.reduce((max, v) => Math.max(max, Number(v.amount)), 0);
  const count         = expenses.length;

  // ── Group by month ─────────────────────────────────────────────────────────
  const byMonth = useMemo(() => {
    const map = new Map<string, { label: string; total: number; count: number }>();
    expenses.forEach((v) => {
      const d = new Date(v.posted_at ?? v.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, { label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`, total: 0, count: 0 });
      }
      const entry = map.get(key)!;
      entry.total += Number(v.amount);
      entry.count += 1;
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
  }, [expenses]);

  return (
    <div className="space-y-6">
      {/* Summary KPI cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-1 space-y-0">
            <CardDescription className="flex items-center gap-1 text-xs">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" /> Total Expenses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 space-y-0">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Receipt className="h-3.5 w-3.5 text-amber-500" /> Largest Single Expense
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(largest)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 space-y-0">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Hash className="h-3.5 w-3.5 text-primary" /> Number of Expenses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{count}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly summary */}
      {byMonth.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            By Month
          </h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {byMonth.slice(0, 8).map((m, i) => (
              <Card key={i} className="border-border">
                <CardHeader className="pb-1 space-y-0">
                  <CardDescription className="text-xs">{m.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold text-destructive">{formatCurrency(m.total)}</p>
                  <p className="text-xs text-muted-foreground">{m.count} expense{m.count !== 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Detail table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Posted Payment Vouchers</CardTitle>
          <CardDescription>All approved & posted expense vouchers</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No posted payment vouchers. Create and post vouchers in the Vouchers module.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date Posted</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.voucher_number}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{v.description}</TableCell>
                      <TableCell className="text-xs">
                        {v.posted_at ? new Date(v.posted_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>{v.created_by_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">
                        {formatCurrency(v.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="text-xs">posted</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
