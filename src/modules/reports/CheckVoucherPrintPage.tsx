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
interface Voucher {
  id: string;
  voucher_number: string;
  voucher_type: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  created_by_name: string;
  approved_by_name: string | null;
  account_name: string | null;
  account_code: string | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function numberToWords(n: number): string {
  if (n === 0) return "ZERO";
  const ones = ["","ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE",
    "TEN","ELEVEN","TWELVE","THIRTEEN","FOURTEEN","FIFTEEN","SIXTEEN","SEVENTEEN","EIGHTEEN","NINETEEN"];
  const tens = ["","","TWENTY","THIRTY","FORTY","FIFTY","SIXTY","SEVENTY","EIGHTY","NINETY"];
  const chunk = (num: number): string => {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    return ones[Math.floor(num / 100)] + " HUNDRED" + (num % 100 ? " " + chunk(num % 100) : "");
  };
  const int = Math.floor(n);
  const cents = Math.round((n - int) * 100);
  let result = "";
  if (int >= 1_000_000) result += chunk(Math.floor(int / 1_000_000)) + " MILLION ";
  if (int >= 1_000)     result += chunk(Math.floor((int % 1_000_000) / 1_000)) + " THOUSAND ";
  result += chunk(int % 1_000);
  return result.trim() + (cents > 0 ? "" : "");
}

function amountInWords(amount: number): string {
  const int  = Math.floor(amount);
  const cents = Math.round((amount - int) * 100);
  return numberToWords(int) + " PESOS & " + String(cents).padStart(2, "0") + "/100 ONLY";
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

// ─── Print styles injected into <head> ───────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body > *:not(#cv-print-root) { display: none !important; }
  #cv-print-root { display: block !important; }
  @page { size: Letter portrait; margin: 15mm 18mm; }
}
`;

// ─── CV Print Component ───────────────────────────────────────────────────────
function CVPrint({
  voucher, payTo, checkNo, checkDate, bankAccount, settings,
}: {
  voucher: Voucher;
  payTo: string;
  checkNo: string;
  checkDate: string;
  bankAccount: string;
  settings: ReturnType<typeof readBusinessSettings>;
}) {
  const amount = Number(voucher.amount);
  const vDate  = checkDate || format(new Date(voucher.created_at), "MMMM d, yyyy");

  return (
    <div id="cv-print-root" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", lineHeight: "1.4", color: "#000", padding: "0" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontWeight: "bold", fontSize: "12px" }}>{settings.orgName.toUpperCase()}</div>
        <div>{settings.councilName}</div>
        <div>Vigan City</div>
      </div>

      {/* CV Number */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "6px" }}>
        <span>No.&nbsp;<span style={{ borderBottom: "1px solid #000", minWidth: "80px", display: "inline-block", paddingLeft: "4px" }}>{voucher.voucher_number}</span></span>
      </div>

      {/* Pay To + Date */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "6px" }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: "bold" }}>PAY TO:&nbsp;</span>
          <span style={{ borderBottom: "1px solid #000", minWidth: "200px", display: "inline-block" }}>{payTo}</span>
        </div>
        <div>
          <span style={{ fontWeight: "bold" }}>DATE:&nbsp;</span>
          <span style={{ borderBottom: "1px solid #000", minWidth: "120px", display: "inline-block" }}>{vDate}</span>
        </div>
      </div>

      {/* Description label */}
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>DESCRIPTIONS / EXPLANATION</div>
      <div style={{ borderBottom: "1px solid #000", minHeight: "40px", marginBottom: "8px", whiteSpace: "pre-wrap" }}>
        {voucher.description}
      </div>

      {/* Account Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "10.5px" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #000", padding: "3px 6px", width: "16%", textAlign: "center" }}>Account No.</th>
            <th style={{ border: "1px solid #000", padding: "3px 6px", textAlign: "left" }}></th>
            <th style={{ border: "1px solid #000", padding: "3px 6px", width: "14%", textAlign: "center" }}>Dr.</th>
            <th style={{ border: "1px solid #000", padding: "3px 6px", width: "14%", textAlign: "center" }}>Cr.</th>
          </tr>
        </thead>
        <tbody>
          {/* Debit row – expense */}
          <tr>
            <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{voucher.account_code ?? ""}</td>
            <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{voucher.account_name ?? voucher.description}</td>
            <td style={{ border: "1px solid #000", padding: "3px 6px", textAlign: "right" }}>{amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
            <td style={{ border: "1px solid #000", padding: "3px 6px" }}></td>
          </tr>
          {/* Credit row – bank */}
          <tr>
            <td style={{ border: "1px solid #000", padding: "3px 6px" }}></td>
            <td style={{ border: "1px solid #000", padding: "3px 6px", paddingLeft: "24px" }}>{bankAccount || settings.bankAccount1}</td>
            <td style={{ border: "1px solid #000", padding: "3px 6px" }}></td>
            <td style={{ border: "1px solid #000", padding: "3px 6px", textAlign: "right" }}>{amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>

      {/* Signature block – top row */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
        {[
          { label: "PREPARED BY:", name: voucher.created_by_name, pos: "Accounting Clerk" },
          { label: "CERTIFIED CORRECT:", name: "RONAMY ROSARIO-ABLOG", pos: "Council Executive" },
          { label: "VERIFIED CORRECT:", name: "ROSITA P. RIALUBIN, MD", pos: "Council Auditor" },
        ].map(({ label, name, pos }) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontWeight: "bold", fontSize: "10px" }}>{label}</div>
            <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>{name}</div>
            <div style={{ fontSize: "10px" }}>{pos}</div>
          </div>
        ))}
      </div>

      {/* Signature block – bottom row */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold", fontSize: "10px" }}>APPROVED BY:</div>
          <div style={{ marginTop: "20px", borderBottom: "1px solid #000" }}>MARIANNE R. FLORENDO</div>
          <div style={{ fontSize: "10px" }}>Council Treasurer</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ flex: 1 }}>
          <div style={{ borderBottom: "1px solid #000", marginTop: "20px" }}>EVA MARIE S. MEDINA</div>
          <div style={{ fontSize: "10px" }}>Council President</div>
        </div>
      </div>

      {/* Receipt block */}
      <div style={{ borderTop: "1px solid #000", paddingTop: "8px", fontSize: "10.5px" }}>
        <p style={{ margin: "0 0 4px" }}>
          Received from the {settings.orgName.toUpperCase()} the amount of{" "}
          <strong>{amountInWords(amount)}</strong>{" "}
          (₱{amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}) per Check No.
          <span style={{ borderBottom: "1px solid #000", minWidth: "120px", display: "inline-block", marginLeft: "4px" }}>{checkNo}</span>
        </p>
        <p style={{ margin: "0 0 32px" }}>dated {vDate} in payment of this voucher.</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ textAlign: "center", width: "200px" }}>
            <div style={{ borderTop: "1px solid #000" }}>Payee/Authorized Representative</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CheckVoucherPrintPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState<Voucher | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payTo, setPayTo]         = useState("");
  const [checkNo, setCheckNo]     = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  const settings = readBusinessSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["vouchers-all"],
    queryFn: () => api.get<{ vouchers: Voucher[] }>("/vouchers?type=payment"),
  });

  const filtered = useMemo(() => {
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month,   0, 23, 59, 59);
    return (data?.vouchers ?? []).filter(v => {
      const d = new Date(v.created_at);
      return d >= from && d <= to && v.voucher_type === "payment";
    });
  }, [data, year, month]);

  function openPrint(v: Voucher) {
    setSelected(v);
    setPayTo("");
    setCheckNo("");
    setCheckDate(format(new Date(v.created_at), "MMMM d, yyyy"));
    setBankAccount(settings.bankAccount1);
    setDialogOpen(true);
  }

  function handlePrint() {
    const styleEl = document.createElement("style");
    styleEl.innerHTML = PRINT_STYLE;
    document.head.appendChild(styleEl);
    window.print();
    setTimeout(() => document.head.removeChild(styleEl), 1000);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check Voucher Print</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate GSP-format check vouchers for printing</p>
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

      {/* Voucher List */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No payment vouchers found for {MONTHS[month - 1]} {year}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-sm">{v.voucher_number}</TableCell>
                    <TableCell className="text-sm">{format(new Date(v.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{v.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(v.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={v.status === "posted" ? "default" : "secondary"} className="text-xs">{v.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openPrint(v)}>
                        <Printer className="h-3.5 w-3.5 mr-1" /> Print CV
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
          <DialogHeader>
            <DialogTitle>Print Check Voucher</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {/* Editable fields before printing */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/40 rounded-lg border">
                <div>
                  <Label className="text-xs">Pay To</Label>
                  <Input value={payTo} onChange={e => setPayTo(e.target.value)} placeholder="e.g. RONAMY ROSARIO-ABLOG" className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Check No.</Label>
                  <Input value={checkNo} onChange={e => setCheckNo(e.target.value)} placeholder="e.g. 0093861783" className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Check Date</Label>
                  <Input value={checkDate} onChange={e => setCheckDate(e.target.value)} placeholder="e.g. January 26, 2026" className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Bank Account (Credit)</Label>
                  <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder={settings.bankAccount1} className="h-8 mt-1" />
                </div>
              </div>

              {/* CV Preview */}
              <div className="border rounded-lg p-6 bg-white shadow-sm">
                <CVPrint
                  voucher={selected}
                  payTo={payTo}
                  checkNo={checkNo}
                  checkDate={checkDate}
                  bankAccount={bankAccount}
                  settings={settings}
                />
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
