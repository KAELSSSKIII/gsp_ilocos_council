import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, CheckCircle2, XCircle, FileCheck, FileSpreadsheet, Download, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";
import { readBusinessSettings } from "@/utils/businessSettings";
import { downloadXlsx } from "@/lib/xlsxExport";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type VoucherStatus = "pending" | "approved" | "posted" | "cancelled";
type VoucherType   = "payment" | "receipt" | "journal" | "payroll";

interface Voucher {
  id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  amount: number;
  description: string;
  account_id?: string | null;
  status: VoucherStatus;
  created_by: string;
  created_by_name: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  posted_at: string | null;
  created_at: string;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const STATUS_COLORS: Record<VoucherStatus, "outline" | "secondary" | "default" | "destructive"> = {
  pending:   "outline",
  approved:  "secondary",
  posted:    "default",
  cancelled: "destructive",
};

const TYPE_LABELS: Record<VoucherType, string> = {
  payment: "Payment",
  receipt: "Receipt",
  journal: "Journal",
  payroll: "Payroll",
};

interface VouchersResponse {
  data: Voucher[];
  total: number;
  page: number;
  page_size: number;
}

const PAGE_SIZE = 25;

// ─── Component ────────────────────────────────────────────────────────────────

export function VouchersPage() {
  const qc = useQueryClient();
  const [tab, setTab]               = useState<"pending" | "all">("pending");
  const [showDialog, setShowDialog] = useState(false);
  const [formType,   setFormType]   = useState<VoucherType>("payment");
  const [formAmount, setFormAmount] = useState(0);
  const [formDesc,   setFormDesc]   = useState("");
  const [formAccountId, setFormAccountId] = useState("");
  const [pendingPage, setPendingPage] = useState(0);
  const [allPage,     setAllPage]     = useState(0);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: pendingData, isLoading: loadingPending } = useQuery({
    queryKey: ["vouchers", "pending", pendingPage],
    queryFn: () =>
      api.get<VouchersResponse>(`/vouchers?status=pending&page=${pendingPage}&page_size=${PAGE_SIZE}`),
  });

  const { data: allData, isLoading: loadingAll } = useQuery({
    queryKey: ["vouchers", "all", allPage],
    queryFn: () =>
      api.get<VouchersResponse>(`/vouchers?page=${allPage}&page_size=${PAGE_SIZE}`),
    enabled: tab === "all",
  });

  const pendingVouchers = pendingData?.data ?? [];
  const pendingTotal    = pendingData?.total ?? 0;
  const pendingTotalPages = Math.ceil(pendingTotal / PAGE_SIZE);

