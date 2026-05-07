import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { downloadXlsx } from "@/lib/xlsxExport";
import api from "@/lib/api";
import { readBusinessSettings } from "@/utils/businessSettings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DVoucher {
  id: string;
  voucher_number: string;
  voucher_type: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  posted_at: string | null;
  created_by_name: string;
  approved_by_name: string | null;
  account_name: string | null;
  account_code: string | null;
  account_type: string | null;
  account_category: string | null;
}

interface DPayroll {
  id: string;
  payroll_number: string;
  period_start: string;
  period_end: string;
  basic_salary: number;
  overtime_pay: number;
  cola: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  deductions: number;
  net_salary: number;
  status: string;
  employee_name: string;
  position: string;
}

interface DisbursementRow {
  date: string;
  payee: string;
  explanation: string;
  cvNo: string;
  checkNo: string;
  // Bank columns (Cr)
  bankMB: number; bankDBP1: number; bankDBP2: number; bankPNB: number;
  // Expense columns (Dr)
  nesPurchases: number; cashAdvance: number;
  salaries: number; cola: number; representationCE: number;
  clothingAllowance: number;
  sssExpense: number; philhealthExpense: number; pagibigExpense: number;
  transportation: number; postage: number; telephone: number; electric: number;
  officeEquipment: number; repairEquipment: number; officeSupplies: number;
  linens: number; kitchenEquipment: number; furnitureFixtures: number;
  vehicleMaintenance: number; gasoline: number;
  trainings: number; camping: number; conferences: number; representation: number;
  thinkingDay: number; advertising: number; miscellaneous: number; souvenirBook: number;
  // Liability columns (Cr)
  sssPayable: number; pagibigPayable: number; philhealthPayable: number;
  totalDebit: number; totalCredit: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

// ─── Category mapping from account_category/name ─────────────────────────────
function categorizeVoucher(v: DVoucher): Partial<DisbursementRow> {
  const cat  = (v.account_category ?? "").toLowerCase();
  const name = (v.account_name ?? v.description ?? "").toLowerCase();
  const amt  = Number(v.amount);

  if (name.includes("nes") || name.includes("purchases")) return { nesPurchases: amt };
  if (name.includes("cash advance"))                       return { cashAdvance: amt };
  if (name.includes("salar"))                             return { salaries: amt };
  if (name.includes("cola") || name.includes("cost of living")) return { cola: amt };
  if (name.includes("representation") && name.includes("ce"))   return { representationCE: amt };
  if (name.includes("clothing"))                           return { clothingAllowance: amt };
  if (name.includes("sss") && name.includes("expense"))   return { sssExpense: amt };
  if (name.includes("philhealth") && name.includes("expense")) return { philhealthExpense: amt };
  if (name.includes("pag-ibig") && name.includes("expense"))   return { pagibigExpense: amt };
  if (name.includes("transport"))                          return { transportation: amt };
  if (name.includes("postage") || name.includes("freight")) return { postage: amt };
  if (name.includes("telephone") || name.includes("internet") || name.includes("communications")) return { telephone: amt };
  if (name.includes("electric"))                           return { electric: amt };
  if (name.includes("office equipment") || name.includes("equipment") && !name.includes("kitchen")) return { officeEquipment: amt };
  if (name.includes("office supplies") || name.includes("supplies")) return { officeSupplies: amt };
  if (name.includes("linen"))                              return { linens: amt };
  if (name.includes("kitchen"))                            return { kitchenEquipment: amt };
  if (name.includes("furniture") || name.includes("fixture") || name.includes("chair") || name.includes("filing")) return { furnitureFixtures: amt };
  if (name.includes("vehicle") || name.includes("fuel filter")) return { vehicleMaintenance: amt };
  if (name.includes("gasoline") || name.includes("gas"))  return { gasoline: amt };
  if (name.includes("training"))                           return { trainings: amt };
  if (name.includes("camp"))                               return { camping: amt };
  if (name.includes("conference") || name.includes("meeting")) return { conferences: amt };
  if (name.includes("representation"))                     return { representation: amt };
  if (name.includes("thinking day") || name.includes("world thinking")) return { thinkingDay: amt };
  if (name.includes("advertis") || name.includes("publicity")) return { advertising: amt };
  if (name.includes("souvenir"))                           return { souvenirBook: amt };
  if (cat.includes("expense") || name.includes("miscellaneous")) return { miscellaneous: amt };
  return { miscellaneous: amt };
}

function zeroRow(): DisbursementRow {
  return {
    date:"", payee:"", explanation:"", cvNo:"", checkNo:"",
    bankMB:0, bankDBP1:0, bankDBP2:0, bankPNB:0,
    nesPurchases:0, cashAdvance:0, salaries:0, cola:0, representationCE:0,
    clothingAllowance:0, sssExpense:0, philhealthExpense:0, pagibigExpense:0,
    transportation:0, postage:0, telephone:0, electric:0,
    officeEquipment:0, repairEquipment:0, officeSupplies:0, linens:0,
    kitchenEquipment:0, furnitureFixtures:0, vehicleMaintenance:0, gasoline:0,
    trainings:0, camping:0, conferences:0, representation:0,
    thinkingDay:0, advertising:0, miscellaneous:0, souvenirBook:0,
    sssPayable:0, pagibigPayable:0, philhealthPayable:0,
    totalDebit:0, totalCredit:0,
  };
}

// ─── XLSX Export ─────────────────────────────────────────────────────────────
async function exportXLSX(rows: DisbursementRow[], year: number, month: number, settings: ReturnType<typeof readBusinessSettings>) {
  const HEADERS_ROW1 = [
    "DATE","PAYEE","EXPLANATION","CV #","CHECK #",
    `${settings.bankAccount3} (CR)`,
    `${settings.bankAccount1} (CR)`,
    `${settings.bankAccount4} (CR)`,
    `${settings.bankAccount5} (CR)`,
    "NES PURCHASES (DR)","CASH ADVANCE (DR)",
    "SALARIES AND WAGES (DR)","COST OF LIVING ALLOWANCE (DR)","REPRESENTATION CE (DR)",
    "CLOTHING ALLOWANCE (DR)",
    "SSS PREMIUM EXPENSE (DR)","PHILHEALTH PREMIUM EXPENSE (DR)","PAG-IBIG PREMIUM EXPENSE (DR)",
    "TRANSPORTATION & TRAVEL (DR)","POSTAGE & FREIGHT (DR)","TELEPHONE & COMMS (DR)","ELECTRIC BILL (DR)",
    "OFFICE EQUIPMENT (DR)","REPAIR & MAINT - EQUIP (DR)","OFFICE SUPPLIES (DR)",
    "MAINTENANCE - LINENS (DR)","KITCHEN EQUIPMENT (DR)","FURNITURE & FIXTURES (DR)",
    "MAINT - SERVICE VEHICLE (DR)","GASOLINE AND OIL (DR)",
    "TRAININGS (DR)","CAMPINGS (DR)","CONFERENCES & MEETINGS (DR)","REPRESENTATION (DR)",
    "WORLD THINKING DAY (DR)","ADVERTISING & PUBLICITY (DR)","MISCELLANEOUS (DR)","SOUVENIR BOOK (DR)",
    "SSS PREMIUM PAYABLE (CR)","PAG-IBIG PAYABLE (CR)","PHILHEALTH PAYABLE (CR)",
    "TOTAL DEBIT","TOTAL CREDIT",
  ];

  const dataRows = rows.map(r => [
    r.date, r.payee, r.explanation, r.cvNo, r.checkNo,
    r.bankMB || "", r.bankDBP1 || "", r.bankDBP2 || "", r.bankPNB || "",
    r.nesPurchases||"", r.cashAdvance||"",
    r.salaries||"", r.cola||"", r.representationCE||"",
    r.clothingAllowance||"",
    r.sssExpense||"", r.philhealthExpense||"", r.pagibigExpense||"",
    r.transportation||"", r.postage||"", r.telephone||"", r.electric||"",
    r.officeEquipment||"", r.repairEquipment||"", r.officeSupplies||"",
    r.linens||"", r.kitchenEquipment||"", r.furnitureFixtures||"",
    r.vehicleMaintenance||"", r.gasoline||"",
    r.trainings||"", r.camping||"", r.conferences||"", r.representation||"",
    r.thinkingDay||"", r.advertising||"", r.miscellaneous||"", r.souvenirBook||"",
    r.sssPayable||"", r.pagibigPayable||"", r.philhealthPayable||"",
    r.totalDebit||"", r.totalCredit||"",
  ]);

  // Totals row
  const totalsRow = ["","","TOTAL","","",
    ...Array(HEADERS_ROW1.length - 5).fill(0).map((_, i) => rows.reduce((s, r) => s + Number(Object.values(r)[i + 5] || 0), 0) || ""),
  ];

  const aoa = [
    [settings.orgName.toUpperCase()],
    [settings.councilName.toUpperCase()],
    ["CASH DISBURSEMENT"],
    [`FOR THE MONTH OF ${MONTHS[month - 1].toUpperCase()}, ${year}`],
    [],
    HEADERS_ROW1,
    ...dataRows,
    totalsRow,
  ];

  const colWidths = HEADERS_ROW1.map((_, i) => i < 5 ? (i === 2 ? 40 : 16) : 14);
  await downloadXlsx(
    [{ name: "Cash Disbursement", data: aoa, colWidths }],
    `cash-disbursement-${year}-${String(month).padStart(2, "0")}.xlsx`,
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CashDisbursementJournalPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const settings = readBusinessSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["disbursement-journal", year, month],
    queryFn: () => api.get<{ vouchers: DVoucher[]; payroll: DPayroll[] }>(`/reports/disbursement-journal?year=${year}&month=${month}`),
  });

