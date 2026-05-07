import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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
interface SaleItem { category_name: string; line_total: number }
interface RSale {
  id: string; receipt_number: string; created_at: string;
  total_amount: number; payment_method: string; status: string;
  cashier_name: string; items: SaleItem[];
}
interface RRental {
  id: string; start_date: string; amount: number; status: string;
  space_name: string; receipt_number: string | null; created_at: string | null;
}
interface RVoucher {
  id: string; voucher_number: string; amount: number;
  description: string; status: string; created_at: string;
  created_by_name: string;
}

interface ReceiptRow {
  date: string; payor: string; particulars: string;
  siNo: string; purpose: string; dateDeposited: string; cashOnHand: number;
  // Bank Dr
  bankMB: number; bankDBP1: number; bankDBP2: number; bankPNB: number;
  // Income Cr
  councilSupport: number; barangayCommittee: number; troopFees: number;
  careerWoman: number; honoraryMember: number; thinkingDayFund: number;
  campingFees: number; nesSales: number; souvenirSales: number;
  hallRental: number; spaceRental: number; roomRental: number;
  interestIncome: number; proceeds: number; otherIncome: number;
  totalDebit: number; totalCredit: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

// ─── Classify sale items ──────────────────────────────────────────────────────
function classifySale(sale: RSale): Partial<ReceiptRow> {
  const total = Number(sale.total_amount);
  const cats  = sale.items?.map(i => (i.category_name ?? "").toLowerCase()) ?? [];
  // If we have rental items, classify as rental; otherwise as NES
  const hasRental = cats.some(c => c.includes("rent") || c.includes("hall") || c.includes("room") || c.includes("space"));
  if (hasRental) return { hallRental: total };
  return { nesSales: total };
}

function zeroRow(): ReceiptRow {
  return {
    date:"", payor:"", particulars:"", siNo:"", purpose:"", dateDeposited:"", cashOnHand:0,
    bankMB:0, bankDBP1:0, bankDBP2:0, bankPNB:0,
    councilSupport:0, barangayCommittee:0, troopFees:0, careerWoman:0,
    honoraryMember:0, thinkingDayFund:0, campingFees:0,
    nesSales:0, souvenirSales:0, hallRental:0, spaceRental:0, roomRental:0,
    interestIncome:0, proceeds:0, otherIncome:0,
    totalDebit:0, totalCredit:0,
  };
}

// ─── XLSX Export ─────────────────────────────────────────────────────────────
async function exportXLSX(rows: ReceiptRow[], year: number, month: number, settings: ReturnType<typeof readBusinessSettings>) {
  const HEADERS = [
    "DATE","PAYOR","PARTICULARS","SI #","PURPOSE","DATE DEPOSITED","CASH ON HAND",
    `${settings.bankAccount3} (DR)`,
    `${settings.bankAccount1} (DR)`,
    `${settings.bankAccount4} (DR)`,
    `${settings.bankAccount5} (DR)`,
    "COUNCIL SUPPORT FUND (CR)","BARANGAY COMMITTEE (CR)","TROOP FEES (CR)",
    "CAREER WOMAN (CR)","HONORARY MEMBER (CR)","THINKING DAY FUND (CR)",
    "CAMPING FEES (CR)","NES SALES (CR)","SOUVENIR SALES (CR)",
    "HALL RENTAL (CR)","SPACE RENTAL (CR)","ROOM RENTAL (CR)",
    "INTEREST INCOME (CR)","PROCEEDS (CR)","OTHER INCOME (CR)",
    "TOTAL DEBIT","TOTAL CREDIT",
  ];

  const dataRows = rows.map(r => [
    r.date, r.payor, r.particulars, r.siNo, r.purpose, r.dateDeposited, r.cashOnHand||"",
    r.bankMB||"", r.bankDBP1||"", r.bankDBP2||"", r.bankPNB||"",
    r.councilSupport||"", r.barangayCommittee||"", r.troopFees||"",
    r.careerWoman||"", r.honoraryMember||"", r.thinkingDayFund||"",
    r.campingFees||"", r.nesSales||"", r.souvenirSales||"",
    r.hallRental||"", r.spaceRental||"", r.roomRental||"",
    r.interestIncome||"", r.proceeds||"", r.otherIncome||"",
    r.totalDebit||"", r.totalCredit||"",
  ]);

  const totalsRow = ["","","TOTAL","","","","",
    ...HEADERS.slice(7).map((_, i) => rows.reduce((s, r) => s + Number(Object.values(r)[i + 7] || 0), 0) || ""),
  ];

  const aoa = [
    [settings.orgName.toUpperCase()],
    [settings.councilName.toUpperCase()],
    ["CASH RECEIPTS"],
    [`FOR THE MONTH OF ${MONTHS[month - 1].toUpperCase()}, ${year}`],
    [],
    HEADERS,
    ...dataRows,
    totalsRow,
  ];

  const colWidths = HEADERS.map((_, i) => i < 7 ? (i === 2 ? 40 : 16) : 14);
  await downloadXlsx(
    [{ name: "Cash Receipts", data: aoa, colWidths }],
    `cash-receipts-${year}-${String(month).padStart(2, "0")}.xlsx`,
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CashReceiptsJournalPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const settings = readBusinessSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["receipts-journal", year, month],
    queryFn: () => api.get<{ sales: RSale[]; rentals: RRental[]; receiptVouchers: RVoucher[] }>(
      `/reports/receipts-journal?year=${year}&month=${month}`
    ),
  });

