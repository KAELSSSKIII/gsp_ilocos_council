import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FileDown } from "lucide-react";
import type jsPDFType from "jspdf";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PnlResponse {
  from: string;
  to: string;
  income: {
    salesByCategory: { category: string; amount: number }[];
    rentalIncome: { space_name: string; amount: number }[];
    otherIncome: number;
    totalIncome: number;
  };
  expenses: {
    payroll: { salaries: number; cola: number; sss: number; philhealth: number; pagibig: number; total: number };
    voucherExpenses: { voucher_number: string; description: string; amount: number; date: string }[];
    totalExpenses: number;
  };
  netIncome: number;
}

type AutoTableDoc = jsPDFType & {
  lastAutoTable?: {
    finalY: number;
  };
};

// ─── Preset helpers ───────────────────────────────────────────────────────────

function getPresetRange(preset: string): { from: string; to: string } | null {
  const today = new Date();
  const pad   = (n: number) => String(n).padStart(2, "0");
  const fmt   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(from), to: fmt(today) };
  }
  if (preset === "quarter") {
    const q     = Math.floor(today.getMonth() / 3);
    const from  = new Date(today.getFullYear(), q * 3, 1);
    return { from: fmt(from), to: fmt(today) };
  }
  if (preset === "year") {
    return { from: `${today.getFullYear()}-01-01`, to: fmt(today) };
  }
  return null;
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function PnlRow({ label, amount, indent = false, bold = false }:
  { label: string; amount: number; indent?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${indent ? "pl-6" : ""} ${bold ? "font-semibold" : "text-sm"}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? (amount < 0 ? "text-destructive" : "") : ""}>{formatCurrency(amount)}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfitLossTab() {
  const now    = new Date();
  const todayS = now.toISOString().slice(0, 10);

  const [preset,  setPreset]  = useState("month");
  const [from,    setFrom]    = useState(() => getPresetRange("month")!.from);
  const [to,      setTo]      = useState(todayS);
  const [applied, setApplied] = useState(() => getPresetRange("month")!);

  const { data, isLoading } = useQuery({
    queryKey: ["pnl", applied.from, applied.to],
    queryFn:  () => api.get<PnlResponse>(`/accounting/pnl?from=${applied.from}&to=${applied.to}`),
    staleTime: 2 * 60 * 1000,
  });

  const pnl = data;

  const selectPreset = (key: string) => {
    setPreset(key);
    if (key !== "custom") {
      const range = getPresetRange(key)!;
      setFrom(range.from);
      setTo(range.to);
      setApplied(range);
    }
  };

  const applyCustom = () => {
    setApplied({ from, to });
  };

  // ── PDF Export ─────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!pnl) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) as AutoTableDoc;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Girl Scout Business Suite", 14, 16);
    doc.setFontSize(13);
    doc.text("Profit & Loss Statement", 14, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Period: ${pnl.from}  to  ${pnl.to}`, 14, 32);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);

    const fmt = (n: number) => `₱ ${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

    // Income section
    const incomeBody: (string | number)[][] = [
      ...pnl.income.salesByCategory.map((r) => [`  ${r.category}`, fmt(r.amount)]),
      ...pnl.income.rentalIncome.map((r) => [`  ${r.space_name} (Rental)`, fmt(r.amount)]),
      ...(pnl.income.otherIncome > 0 ? [["  Other Income", fmt(pnl.income.otherIncome)]] : []),
      ["TOTAL INCOME", fmt(pnl.income.totalIncome)],
    ];

    autoTable(doc, {
      startY: 46,
      head: [["INCOME", "Amount"]],
      body: incomeBody,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [5, 150, 105] },
      didParseCell: (data) => {
        if (data.row.index === incomeBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const afterIncome = (doc.lastAutoTable?.finalY ?? 46) + 4;

    const expBody: (string | number)[][] = [
      ["  Salaries & Wages",       fmt(pnl.expenses.payroll.salaries)],
      ["  COLA",                   fmt(pnl.expenses.payroll.cola)],
      ["  SSS",                    fmt(pnl.expenses.payroll.sss)],
      ["  PhilHealth",             fmt(pnl.expenses.payroll.philhealth)],
      ["  Pag-IBIG",               fmt(pnl.expenses.payroll.pagibig)],
      ...pnl.expenses.voucherExpenses.map((r) => [`  ${r.description}`, fmt(r.amount)]),
      ["TOTAL EXPENSES", fmt(pnl.expenses.totalExpenses)],
    ];

    autoTable(doc, {
      startY: afterIncome,
      head: [["EXPENSES", "Amount"]],
      body: expBody,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [239, 68, 68] },
      didParseCell: (data) => {
        if (data.row.index === expBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const afterExp = (doc.lastAutoTable?.finalY ?? afterIncome) + 4;

    autoTable(doc, {
      startY: afterExp,
      body: [[
        pnl.netIncome >= 0 ? "NET INCOME" : "NET LOSS",
        fmt(pnl.netIncome),
      ]],
      styles: { fontSize: 11, fontStyle: "bold" },
      bodyStyles: { fillColor: pnl.netIncome >= 0 ? [209, 250, 229] : [254, 226, 226] },
    });

    doc.save(`profit_loss_${pnl.from}_${pnl.to}.pdf`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Period selector */}
      <Card className="border-border">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            {[
              { key: "month",   label: "This Month" },
              { key: "quarter", label: "This Quarter" },
              { key: "year",    label: "This Year" },
              { key: "custom",  label: "Custom" },
            ].map(({ key, label }) => (
              <Button
                key={key}
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => selectPreset(key)}
              >
                {label}
              </Button>
            ))}

            {preset === "custom" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-8" />
                </div>
                <Button size="sm" onClick={applyCustom}>Apply</Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              className="ml-auto flex items-center gap-1"
              onClick={exportPDF}
              disabled={!pnl}
            >
              <FileDown className="h-3.5 w-3.5" /> Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* P&L Statement */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Profit & Loss Statement</CardTitle>
          <p className="text-sm text-muted-foreground">
            {applied.from} — {applied.to}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : !pnl ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data for this period.</p>
          ) : (
            <div className="space-y-6">
              {/* INCOME */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Income
                </h3>
                {pnl.income.salesByCategory.map((r) => (
                  <PnlRow key={r.category} label={r.category} amount={r.amount} indent />
                ))}
                {pnl.income.rentalIncome.map((r) => (
                  <PnlRow key={r.space_name} label={`${r.space_name} (Rental)`} amount={r.amount} indent />
                ))}
                {pnl.income.otherIncome > 0 && (
                  <PnlRow label="Other Income" amount={pnl.income.otherIncome} indent />
                )}
                <Separator className="my-2" />
                <PnlRow label="TOTAL INCOME" amount={pnl.income.totalIncome} bold />
              </div>

              {/* EXPENSES */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Expenses
                </h3>

                {/* Payroll sub-section */}
                <div className="mb-2">
                  <p className="text-xs font-medium text-muted-foreground pl-2 mb-1">Payroll</p>
                  {pnl.expenses.payroll.salaries > 0 &&
                    <PnlRow label="Salaries & Wages" amount={pnl.expenses.payroll.salaries} indent />}
                  {pnl.expenses.payroll.cola > 0 &&
                    <PnlRow label="COLA" amount={pnl.expenses.payroll.cola} indent />}
                  {pnl.expenses.payroll.sss > 0 &&
                    <PnlRow label="SSS Contributions" amount={pnl.expenses.payroll.sss} indent />}
                  {pnl.expenses.payroll.philhealth > 0 &&
                    <PnlRow label="PhilHealth" amount={pnl.expenses.payroll.philhealth} indent />}
                  {pnl.expenses.payroll.pagibig > 0 &&
                    <PnlRow label="Pag-IBIG" amount={pnl.expenses.payroll.pagibig} indent />}
                </div>

                {/* Voucher expenses */}
                {pnl.expenses.voucherExpenses.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground pl-2 mb-1">Other Expenses</p>
                    {pnl.expenses.voucherExpenses.map((r, i) => (
                      <PnlRow key={i} label={r.description} amount={r.amount} indent />
                    ))}
                  </div>
                )}

                <Separator className="my-2" />
                <PnlRow label="TOTAL EXPENSES" amount={pnl.expenses.totalExpenses} bold />
              </div>

              {/* NET INCOME */}
              <div className={`rounded-lg p-4 ${pnl.netIncome >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">
                    {pnl.netIncome >= 0 ? "NET INCOME" : "NET LOSS"}
                  </span>
                  <span className={`text-2xl font-bold ${pnl.netIncome >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {pnl.netIncome < 0 ? "(" : ""}{formatCurrency(Math.abs(pnl.netIncome))}{pnl.netIncome < 0 ? ")" : ""}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
