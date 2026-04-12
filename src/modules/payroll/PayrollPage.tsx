import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, CheckCircle2, Banknote, FileSpreadsheet, Download } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";
import { readBusinessSettings } from "@/utils/businessSettings";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  full_name: string;
  position: string;
  salary: number;
  is_active?: boolean;
}

interface PayrollEntry {
  id: string;
  payroll_number: string;
  employee_id: string;
  employee_name: string;
  position: string;
  period_start: string;
  period_end: string;
  basic_salary: number;
  overtime_pay: number;
  cola: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  deductions: number;
  tax_deducted: number;
  net_salary: number;
  status: "pending" | "approved" | "paid";
  created_at: string;
}

const STATUS_COLORS: Record<string, "secondary" | "outline" | "default"> = {
  pending:  "outline",
  approved: "secondary",
  paid:     "default",
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PayrollPage() {
  const qc = useQueryClient();

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [showDialog, setShowDialog] = useState(false);

  // form state
  const [empId,       setEmpId]       = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd,   setPeriodEnd]   = useState("");
  const [basicSalary, setBasicSalary] = useState(0);
  const [overtime,    setOvertime]    = useState(0);
  const [cola,        setCola]        = useState(0);
  const [sss,         setSss]         = useState(0);
  const [philhealth,  setPhilhealth]  = useState(0);
  const [pagibig,     setPagibig]     = useState(0);
  const [tax,         setTax]         = useState(0);

  // derived
  const totalDeductions = sss + philhealth + pagibig + tax;
  const netSalary       = basicSalary + cola + overtime - totalDeductions;

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: empData } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.get<{ employees: Employee[] }>("/employees").then((r) => r.employees),
  });
  const activeEmployees = (empData ?? []).filter((employee) => employee.is_active !== false);

  const { data: payrollData, isLoading } = useQuery({
    queryKey: ["payroll", year, month],
    queryFn: () =>
      api
        .get<{ payroll: PayrollEntry[] }>(`/payroll?year=${year}&month=${month}`)
        .then((r) => r.payroll),
  });
  const entries = payrollData ?? [];

  // ── mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: object) => api.post("/payroll", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      toast.success("Payroll entry created");
      setShowDialog(false);
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Failed to create payroll entry")),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/payroll/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      toast.success("Status updated");
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Failed to update status")),
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEmpId("");
    setPeriodStart(`${year}-${String(month).padStart(2, "0")}-01`);
    // last day of current month
    const lastDay = new Date(year, month, 0).getDate();
    setPeriodEnd(`${year}-${String(month).padStart(2, "0")}-${lastDay}`);
    setBasicSalary(0);
    setOvertime(0);
    setCola(0);
    setSss(0);
    setPhilhealth(0);
    setPagibig(0);
    setTax(0);
    setShowDialog(true);
  };

  const prefillFromEmployee = (id: string) => {
    setEmpId(id);
    const emp = activeEmployees.find((e) => e.id === id);
    if (emp) setBasicSalary(Number(emp.salary));
  };

  const handleSubmit = () => {
    if (!empId || !periodStart || !periodEnd) {
      toast.error("Employee, period start, and period end are required");
      return;
    }
    createMutation.mutate({
      employee_id: empId,
      period_start: periodStart,
      period_end: periodEnd,
      basic_salary: basicSalary,
      overtime_pay: overtime,
      cola,
      sss,
      philhealth,
      pagibig,
      tax_deducted: tax,
    });
  };

  const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  const periodLabel = `${MONTHS[month - 1]} ${year}`;
  const { orgName, councilName } = readBusinessSettings();

  const exportExcel = () => {
    if (entries.length === 0) { toast.error("No payroll entries to export."); return; }
    const header = [
      [`${orgName} — ${councilName}`],
      ["Payroll Register"],
      [`Period: ${periodLabel}`],
      [],
      ["#", "Employee", "Position", "Period", "Basic Salary", "Overtime", "COLA",
       "SSS", "PhilHealth", "Pag-IBIG", "Tax", "Total Deductions", "Net Pay", "Status"],
    ];
    const rows = entries.map((e, i) => [
      i + 1,
      e.employee_name,
      e.position,
      `${e.period_start?.slice(0,10)} – ${e.period_end?.slice(0,10)}`,
      Number(e.basic_salary),
      Number(e.overtime_pay),
      Number(e.cola),
      Number(e.sss),
      Number(e.philhealth),
      Number(e.pagibig),
      Number(e.tax_deducted),
      Number(e.deductions),
      Number(e.net_salary),
      e.status,
    ]);
    const totRow = [
      "", "TOTAL", "", "",
      entries.reduce((s, e) => s + Number(e.basic_salary), 0),
      entries.reduce((s, e) => s + Number(e.overtime_pay), 0),
      entries.reduce((s, e) => s + Number(e.cola), 0),
      entries.reduce((s, e) => s + Number(e.sss), 0),
      entries.reduce((s, e) => s + Number(e.philhealth), 0),
      entries.reduce((s, e) => s + Number(e.pagibig), 0),
      entries.reduce((s, e) => s + Number(e.tax_deducted), 0),
      entries.reduce((s, e) => s + Number(e.deductions), 0),
      entries.reduce((s, e) => s + Number(e.net_salary), 0),
      "",
    ];
    const ws = XLSX.utils.aoa_to_sheet([...header, ...rows, [], totRow]);
    ws["!cols"] = [{ wch: 4 }, { wch: 26 }, { wch: 20 }, { wch: 24 },
      ...Array(10).fill({ wch: 14 }), { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `payroll-${year}-${String(month).padStart(2, "0")}.xlsx`);
  };

  const exportPDF = async () => {
    if (entries.length === 0) { toast.error("No payroll entries to export."); return; }
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`${orgName} — ${councilName}`, 148, 12, { align: "center" });
    doc.setFontSize(10);
    doc.text("PAYROLL REGISTER", 148, 18, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Period: ${periodLabel}`, 148, 24, { align: "center" });

    autoTable(doc, {
      startY: 30,
      head: [["#", "Employee", "Position", "Period", "Basic", "OT", "COLA",
              "SSS", "PhilH.", "Pag-IBIG", "Tax", "Deductions", "Net Pay", "Status"]],
      body: entries.map((e, i) => [
        i + 1,
        e.employee_name,
        e.position,
        `${e.period_start?.slice(0,10)}\n${e.period_end?.slice(0,10)}`,
        formatCurrency(e.basic_salary),
        formatCurrency(e.overtime_pay),
        formatCurrency(e.cola),
        formatCurrency(e.sss),
        formatCurrency(e.philhealth),
        formatCurrency(e.pagibig),
        formatCurrency(e.tax_deducted),
        formatCurrency(e.deductions),
        formatCurrency(e.net_salary),
        e.status,
      ]),
      foot: [[
        "", "TOTAL", "", "",
        formatCurrency(entries.reduce((s, e) => s + Number(e.basic_salary), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.overtime_pay), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.cola), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.sss), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.philhealth), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.pagibig), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.tax_deducted), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.deductions), 0)),
        formatCurrency(entries.reduce((s, e) => s + Number(e.net_salary), 0)),
        "",
      ]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [34, 139, 87], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 253, 244], textColor: [30, 100, 50], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 30 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        13: { cellWidth: 14 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    doc.save(`payroll-${year}-${String(month).padStart(2, "0")}.pdf`);
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payroll</h1>
          <p className="text-muted-foreground">
            Compute and track employee compensation, contributions, and net pay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <Select value={String(month)} onValueChange={(v) => setMonth(+v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            className="w-20"
            value={year}
            onChange={(e) => setYear(+e.target.value)}
            min={2020}
            max={2099}
          />
          <Button variant="outline" onClick={exportExcel} disabled={entries.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-green-700" /> Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={entries.length === 0}>
            <Download className="mr-2 h-4 w-4 text-red-600" /> PDF
          </Button>
          <Button onClick={openAdd} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {entries.length > 0 && (() => {
        const totBasic = entries.reduce((s, e) => s + Number(e.basic_salary), 0);
        const totNet   = entries.reduce((s, e) => s + Number(e.net_salary), 0);
        const totDed   = entries.reduce((s, e) => s + Number(e.deductions), 0);
        return (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-1"><CardDescription>Total Basic Pay</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(totBasic)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardDescription>Total Deductions</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold text-destructive">{formatCurrency(totDed)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardDescription>Total Net Pay</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-bold text-emerald-600">{formatCurrency(totNet)}</p></CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">
            {MONTHS[month - 1]} {year} Payroll
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No payroll entries for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">COLA</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="font-medium text-card-foreground">{entry.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{entry.position}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.period_start?.slice(0, 10)} — {entry.period_end?.slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(entry.basic_salary)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(entry.overtime_pay)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(entry.cola)}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatCurrency(entry.deductions)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      {formatCurrency(entry.net_salary)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[entry.status] ?? "outline"}>
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {entry.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => updateStatusMutation.mutate({ id: entry.id, status: "approved" })}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                        </Button>
                      )}
                      {entry.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs text-emerald-600"
                          onClick={() => updateStatusMutation.mutate({ id: entry.id, status: "paid" })}
                        >
                          <Banknote className="h-3 w-3 mr-1" /> Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Payroll Entry Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Payroll Entry</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Employee</Label>
              <Select value={empId} onValueChange={prefillFromEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name} — {e.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Basic Salary</Label>
              <Input type="number" min={0} value={basicSalary}
                onChange={(e) => setBasicSalary(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>COLA</Label>
              <Input type="number" min={0} value={cola}
                onChange={(e) => setCola(parseFloat(e.target.value) || 0)} />
            </div>

            <div className="space-y-1">
              <Label>Overtime Pay</Label>
              <Input type="number" min={0} value={overtime}
                onChange={(e) => setOvertime(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>Tax Withheld</Label>
              <Input type="number" min={0} value={tax}
                onChange={(e) => setTax(parseFloat(e.target.value) || 0)} />
            </div>

            <div className="space-y-1">
              <Label>SSS</Label>
              <Input type="number" min={0} value={sss}
                onChange={(e) => setSss(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label>PhilHealth</Label>
              <Input type="number" min={0} value={philhealth}
                onChange={(e) => setPhilhealth(parseFloat(e.target.value) || 0)} />
            </div>

            <div className="space-y-1">
              <Label>Pag-IBIG</Label>
              <Input type="number" min={0} value={pagibig}
                onChange={(e) => setPagibig(parseFloat(e.target.value) || 0)} />
            </div>

            <div className="flex flex-col justify-end space-y-1">
              <Label className="text-muted-foreground text-xs">Computed Net Pay</Label>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(netSalary)}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Create Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