  const rows: ReceiptRow[] = useMemo(() => {
    const result: ReceiptRow[] = [];

    // Sales
    (data?.sales ?? []).forEach(s => {
      const base = zeroRow();
      base.date        = format(new Date(s.created_at), "MM/dd/yyyy");
      base.payor       = s.cashier_name ?? "Various Person";
      base.particulars = `NES Sales`;
      base.siNo        = s.receipt_number;
      base.purpose     = "NES";
      base.cashOnHand  = Number(s.total_amount);
      const income = classifySale(s);
      Object.assign(base, income);
      base.bankDBP1    = Number(s.total_amount);
      base.totalDebit  = Number(s.total_amount);
      base.totalCredit = Number(s.total_amount);
      result.push(base);
    });

    // Rentals
    (data?.rentals ?? []).forEach(r => {
      const base = zeroRow();
      base.date        = format(new Date(r.start_date), "MM/dd/yyyy");
      base.payor       = "Tenant";
      const spaceLow = (r.space_name ?? "").toLowerCase();
      if (spaceLow.includes("hall"))  { base.particulars = "Income from Hall Rental";  base.hallRental  = Number(r.amount); }
      else if (spaceLow.includes("room")) { base.particulars = "Income from Room Rental"; base.roomRental  = Number(r.amount); }
      else                                 { base.particulars = `Space Rental - ${r.space_name}`; base.spaceRental = Number(r.amount); }
      base.siNo        = r.receipt_number ?? "";
      base.purpose     = "Rentals";
      base.cashOnHand  = Number(r.amount);
      base.bankMB      = Number(r.amount);
      base.totalDebit  = Number(r.amount);
      base.totalCredit = Number(r.amount);
      result.push(base);
    });

    // Receipt vouchers (membership fees, misc income)
    (data?.receiptVouchers ?? []).forEach(v => {
      const base = zeroRow();
      base.date        = format(new Date(v.created_at), "MM/dd/yyyy");
      base.payor       = v.created_by_name;
      base.particulars = v.description;
      base.siNo        = v.voucher_number;
      base.purpose     = "Receipt";
      base.cashOnHand  = Number(v.amount);
      const desc = v.description.toLowerCase();
      if (desc.includes("thinking day"))         base.thinkingDayFund  = Number(v.amount);
      else if (desc.includes("camp"))            base.campingFees      = Number(v.amount);
      else if (desc.includes("council support")) base.councilSupport   = Number(v.amount);
      else if (desc.includes("troop"))           base.troopFees        = Number(v.amount);
      else if (desc.includes("interest"))        base.interestIncome   = Number(v.amount);
      else if (desc.includes("proceeds"))        base.proceeds         = Number(v.amount);
      else                                       base.otherIncome      = Number(v.amount);
      base.bankDBP1    = Number(v.amount);
      base.totalDebit  = Number(v.amount);
      base.totalCredit = Number(v.amount);
      result.push(base);
    });

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [data]);

  const colTotals = useMemo(() => {
    const keys: (keyof ReceiptRow)[] = [
      "cashOnHand","bankMB","bankDBP1","bankDBP2","bankPNB",
      "councilSupport","barangayCommittee","troopFees","careerWoman","honoraryMember",
      "thinkingDayFund","campingFees","nesSales","souvenirSales",
      "hallRental","spaceRental","roomRental","interestIncome","proceeds","otherIncome",
      "totalDebit","totalCredit",
    ];
    const out: Record<string, number> = {};
    keys.forEach(k => { out[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0); });
    return out;
  }, [rows]);

  const fmt = (n: number) => n === 0 ? "" : n.toLocaleString("en-PH", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cash Receipts Journal</h1>
        <p className="text-sm text-muted-foreground mt-1">Monthly cash receipts columnar book — export to Excel</p>
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
        <Card><CardContent className="py-12 text-center text-muted-foreground">No receipts for {MONTHS[month - 1]} {year}.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-3">{rows.length} entries — Export XLSX for the full 28-column format</div>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse min-w-max">
                <thead>
                  <tr className="bg-muted">
                    {["Date","SI #","Particulars","Purpose","Cash on Hand","NES Sales","Hall Rental","Space Rental","Room Rental","Thinking Day","Camping Fees","Council Support","Other Income","Total Cr.","Bank (Dr)"].map(h => (
                      <th key={h} className="border border-border px-2 py-1.5 whitespace-nowrap font-medium text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/30"}>
                      <td className="border border-border px-2 py-1 whitespace-nowrap">{r.date}</td>
                      <td className="border border-border px-2 py-1 whitespace-nowrap font-mono">{r.siNo}</td>
                      <td className="border border-border px-2 py-1 max-w-[200px] truncate" title={r.particulars}>{r.particulars}</td>
                      <td className="border border-border px-2 py-1">{r.purpose}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.cashOnHand)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.nesSales)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.hallRental)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.spaceRental)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.roomRental)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.thinkingDayFund)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.campingFees)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.councilSupport)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.otherIncome)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.totalCredit)}</td>
                      <td className="border border-border px-2 py-1 text-right tabular-nums">{fmt(r.bankMB + r.bankDBP1 + r.bankDBP2 + r.bankPNB)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted font-semibold">
                    <td colSpan={4} className="border border-border px-2 py-1.5">TOTAL</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.cashOnHand)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.nesSales)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.hallRental)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.spaceRental)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.roomRental)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.thinkingDayFund)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.campingFees)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.councilSupport)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.otherIncome)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.totalCredit)}</td>
                    <td className="border border-border px-2 py-1.5 text-right tabular-nums">{fmt(colTotals.bankMB + colTotals.bankDBP1 + colTotals.bankDBP2 + colTotals.bankPNB)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              💡 Export to XLSX for the full format. Income categories are auto-classified from descriptions — verify and adjust in Excel as needed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
