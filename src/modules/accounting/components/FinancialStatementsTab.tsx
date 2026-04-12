import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/utils/format";

interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  account_type: string;
  category: string;
  normal_balance: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

interface TrialBalanceResponse {
  as_of: string;
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number };
}

interface BalanceSheetLine {
  code: string;
  name: string;
  account_type: string;
  category: string;
  normal_balance: string;
  balance: number;
}

interface BalanceSheetResponse {
  as_of: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilities_and_equity: number;
  };
}

function BalanceSection({
  title,
  rows,
  total,
}: {
  title: string;
  rows: BalanceSheetLine[];
  total: number;
}) {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No balances yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.code} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-sm">
                <div>
                  <p className="font-medium">{row.code} - {row.name}</p>
                  <p className="text-muted-foreground">{row.category.replace(/_/g, " ")}</p>
                </div>
                <p className="font-semibold">{formatCurrency(row.balance)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 font-semibold">
              <span>Total {title}</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FinancialStatementsTab() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const { data: trialBalance, isLoading: trialBalanceLoading } = useQuery({
    queryKey: ["trial-balance", asOf],
    queryFn: () => api.get<TrialBalanceResponse>(`/accounting/trial-balance?as_of=${asOf}`),
  });

  const { data: balanceSheet, isLoading: balanceSheetLoading } = useQuery({
    queryKey: ["balance-sheet", asOf],
    queryFn: () => api.get<BalanceSheetResponse>(`/accounting/balance-sheet?as_of=${asOf}`),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Financial Statements</CardTitle>
          <CardDescription>
            Trial balance and balance sheet derived directly from posted journal entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="as-of-date">As Of</Label>
            <Input id="as-of-date" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Trial Balance</CardTitle>
        </CardHeader>
        <CardContent>
          {trialBalanceLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading trial balance...</p>
          ) : !trialBalance || trialBalance.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No posted balances found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debits</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalance.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="capitalize">{row.account_type}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.total_debit)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.total_credit)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">Totals</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(trialBalance.totals.debit)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(trialBalance.totals.credit)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {balanceSheetLoading || !balanceSheet ? (
        <Card className="border-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Loading balance sheet...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <BalanceSection title="Assets" rows={balanceSheet.assets} total={balanceSheet.totals.assets} />
          <BalanceSection title="Liabilities" rows={balanceSheet.liabilities} total={balanceSheet.totals.liabilities} />
          <BalanceSection title="Equity" rows={balanceSheet.equity} total={balanceSheet.totals.equity} />
        </div>
      )}

      {balanceSheet && (
        <Card className="border-border">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Assets</p>
              <p className="text-2xl font-semibold">{formatCurrency(balanceSheet.totals.assets)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Liabilities + Equity</p>
              <p className="text-2xl font-semibold">{formatCurrency(balanceSheet.totals.liabilities_and_equity)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
