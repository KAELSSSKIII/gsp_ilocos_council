import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Trash2, CheckCircle2, Send, XCircle } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: InvoiceStatus;
  notes: string | null;
  items: InvoiceItem[];
}

const STATUS_COLORS: Record<InvoiceStatus, "outline" | "secondary" | "default" | "destructive"> = {
  draft:     "outline",
  sent:      "secondary",
  paid:      "default",
  overdue:   "destructive",
  cancelled: "outline",
};

const BLANK_ITEM: InvoiceItem = { description: "", quantity: 1, unit_price: 0, amount: 0 };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicesTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog,   setShowDialog]   = useState(false);

  // Form state
  const [customerName,  setCustomerName]  = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [issueDate,     setIssueDate]     = useState(new Date().toISOString().slice(0, 10));
  const [dueDate,       setDueDate]       = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10);
  });
  const [taxAmount,     setTaxAmount]     = useState(0);
  const [notes,         setNotes]         = useState("");
  const [items,         setItems]         = useState<InvoiceItem[]>([{ ...BLANK_ITEM }]);

  // ── query ──────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: () => {
      const url = statusFilter === "all" ? "/invoices" : `/invoices?status=${statusFilter}`;
      return api.get<{ invoices: Invoice[] }>(url).then((r) => r.invoices);
    },
  });

  const invoices = data ?? [];

  // Outstanding total
  const outstanding = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((s, inv) => s + Number(inv.total_amount), 0);

  // ── mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: object) => api.post("/invoices", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice created");
      setShowDialog(false);
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Failed to create invoice")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/invoices/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice updated");
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Failed to update invoice")),
  });

  // ── Line item helpers ──────────────────────────────────────────────────────
  const updateItem = (idx: number, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [field]: value };
        if (field === "quantity" || field === "unit_price") {
          updated.amount = Number(updated.quantity) * Number(updated.unit_price);
        }
        return updated;
      })
    );
  };

  const addItem    = () => setItems((p) => [...p, { ...BLANK_ITEM }]);
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const total    = subtotal + taxAmount;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleCreate = (asDraft = false) => {
    if (!customerName || !issueDate || !dueDate) {
      toast.error("Customer name, issue date, and due date are required");
      return;
    }
    createMutation.mutate({
      customer_name:  customerName,
      customer_email: customerEmail || null,
      issue_date:     issueDate,
      due_date:       dueDate,
      tax_amount:     taxAmount,
      notes:          notes || null,
      status:         asDraft ? "draft" : "sent",
      items:          items.filter((it) => it.description && it.amount > 0),
    });
  };

  const openCreate = () => {
    setCustomerName(""); setCustomerEmail(""); setNotes(""); setTaxAmount(0);
    setIssueDate(new Date().toISOString().slice(0, 10));
    const d = new Date(); d.setDate(d.getDate() + 30);
    setDueDate(d.toISOString().slice(0, 10));
    setItems([{ ...BLANK_ITEM }]);
    setShowDialog(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Summary + header */}
      <div className="flex flex-wrap items-start gap-4">
        <Card className="flex-1 min-w-[180px]">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs">Outstanding (Sent + Overdue)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(outstanding)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[180px]">
          <CardHeader className="pb-1"><CardDescription className="text-xs">Total Invoices</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{invoices.length}</p></CardContent>
        </Card>
        <div className="flex items-end gap-2 ml-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell>
                        <div className="font-medium text-card-foreground">{inv.customer_name}</div>
                        {inv.customer_email && (
                          <div className="text-xs text-muted-foreground">{inv.customer_email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{inv.issue_date?.slice(0, 10)}</TableCell>
                      <TableCell className="text-xs">{inv.due_date?.slice(0, 10)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(inv.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[inv.status] ?? "outline"} className="capitalize">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {inv.status === "draft" && (
                            <Button size="sm" variant="outline" className="text-xs"
                              onClick={() => updateMutation.mutate({ id: inv.id, status: "sent" })}>
                              <Send className="h-3 w-3 mr-1" /> Send
                            </Button>
                          )}
                          {(inv.status === "sent" || inv.status === "overdue") && (
                            <Button size="sm" variant="outline" className="text-xs text-emerald-600"
                              onClick={() => updateMutation.mutate({ id: inv.id, status: "paid" })}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
                            </Button>
                          )}
                          {inv.status !== "cancelled" && inv.status !== "paid" && (
                            <Button size="sm" variant="ghost" className="text-xs text-destructive"
                              onClick={() => updateMutation.mutate({ id: inv.id, status: "cancelled" })}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Customer info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Customer Name</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer / Organization" />
              </div>
              <div className="space-y-1">
                <Label>Email (optional)</Label>
                <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Issue Date</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Line Items</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="flex items-center gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span className="col-span-5">Description</span>
                  <span className="col-span-2 text-right">Qty</span>
                  <span className="col-span-2 text-right">Unit Price</span>
                  <span className="col-span-2 text-right">Amount</span>
                  <span className="col-span-1" />
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-5 h-8 text-sm" placeholder="Description"
                      value={it.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)} />
                    <Input className="col-span-2 h-8 text-sm text-right" type="number" min={1}
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} />
                    <Input className="col-span-2 h-8 text-sm text-right" type="number" min={0}
                      value={it.unit_price}
                      onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)} />
                    <div className="col-span-2 text-right text-sm font-medium pr-1">
                      {formatCurrency(it.amount)}
                    </div>
                    <Button variant="ghost" size="sm" className="col-span-1 h-8 text-destructive px-1"
                      onClick={() => removeItem(idx)} disabled={items.length === 1}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end gap-1 border-t pt-3">
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground w-24 text-right">Subtotal:</span>
                <span className="font-medium w-28 text-right">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground w-24 text-right">Tax:</Label>
                <Input type="number" min={0} className="w-28 h-7 text-sm text-right"
                  value={taxAmount} onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="flex gap-4 text-base font-bold">
                <span className="w-24 text-right">Total:</span>
                <span className="w-28 text-right text-emerald-600">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, instructions…" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleCreate(true)} disabled={createMutation.isPending}>
              Save as Draft
            </Button>
            <Button onClick={() => handleCreate(false)} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Create & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