  const rows: DisbursementRow[] = useMemo(() => {
    const result: DisbursementRow[] = [];

    // Vouchers
    (data?.vouchers ?? []).forEach(v => {
      const base = zeroRow();
      base.date        = format(new Date(v.created_at), "MM/dd/yyyy");
      base.explanation = v.description;
      base.cvNo        = v.voucher_number;
      base.payee       = v.created_by_name;
      // Bank credit (DBP1 by default – user can edit in Excel)
      base.bankDBP1    = Number(v.amount);
      // Expense debit
      const cat = categorizeVoucher(v);
      Object.assign(base, cat);
      base.totalDebit  = Number(v.amount);
      base.totalCredit = Number(v.amount);
      result.push(base);
    });

    // Payroll entries – group by payroll_number
    const payrollMap = new Map<string, DPayroll[]>();
    (data?.payroll ?? []).forEach(p => {
      if (!payrollMap.has(p.payroll_number)) payrollMap.set(p.payroll_number, []);
      payrollMap.get(p.payroll_number)!.push(p);
    });

    payrollMap.forEach((entries) => {
      const first = entries[0];
      const base = zeroRow();
      base.date        = format(parseISO(first.period_end), "MM/dd/yyyy");
      base.payee       = "RONAMY ROSARIO-ABLOG";
      base.explanation = `Payment of Salaries for the Period of ${format(parseISO(first.period_start),"MMMM d")} - ${format(parseISO(first.period_end),"d, yyyy")}`;
      base.cvNo        = first.payroll_number;
      const totalSalaries = entries.reduce((s, e) => s + Number(e.basic_salary), 0);
      const totalCola     = entries.reduce((s, e) => s + Number(e.cola), 0);
      const totalRep      = entries.reduce((s, e) => s + Number(e.overtime_pay), 0);
      const totalSSS      = entries.reduce((s, e) => s + Number(e.sss), 0);
      const totalPH       = entries.reduce((s, e) => s + Number(e.philhealth), 0);
      const totalPI       = entries.reduce((s, e) => s + Number(e.pagibig), 0);
      const totalNet      = entries.reduce((s, e) => s + Number(e.net_salary), 0);
      base.salaries         = totalSalaries;
      base.cola             = totalCola;
      base.representationCE = totalRep;
      base.sssPayable       = totalSSS;
      base.philhealthPayable= totalPH;
      base.pagibigPayable   = totalPI;
      base.bankDBP1         = totalNet;
      base.totalDebit       = totalSalaries + totalCola + totalRep;
      base.totalCredit      = totalNet + totalSSS + totalPH + totalPI;
      result.push(base);
    });

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [data]);

  const colTotals = useMemo(() => {
    const keys: (keyof DisbursementRow)[] = [
      "bankMB","bankDBP1","bankDBP2","bankPNB",
      "nesPurchases","cashAdvance","salaries","cola","representationCE","clothingAllowance",
      "sssExpense","philhealthExpense","pagibigExpense","transportation","postage","telephone",
      "electric","officeEquipment","repairEquipment","officeSupplies","linens","kitchenEquipment",
      "furnitureFixtures","vehicleMaintenance","gasoline","trainings","camping","conferences",
      "representation","thinkingDay","advertising","miscellaneous","souvenirBook",
      "sssPayable","pagibigPayable","philhealthPayable","totalDebit","totalCredit",
    ];
    const out: Record<string, number> = {};
    keys.forEach(k => { out[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0); });
    return out;
  }, [rows]);

  const fmt = (n: number) => n === 0 ? "" : n.toLocaleString("en-PH", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cash Disbursement Journal</h1>
        <p className="text-sm text-muted-foreground mt-1">Monthly cash disbursement columnar book — export to Excel</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Period</CardTitle></CardHeader>
        <CardContent className="flex gap-4 flex-wrap items-end">
          <div>
            <Label className="text-xs mb-1 block">Month</Label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Year</Label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => exportXLSX(rows, year, month, settings)} disabled={isLoading || rows.length === 0} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export XLSX
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No disbursement entries for {MONTHS[month - 1]} {year}.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-3">{rows.length} entries — scroll horizontally or Export XLSX for the full columnar format</div>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse min-w-max">
                <thead>
                  <tr className="bg-muted">
                    {["Date","CV #","Explanation","Total Debit","Salaries","COLA","Rep CE","Office Eq.","Furniture","Gasoline","Trainings","Conferences","Telephone","Electric","Office Sup.","Misc","SSS Pay.","PH Pay.","PI Pay.","Bank (Cr)"].map(h => (
                      <th key={h} className="border border-border px-2 py-1.5 whitespace-nowrap font-medium text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/30"}>
                      <td className="border border-border px-2 py-1 whitespace-nowrap">{r.date}</td>
                      <td className="border border-border px-2 py-1 whitespace-nowrap font-mono">{r.cvNo}</td>
                      <td className="border border-border px-2 py-1 max-w-[200px] truncate" title={r.explanation}>{r.explanation}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.totalDebit)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.salaries)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.cola)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.representationCE)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.officeEquipment)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.furnitureFixtures)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.gasoline)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.trainings)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.conferences)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.telephone)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.electric)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.officeSupplies)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.miscellaneous)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.sssPayable)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.philhealthPayable)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.pagibigPayable)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.bankDBP1 + r.bankMB + r.bankDBP2 + r.bankPNB)}</td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="bg-muted font-semibold">
                    <td colSpan={3} className="border border-border px-2 py-1.5">TOTAL</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.totalDebit)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.salaries)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.cola)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.representationCE)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.officeEquipment)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.furnitureFixtures)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.gasoline)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.trainings)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.conferences)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.telephone)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.electric)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.officeSupplies)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.miscellaneous)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.sssPayable)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.philhealthPayable)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.pagibigPayable)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.bankDBP1 + colTotals.bankMB + colTotals.bankDBP2 + colTotals.bankPNB)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              💡 Export to XLSX for the full 44-column format matching the February-Reports template. Bank columns auto-assign to DBP1 — adjust in Excel as needed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
