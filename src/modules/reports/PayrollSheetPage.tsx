import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import api from "@/lib/api";
import { readBusinessSettings } from "@/utils/businessSettings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PayrollEntry {
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
  tax_deducted: number;
  deductions: number;
  net_salary: number;
  status: string;
  employee_name: string;
  position: string;
}

interface Period {
  key: string;
  label: string;
  entries: PayrollEntry[];
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

const PRINT_STYLE = `
@media print {
  body > *:not(#payroll-print-root) { display: none !important; }
  #payroll-print-root { display: block !important; }
  @page { size: Legal landscape; margin: 10mm 12mm; }
}
`;

// ─── Payroll Table Print Component ───────────────────────────────────────────
function PayrollPrint({ period, settings }: { period: Period; settings: ReturnType<typeof readBusinessSettings> }) {
  const entries = period.entries;

  const totals = useMemo(() => ({
    monthlySalary:   entries.reduce((s, e) => s + Number(e.basic_salary) * 2, 0),
    semiSalary:      entries.reduce((s, e) => s + Number(e.basic_salary), 0),
    monthlyCola:     entries.reduce((s, e) => s + Number(e.cola) * 2, 0),
    semiCola:        entries.reduce((s, e) => s + Number(e.cola), 0),
    representation:  entries.reduce((s, e) => s + Number(e.overtime_pay), 0),
    totalEarned:     entries.reduce((s, e) => s + Number(e.basic_salary) + Number(e.cola) + Number(e.overtime_pay), 0),
    sss:             entries.reduce((s, e) => s + Number(e.sss), 0),
    pagibig:         entries.reduce((s, e) => s + Number(e.pagibig), 0),
    philhealth:      entries.reduce((s, e) => s + Number(e.philhealth), 0),
    netAmount:       entries.reduce((s, e) => s + Number(e.net_salary), 0),
  }), [entries]);

  const fmt = (n: number) => n === 0 ? "" : n.toLocaleString("en-PH", { minimumFractionDigits: 2 });

  return (
    <div id="payroll-print-root" style={{ fontFamily: "Arial, sans-serif", fontSize: "9px", color: "#000" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontWeight: "bold", fontSize: "11px" }}>{settings.orgName.toUpperCase()}</div>
        <div style={{ fontWeight: "bold" }}>{settings.councilName.toUpperCase()}</div>
        <div style={{ fontWeight: "bold", fontSize: "11px", marginTop: "4px" }}>PAYROLL</div>
        <div>For the Period of {period.label.toUpperCase()}</div>
      </div>

      {/* Acknowledgment text */}
      <div style={{ fontSize: "8.5px", marginBottom: "6px" }}>
        <div>We acknowledge to have received from the Girl Scouts of the Philippines, {settings.councilName.toUpperCase()} the sum</div>
        <div>herein specified opposite our respective names, in full compensation for our services for the period stated.</div>
      </div>

      {/* Main Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8px" }}>
        <thead>
          <tr>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>NAME</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>DESIGNATION</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>STATUS</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>MONTHLY<br/>SALARY</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>SEMI-<br/>MONTHLY<br/>SALARY</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>MONTHLY<br/>COLA</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>SEMI-<br/>MONTHLY<br/>COLA</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>REPRE-<br/>SENTATION</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>TOTAL<br/>EARNED<br/>FOR THE<br/>PERIOD</th>
            <th colSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>DEDUCTIONS</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>NET<br/>AMOUNT<br/>RECEIVED</th>
            <th rowSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>SIGNATURE</th>
          </tr>
          <tr>
            <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>SSS PREMIUM/<br/>MEDICARE/EC<br/>& MATERNITY</th>
            <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>PAG-IBIG</th>
            <th style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>PHIL-<br/>HEALTH</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => {
            const monthlySal = Number(e.basic_salary) * 2;
            const semiSal    = Number(e.basic_salary);
            const monthlyCola= Number(e.cola) * 2;
            const semiCola   = Number(e.cola);
            const rep        = Number(e.overtime_pay);
            const totalEarned= semiSal + semiCola + rep;
            return (
              <tr key={e.id}>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{e.employee_name}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{e.position}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center" }}>Permanent</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(monthlySal)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(semiSal)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(monthlyCola)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(semiCola)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(rep)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(totalEarned)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(Number(e.sss))}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(Number(e.pagibig))}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(Number(e.philhealth))}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right" }}>{fmt(Number(e.net_salary))}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
              </tr>
            );
          })}
          {/* Nothing follows row */}
          <tr>
            <td colSpan={14} style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "center", fontStyle: "italic", fontSize: "8px" }}>
              **************** NOTHING FOLLOWS ************
            </td>
          </tr>
          {/* Spacer rows */}
          {Array.from({ length: 4 }).map((_, i) => (
            <tr key={`spacer-${i}`}>
              {Array.from({ length: 14 }).map((_, j) => (
                <td key={j} style={{ border: "1px solid #000", padding: "6px 4px" }}></td>
              ))}
            </tr>
          ))}
          {/* Totals row */}
          <tr>
            <td colSpan={3} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: "bold", textAlign: "center" }}>TOTAL</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.monthlySalary)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.semiSalary)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.monthlyCola)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.semiCola)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.representation)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.totalEarned)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.sss)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.pagibig)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.philhealth)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px", textAlign: "right", fontWeight: "bold" }}>{fmt(totals.netAmount)}</td>
            <td style={{ border: "1px solid #000", padding: "2px 4px" }}></td>
          </tr>
        </tbody>
      </table>

      {/* Signature block */}
      <div style={{ display: "flex", marginTop: "16px", gap: "8px", fontSize: "8.5px" }}>
        <div style={{ flex: 2 }}>
          <div style={{ fontWeight: "bold" }}>PREPARED BY:</div>
          <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>ANA MARIE THERESE R. DEL CASTILLO</div>
          <div>Accounting Clerk/TA for Admin</div>
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ fontWeight: "bold" }}>CERTIFIED CORRECT:</div>
          <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>RONAMY ROSARIO-ABLOG</div>
          <div>{entries.some(e => e.employee_name?.toLowerCase().includes("ronamy")) ? "OIC - Council Executive" : "Council Executive"}</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ flex: 2 }}>
          <div style={{ fontWeight: "bold" }}>APPROVED:</div>
          <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>EVA MARIE S. MEDINA</div>
          <div>Council President</div>
        </div>
        <div style={{ flex: 3, fontSize: "8px", borderLeft: "1px solid #000", paddingLeft: "8px" }}>
          <div>I hereby certify on my official capacity that I</div>
          <div>have paid each employee whose name</div>
          <div>appears on the above roll the amount set</div>
          <div>opposite their names.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function PayrollSheetPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [printPeriod, setPrintPeriod] = useState<Period | null>(null);

  const settings = readBusinessSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["payroll-sheet", year, month],
    queryFn: () => api.get<{ payroll: PayrollEntry[] }>(`/payroll?year=${year}&month=${month}`),
  });

  const periods: Period[] = useMemo(() => {
    const entries = data?.payroll ?? [];
    const map = new Map<string, PayrollEntry[]>();
    entries.forEach(e => {
      const key = `${e.period_start}__${e.period_end}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries()).map(([key, ents]) => {
      const [ps, pe] = key.split("__");
      const label = `${format(parseISO(ps), "MMMM d")} - ${format(parseISO(pe), "d, yyyy")}`;
      return { key, label, entries: ents };
    });
  }, [data]);

  function handlePrint(period: Period) {
    setPrintPeriod(period);
    setTimeout(() => {
      const styleEl = document.createElement("style");
      styleEl.innerHTML = PRINT_STYLE;
      document.head.appendChild(styleEl);
      window.print();
      setTimeout(() => document.head.removeChild(styleEl), 1000);
    }, 100);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payroll Sheet</h1>
        <p className="text-sm text-muted-foreground mt-1">Print GSP-format payroll sheets by period</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle className="text-base">Period</CardTitle></CardHeader>
        <CardContent className="flex gap-4 flex-wrap">
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
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : periods.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No payroll entries found for {MONTHS[month - 1]} {year}.</CardContent></Card>
      ) : (
        <Tabs defaultValue={periods[0]?.key}>
          <TabsList>
            {periods.map(p => <TabsTrigger key={p.key} value={p.key}>{p.label}</TabsTrigger>)}
          </TabsList>
          {periods.map(p => (
            <TabsContent key={p.key} value={p.key} className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => handlePrint(p)} className="gap-2">
                  <Printer className="h-4 w-4" /> Print Payroll Sheet
                </Button>
              </div>
              {/* Preview */}
              <div className="border rounded-lg p-6 bg-white shadow-sm overflow-x-auto">
                {printPeriod?.key === p.key
                  ? <PayrollPrint period={p} settings={settings} />
                  : null}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Hidden print target when period is selected */}
      {printPeriod && (
        <div style={{ display: "none" }}>
          <PayrollPrint period={printPeriod} settings={settings} />
        </div>
      )}
    </div>
  );
}
