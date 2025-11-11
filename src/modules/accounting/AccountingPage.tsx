import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/utils/format";
import { BookOpen, FileSpreadsheet, PiggyBank, Receipt, TrendingUp } from "lucide-react";

const ledgerRows = [
  {
    date: "2025-01-10",
    reference: "POS00045",
    description: "Troop 123 equipment purchase",
    debit: 1850,
    credit: 0,
    balance: 1850,
  },
  {
    date: "2025-01-10",
    reference: "EXP00012",
    description: "Badge embroidery supplier payment",
    debit: 0,
    credit: 950,
    balance: 900,
  },
];

export function AccountingPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Accounting & Finance</h1>
          <p className="text-muted-foreground">
            General ledger, invoicing, and reconciliation workflows for Girl Scout operations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" /> New Journal Entry
          </Button>
          <Button className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export Trial Balance
          </Button>
        </div>
      </div>

      <Tabs defaultValue="ledger" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="ledger">General Ledger</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="reconciliation">Bank Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <BookOpen className="h-5 w-5 text-primary" /> General Ledger Preview
              </CardTitle>
              <CardDescription>Auto postings from POS, payroll, and vouchers will surface here.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map((row) => (
                    <TableRow key={row.reference}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.reference}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.debit)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.credit)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="grid gap-4 md:grid-cols-2">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <TrendingUp className="h-5 w-5 text-emerald-500" /> Profit & Loss
              </CardTitle>
              <CardDescription>Configure date ranges and export to PDF/CSV.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Net revenue, cost of goods sold, and expense rollups will render here once financial postings are wired up.
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <PiggyBank className="h-5 w-5 text-amber-500" /> Cash Flow Forecast
              </CardTitle>
              <CardDescription>Integrates bank feeds and upcoming payables/receivables.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Forecast visualisations and AI-assisted categorisation will be added here.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">Bank Reconciliation</CardTitle>
              <CardDescription>
                Import bank statements, match deposits to POS sales, and approve variances.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-4">
              <p>
                Upload CSV, BPI/BDO exports, or connect Supabase bank feeds to reconcile automatically. Suggested matches
                and rule-based auto-classifications will populate here.
              </p>
              <Separator />
              <Button variant="outline" className="flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Import Bank Statement
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}



