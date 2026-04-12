import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "@/lib/api";
import { readBusinessSettings } from "@/utils/businessSettings";
import { formatCurrency } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────
interface JELine {
  id: string;
  line_number: number;
  account_code: string;
  account_name: string;
  description: string | null;
  debit: number;
  credit: number;
}

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  source_key: string | null;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  status: string;
  posted_at: string | null;
  lines: JELine[];
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

const PRINT_STYLE = `
@media print {
  body > *:not(#jv-print-root) { display: none !important; }
  #jv-print-root { display: block !important; }
  @page { size: Letter portrait; margin: 15mm 18mm; }
}
`;

// ─── JV Print Component ───────────────────────────────────────────────────────
function JVPrint({
  entry, dvNo, preparedBy, settings,
}: {
  entry: JournalEntry;
  dvNo: string;
  preparedBy: string;
  settings: ReturnType<typeof readBusinessSettings>;
}) {
  const totalDebit  = entry.lines.reduce((s, l) => s + Number(l.debit),  0);
  const totalCredit = entry.lines.reduce((s, l) => s + Number(l.credit), 0);

  // Derive cash advance summary from lines
  const cashLine    = entry.lines.find(l => l.account_name?.toLowerCase().includes("cash") && Number(l.debit) > 0 && !l.account_name?.toLowerCase().includes("advance"));
  const advanceLine = entry.lines.find(l => l.account_name?.toLowerCase().includes("advance") && Number(l.credit) > 0);
  const cashAdvanceAmt = advanceLine ? Number(advanceLine.credit) : totalCredit;
  const cashRefunded   = cashLine    ? Number(cashLine.debit)     : 0;
  const totalSpent     = totalDebit - cashRefunded;
  const toReimburse    = Math.max(0, totalSpent - cashAdvanceAmt);

  const fmt = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2 });

  return (
    <div id="jv-print-root" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", lineHeight: "1.4", color: "#000" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        <div style={{ fontWeight: "bold", fontSize: "12px" }}>{settings.orgName.toUpperCase()}</div>
        <div>{settings.councilName}</div>
        <div>Vigan City</div>
      </div>

      {/* JV Number */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ fontWeight: "bold", fontSize: "12px" }}>JOURNAL VOUCHER</div>
        <div>JV No.&nbsp;<strong>{entry.entry_number}</strong></div>
      </div>

      {/* DV No + Date */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <div>DV No.&nbsp;<span style={{ borderBottom: "1px solid #000", minWidth: "160px", display: "inline-block" }}>{dvNo}</span></div>
        <div>Date:&nbsp;<strong>{format(new Date(entry.entry_date), "MMMM d, yyyy")}</strong></div>
      </div>

      {/* Particulars */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #000", padding: "3px 8px", textAlign: "left", width: "75%" }}>PARTICULARS</th>
            <th style={{ border: "1px solid #000", padding: "3px 8px", textAlign: "center" }}>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #000", padding: "6px 8px", verticalAlign: "top", minHeight: "60px" }}>
              {entry.description}
            </td>
            <td style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "right" }}>
              {fmt(cashAdvanceAmt)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Journal Entry Lines */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px", fontSize: "10.5px" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #000", padding: "3px 8px", textAlign: "left", width: "60%" }}>Account</th>
            <th style={{ border: "1px solid #000", padding: "3px 8px", textAlign: "right", width: "20%" }}>Debit</th>
            <th style={{ border: "1px solid #000", padding: "3px 8px", textAlign: "right", width: "20%" }}>Credit</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((l) => (
            <tr key={l.id}>
              <td style={{ border: "1px solid #000", padding: "3px 8px", paddingLeft: Number(l.credit) > 0 ? "24px" : "8px" }}>
                {l.account_name}{l.description ? ` (${l.description})` : ""}
              </td>
              <td style={{ border: "1px solid #000", padding: "3px 8px", textAlign: "right" }}>
                {Number(l.debit) > 0 ? fmt(Number(l.debit)) : ""}
              </td>
              <td style={{ border: "1px solid #000", padding: "3px 8px", textAlign: "right" }}>
                {Number(l.credit) > 0 ? fmt(Number(l.credit)) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <table style={{ width: "60%", borderCollapse: "collapse", marginBottom: "20px", fontSize: "10.5px", marginLeft: "auto" }}>
        <tbody>
          {[
            ["TOTAL AMOUNT SPENT",        fmt(totalSpent)],
            ["AMOUNT OF CASH ADVANCE",    fmt(cashAdvanceAmt)],
            ["AMOUNT REFUNDED",           fmt(cashRefunded)],
            ["AMOUNT TO BE REIMBURSED",   toReimburse > 0 ? fmt(toReimburse) : "—"],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "2px 8px", fontWeight: "bold", fontSize: "10px" }}>{label}</td>
              <td style={{ padding: "2px 8px", textAlign: "right" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signature block – top row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "28px" }}>
        {[
          { label: "PREPARED BY:", name: preparedBy || "ANA MARIE THERESE R. DEL CASTILLO", pos: "Accounting Clerk" },
          { label: "CERTIFIED CORRECT:", name: "RONAMY ROSARIO-ABLOG", pos: "Council Executive" },
          { label: "VERIFIED CORRECT:", name: "ROSITA P. RIALUBIN", pos: "Council Auditor" },
        ].map(({ label, name, pos }) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontWeight: "bold", fontSize: "10px" }}>{label}</div>
            <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>{name}</div>
            <div style={{ fontSize: "10px" }}>{pos}</div>
          </div>
        ))}
      </div>

      {/* Signature block – bottom row */}
      <div style={{ display: "flex", gap: "12px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold", fontSize: "10px" }}>RECOMMENDING APPROVAL:</div>
          <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>MARIANNE R. FLORENDO</div>
          <div style={{ fontSize: "10px" }}>Council Treasurer</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold", fontSize: "10px" }}>APPROVED BY:</div>
          <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>EVA MARIE S. MEDINA</div>
          <div style={{ fontSize: "10px" }}>Council President</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function JournalVoucherPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dvNo, setDvNo]       = useState("");
  const [preparedBy, setPreparedBy] = useState("");

  const settings = readBusinessSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["journal-entries-all"],
    queryFn: () => api.get<{ entries: JournalEntry[] }>("/accounting/journal-entries?limit=500"),
  });

  const filtered = useMemo(() => {
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month,   0, 23, 59, 59);
    return (data?.entries ?? []).filter(e => {
      const d = new Date(e.entry_date);
      return d >= from && d <= to;
    });
  }, [data, year, month]);

  function openPrint(e: JournalEntry) {
    setSelected(e);
    setDvNo(e.reference_id ?? "");
    setPreparedBy("");
    setDialogOpen(true);
  }

  function handlePrint() {
    const styleEl = document.createElement("style");
    styleEl.innerHTML = PRINT_STYLE;
    document.head.appendChild(styleEl);
    window.print();
    setTimeout(() => document.head.removeChild(styleEl), 1000);
  }

  const totalDebit  = (e: JournalEntry) => e.lines.reduce((s, l) => s + Number(l.debit),  0);
  const totalCredit = (e: JournalEntry) => e.lines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal Voucher</h1>
        <p className="text-sm text-muted-foreground mt-1">Print GSP-format Journal Vouchers (JV) for cash advance liquidations</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle className="text-base">Filter</CardTitle></CardHeader>
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

      {/* Journal Entries List */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No journal entries for {MONTHS[month - 1]} {year}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>JV #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-sm">{e.entry_number}</TableCell>
                    <TableCell className="text-sm">{format(new Date(e.entry_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{e.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{e.reference_type ?? "manual"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalDebit(e))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalCredit(e))}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openPrint(e)}>
                        <Printer className="h-3.5 w-3.5 mr-1" /> Print JV
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Print Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Print Journal Voucher</DialogTitle></DialogHeader>

          {selected && (
            <div className="space-y-4">
              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/40 rounded-lg border">
                <div>
                  <Label className="text-xs">DV No. (Disbursement Voucher Reference)</Label>
                  <Input value={dvNo} onChange={e => setDvNo(e.target.value)} placeholder="e.g. 2026-02-203661" className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Prepared By</Label>
                  <Input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="ANA MARIE THERESE R. DEL CASTILLO" className="h-8 mt-1" />
                </div>
              </div>

              {/* JV Preview */}
              <div className="border rounded-lg p-6 bg-white shadow-sm">
                <JVPrint entry={selected} dvNo={dvNo} preparedBy={preparedBy} settings={settings} />
              </div>

              <div className="flex justify-end">
                <Button onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" /> Print
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