  const allVouchers   = allData?.data ?? [];
  const allTotal      = allData?.total ?? 0;
  const allTotalPages = Math.ceil(allTotal / PAGE_SIZE);
  const { data: accountsData } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: () => api.get<AccountOption[]>("/accounts"),
  });
  const accounts = (accountsData ?? []).filter((account) => account.is_active);

  // ── mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: object) => api.post("/vouchers", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      toast.success("Voucher created");
      setShowDialog(false);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to create voucher"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/vouchers/${id}`, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      toast.success(`Voucher ${vars.status}`);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to update voucher"),
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!formDesc || formAmount <= 0) {
      toast.error("Description and amount are required");
      return;
    }
    createMutation.mutate({
      voucher_type: formType,
      amount: formAmount,
      description: formDesc,
      account_id: formAccountId || null,
    });
  };

  const openCreate = () => {
    setFormType("payment");
    setFormAmount(0);
    setFormDesc("");
    setFormAccountId("");
    setShowDialog(true);
  };

  // ── render helpers ─────────────────────────────────────────────────────────
  const renderActions = (v: Voucher) => (
    <>
      {v.status === "pending" && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => updateMutation.mutate({ id: v.id, status: "approved" })}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-destructive"
            onClick={() => updateMutation.mutate({ id: v.id, status: "cancelled" })}
          >
            <XCircle className="h-3 w-3 mr-1" /> Reject
          </Button>
        </>
      )}
      {v.status === "approved" && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs text-emerald-600"
          onClick={() => updateMutation.mutate({ id: v.id, status: "posted" })}
        >
          <FileCheck className="h-3 w-3 mr-1" /> Post
        </Button>
      )}
    </>
  );

  const renderTable = (
    rows: Voucher[],
    loading: boolean,
    total: number,
    page: number,
    totalPages: number,
    setPage: (fn: (p: number) => number) => void,
  ) => (
    <>
      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No vouchers found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="w-[220px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono text-xs">{v.voucher_number}</TableCell>
                <TableCell>{TYPE_LABELS[v.voucher_type] ?? v.voucher_type}</TableCell>
                <TableCell className="max-w-[220px] truncate">{v.description}</TableCell>
                <TableCell className="text-right">{formatCurrency(v.amount)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[v.status] ?? "outline"}>{v.status}</Badge>
                </TableCell>
                <TableCell>{v.created_by_name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {renderActions(v)}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-slate-500"
                      onClick={() => exportSingleVoucher(v)}
                      title="Export voucher slip"
                    >
                      <Download className="h-3 w-3 mr-1" /> Slip
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-slate-500"
                      onClick={() => exportSingleVoucherExcel(v)}
                      title="Export voucher as Excel"
                    >
                      <FileSpreadsheet className="h-3 w-3 mr-1" /> XLS
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-xs text-muted-foreground">
            {total} total · page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );

  // ── single voucher slip PDF ────────────────────────────────────────────────
  const exportSingleVoucher = async (v: Voucher) => {
    const biz = readBusinessSettings();
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pw = doc.internal.pageSize.getWidth();

    // Header band
    doc.setFillColor(16, 87, 60);
    doc.rect(0, 0, pw, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(biz.orgName, pw / 2, 9, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(biz.councilName, pw / 2, 15, { align: "center" });

    // Title
    doc.setTextColor(33, 33, 33);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("VOUCHER", pw / 2, 31, { align: "center" });

    // Gold underline
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.8);
    doc.line(20, 33, pw - 20, 33);

    // Fields
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);

    const field = (label: string, value: string, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80);
      doc.text(label, 14, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(33, 33, 33);
      doc.text(value, 60, y);
      doc.line(14, y + 1.5, pw - 14, y + 1.5);
    };

    field("Voucher No.",  v.voucher_number,                           42);
    field("Type",         TYPE_LABELS[v.voucher_type] ?? v.voucher_type, 52);
    field("Date",         format(new Date(v.created_at), "MMMM d, yyyy"), 62);
    field("Status",       v.status.toUpperCase(),                     72);
    field("Created By",   v.created_by_name ?? "—",                   82);
    field("Approved By",  v.approved_by_name ?? "—",                  92);

    // Amount box
    doc.setFillColor(232, 242, 236);
    doc.roundedRect(14, 98, pw - 28, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(27, 74, 46);
    doc.text("AMOUNT", 20, 107);
    doc.setFontSize(13);
    doc.text(`PHP ${Number(v.amount).toFixed(2)}`, pw - 20, 107, { align: "right" });

    // Description
    doc.setTextColor(33, 33, 33);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Description:", 14, 120);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(v.description, pw - 28);
    doc.text(descLines, 14, 127);

    // Signature lines
    const sigY = 162;
    doc.setDrawColor(100);
    doc.setLineWidth(0.4);
    doc.line(14, sigY, 60, sigY);
    doc.line(80, sigY, 126, sigY);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(biz.reportPreparedByTitle, 14, sigY + 5);
    doc.text(biz.reportApprovedByTitle, 80, sigY + 5);
    if (biz.reportPreparedByName) doc.text(biz.reportPreparedByName, 14, sigY - 3);
    if (biz.reportApprovedByName) doc.text(biz.reportApprovedByName, 80, sigY - 3);

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated: ${format(new Date(), "MMM d, yyyy h:mm a")}`, pw / 2, 175, { align: "center" });

    doc.save(`voucher-${v.voucher_number}.pdf`);
  };

  const exportSingleVoucherExcel = async (v: Voucher) => {
    const biz = readBusinessSettings();
    await downloadXlsx(
      [{ name: "Voucher", data: [
        [`${biz.orgName} — ${biz.councilName}`],
        ["VOUCHER"],
        [],
        ["Voucher No.",  v.voucher_number],
        ["Type",         TYPE_LABELS[v.voucher_type] ?? v.voucher_type],
        ["Date",         format(new Date(v.created_at), "MMMM d, yyyy")],
        ["Status",       v.status.toUpperCase()],
        ["Created By",   v.created_by_name ?? "—"],
        ["Approved By",  v.approved_by_name ?? "—"],
        [],
        ["Amount (PHP)", Number(v.amount)],
        [],
        ["Description",  v.description],
        [],
        [biz.reportPreparedByTitle,  biz.reportPreparedByName],
        [biz.reportApprovedByTitle, biz.reportApprovedByName],
        [],
        [`Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")}`],
      ] }],
      `voucher-${v.voucher_number}.xlsx`,
    );
  };

  // ── exports ─────────────────────────────────────────────────────────────────
  // Exports cover the current page only; use "Export Excel" for the full set if needed.
  const exportSource = tab === "pending" ? pendingVouchers : allVouchers;
  const exportLabel  = tab === "pending" ? "Pending Vouchers" : "All Vouchers";

  const handleExportExcel = async () => {
    const headers = ["Voucher #", "Type", "Description", "Amount (₱)", "Status", "Created By", "Date"];
    const rows = exportSource.map((v) => [
      v.voucher_number,
      TYPE_LABELS[v.voucher_type] ?? v.voucher_type,
      v.description,
      v.amount,
      v.status,
      v.created_by_name ?? "—",
      format(new Date(v.created_at), "MMM d, yyyy"),
    ]);

    const totalPosted = exportSource
      .filter((v) => v.status === "posted")
      .reduce((s, v) => s + v.amount, 0);

    await downloadXlsx(
      [{ name: "Vouchers", data: [
        [`${readBusinessSettings().orgName} — ${readBusinessSettings().councilName}`],
        ["Voucher Register"],
        [`Filter: ${exportLabel}`],
        [`Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")}`],
        [],
        headers,
        ...rows,
        [],
        ["Total Posted (feeds into Operating Expenses)", totalPosted],
      ] }],
      `vouchers-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`,
    );
  };

  const handleExportPdf = async () => {
    const biz = readBusinessSettings();
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape" });
    const generatedAt = format(new Date(), "MMMM d, yyyy h:mm a");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`${biz.orgName} — ${biz.councilName}`, 14, 16);
    doc.setFontSize(13);
    doc.text("Voucher Register", 14, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Filter: ${exportLabel}`, 14, 31);
    doc.text(`Generated: ${generatedAt}`, 14, 37);

    const pw  = doc.internal.pageSize.getWidth();
    const ph  = doc.internal.pageSize.getHeight();
    const cols = [14, 50, 80, 155, 195, 220, 260];
    const headers = ["Voucher #", "Type", "Description", "Amount", "Status", "Created By", "Date"];
    let y = 50;

    const drawHeader = () => {
      doc.setFillColor(16, 87, 60);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.rect(12, y - 6, pw - 24, 9, "F");
      headers.forEach((h, i) => doc.text(h, cols[i], y));
      doc.setTextColor(33, 33, 33);
      doc.setFont("helvetica", "normal");
      y += 8;
    };

    drawHeader();

    exportSource.forEach((v) => {
      if (y > ph - 20) { doc.addPage(); y = 20; drawHeader(); }
      doc.setFontSize(9);
      doc.text(v.voucher_number, cols[0], y);
      doc.text(TYPE_LABELS[v.voucher_type] ?? v.voucher_type, cols[1], y);
      const desc = v.description.length > 35 ? v.description.slice(0, 33) + "…" : v.description;
      doc.text(desc, cols[2], y);
      doc.text(`₱${Number(v.amount).toFixed(2)}`, cols[3], y, { align: "right" });
      doc.text(v.status, cols[4], y);
      doc.text(v.created_by_name ?? "—", cols[5], y);
      doc.text(format(new Date(v.created_at), "MMM d, yyyy"), cols[6], y);
      y += 7;
    });

    if (exportSource.length === 0) {
      doc.text("No vouchers found.", 14, y + 6);
    }

    const totalPosted = exportSource
      .filter((v) => v.status === "posted")
      .reduce((s, v) => s + v.amount, 0);

    y += 10;
    if (y > ph - 14) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Total Posted (Operating Expenses): ₱${totalPosted.toFixed(2)}`, 14, y);

    doc.save(`vouchers-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Vouchers & Approvals</h1>
          <p className="text-muted-foreground">
            Manage payment, receipt, journal, and payroll vouchers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportPdf} className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create Voucher
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "all")}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approval
            {pendingTotal > 0 && (
              <Badge variant="outline" className="ml-2 text-xs">
                {pendingTotal}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Vouchers</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">Pending Vouchers</CardTitle>
            </CardHeader>
            <CardContent>
              {renderTable(pendingVouchers, loadingPending, pendingTotal, pendingPage, pendingTotalPages, setPendingPage)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">All Vouchers</CardTitle>
            </CardHeader>
            <CardContent>
              {renderTable(allVouchers, loadingAll, allTotal, allPage, allTotalPages, setAllPage)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Voucher Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Voucher</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as VoucherType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="journal">Journal</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                value={formAmount}
                onChange={(e) => setFormAmount(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Brief description of this voucher…"
              />
            </div>
            <div className="space-y-1">
              <Label>Explicit Account</Label>
              <Select value={formAccountId || "none"} onValueChange={(value) => setFormAccountId(value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Use automatic mapping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use automatic mapping</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
