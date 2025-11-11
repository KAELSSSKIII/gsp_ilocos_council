import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/utils/format";
import { ClipboardCheck, ReceiptText, CalendarClock } from "lucide-react";

const payrollPreview = [
  {
    employee: "Maria Santos",
    base: 18000,
    overtime: 1250,
    deductions: 950,
    net: 18300,
  },
  {
    employee: "Liza Dela Cruz",
    base: 22000,
    overtime: 0,
    deductions: 2750,
    net: 19250,
  },
];

export function PayrollPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payroll & HR</h1>
          <p className="text-muted-foreground">Automate attendance-to-payroll calculations and voucher postings.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">Configure Pay Period</Button>
          <Button>Run Payroll</Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Current Payroll Cycle</CardTitle>
          <CardDescription>Review payroll calculations before posting to accounting.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Base Pay</TableHead>
                <TableHead className="text-right">Overtime</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollPreview.map((row) => (
                <TableRow key={row.employee}>
                  <TableCell>{row.employee}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.base)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.overtime)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.deductions)}</TableCell>
                  <TableCell className="text-right font-semibold text-card-foreground">
                    {formatCurrency(row.net)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <CalendarClock className="h-5 w-5 text-primary" /> Attendance Sync
            </CardTitle>
            <CardDescription>Attendance, shift logs, and leave requests feed directly into payroll.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Integration with POS clock-in/out and HR leave approvals ensures accurate payroll preparation.
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <ReceiptText className="h-5 w-5 text-emerald-500" /> Payslip Generation
            </CardTitle>
            <CardDescription>Generate PDF payslips and email them to staff with one click.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Once the payroll run is approved, a voucher entry will be posted to accounting and payslips will be
            available for download.
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <ClipboardCheck className="h-5 w-5 text-amber-500" /> Compliance & Taxes
            </CardTitle>
            <CardDescription>Compute SSS, PhilHealth, Pag-IBIG, and withholding taxes automatically.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Reports for statutory compliance and year-end summaries will be provided here.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



