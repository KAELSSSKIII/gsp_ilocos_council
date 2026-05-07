import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";

interface LedgerRow {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  entry_type: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  is_reversal?: boolean;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const TYPE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  sale:    "default",
  payroll: "secondary",
  voucher: "outline",
  reversal: "secondary",
};

const PAGE_SIZE = 50;

export function GeneralLedgerTab() {
  const now = new Date();
  const [from, setFrom]     = useState(`${now.getFullYear()}-01-01`);
  const [to,   setTo]       = useState(now.toISOString().slice(0, 10));
  const [applied, setApplied] = useState({ from: `${now.getFullYear()}-01-01`, to: now.toISOString().slice(0, 10) });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [page, setPage]     = useState(0);

  const { data: accountsData } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: () => api.get<AccountOption[]>("/accounts"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["ledger", applied.from, applied.to, accountFilter],
    queryFn: () =>
      api.get<{ ledger: LedgerRow[] }>(
        `/accounting/account-ledger?from=${applied.from}&to=${applied.to}${accountFilter !== "all" ? `&account_id=${accountFilter}` : ""}`
      )
        .then((r) => r.ledger),
  });

  const accounts = (accountsData ?? []).filter((account) => account.is_active);
  const ledger = data ?? [];

  const hitLimit = ledger.length === 2000;

  const filtered = ledger.filter((r) => {
    const matchType = typeFilter === "all" || r.entry_type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.description.toLowerCase().includes(q)
      || r.reference.toLowerCase().includes(q)
      || `${r.account_code} ${r.account_name}`.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const totalPages   = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalDebit   = filtered.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit  = filtered.reduce((s, r) => s + Number(r.credit), 0);

  const handleApply = () => {
    setApplied({ from, to });
    setPage(0);
  };

  const exportCSV = () => {
    const rows = [
      ["Date", "Reference", "Account Code", "Account Name", "Type", "Description", "Debit", "Credit", "Balance"],
      ...filtered.map((r) => [
        r.date,
        r.reference,
        r.account_code,
        r.account_name,
        r.is_reversal ? "reversal" : (r.entry_type ?? "journal"),
        r.description,
        r.debit,
        r.credit,
        r.balance,
      ]),
    ];
    const csv  = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `ledger_${applied.from}_${applied.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card className="border-border">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
            </div>
            <Button onClick={handleApply}>Apply</Button>
            <div className="ml-auto flex items-center gap-2">
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-44"
              />
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sale">Sales</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                  <SelectItem value="voucher">Voucher</SelectItem>
                </SelectContent>
              </Select>
              <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setPage(0); }}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportCSV} className="flex items-center gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-card-foreground">General Ledger</CardTitle>
              <CardDescription>
                {applied.from} — {applied.to} · {filtered.length} entries
                {totalPages > 1 && ` · Page ${page + 1} of ${totalPages}`}
              </CardDescription>
            </div>
            <div className="text-right text-sm space-y-0.5">
              <p><span className="text-muted-foreground">Total Inflow: </span>
                <span className="font-semibold text-emerald-600">{formatCurrency(totalDebit)}</span></p>
              <p><span className="text-muted-foreground">Total Outflow: </span>
                <span className="font-semibold text-destructive">{formatCurrency(totalCredit)}</span></p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {hitLimit && (
            <p className="mb-3 text-xs text-amber-600 text-center">
              Showing first 2,000 entries. Narrow the date range to see more.
            </p>
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : paginated.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No entries found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row.date}</TableCell>
                        <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{row.account_code}</div>
                          <div className="text-xs text-muted-foreground">{row.account_name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={TYPE_BADGE[row.entry_type ?? "journal"] ?? "outline"} className="capitalize text-xs">
                            {row.is_reversal ? "reversal" : row.entry_type ?? "journal"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{row.description}</TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {Number(row.debit) > 0 ? formatCurrency(row.debit) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          {Number(row.credit) > 0 ? formatCurrency(row.credit) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${Number(row.balance) >= 0 ? "" : "text-destructive"}`}>
                          {formatCurrency(row.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-4">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
