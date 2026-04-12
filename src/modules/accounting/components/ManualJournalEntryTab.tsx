import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/utils/format";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface JournalLineDraft {
  account_id: string;
  description: string;
  debit: string;
  credit: string;
}

const EMPTY_LINE: JournalLineDraft = {
  account_id: "",
  description: "",
  debit: "",
  credit: "",
};

export function ManualJournalEntryTab() {
  const queryClient = useQueryClient();
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [referenceType, setReferenceType] = useState("manual");
  const [lines, setLines] = useState<JournalLineDraft[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE },
  ]);

  const { data } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: () => api.get<AccountOption[]>("/accounts"),
  });

  const accounts = (data ?? []).filter((account) => account.is_active);
  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    return { debit, credit, difference: debit - credit };
  }, [lines]);

  const createMutation = useMutation({
    mutationFn: () => api.post("/accounting/journal-entries", {
      entry_date: entryDate,
      description,
      reference_type: referenceType,
      lines: lines
        .filter((line) => line.account_id)
        .map((line) => ({
          account_id: line.account_id,
          description: line.description || null,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
        })),
    }),
    onSuccess: () => {
      toast.success("Journal entry posted");
      setDescription("");
      setReferenceType("manual");
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to post journal entry");
    },
  });

  const updateLine = (index: number, key: keyof JournalLineDraft, value: string) => {
    setLines((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [key]: value } : line
    )));
  };

  const canSubmit = description.trim().length > 0
    && lines.filter((line) => line.account_id).length >= 2
    && Math.round(totals.difference * 100) === 0;

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Manual Journal Entry</CardTitle>
        <CardDescription>
          Post balanced entries directly to the general journal when an adjustment or reclass is needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="entry-date">Entry Date</Label>
            <Input id="entry-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Reference Type</Label>
            <Select value={referenceType} onValueChange={setReferenceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="reclass">Reclass</SelectItem>
                <SelectItem value="closing">Closing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p>Total Debit: <span className="font-semibold">{formatCurrency(totals.debit)}</span></p>
            <p>Total Credit: <span className="font-semibold">{formatCurrency(totals.credit)}</span></p>
            <p className={Math.round(totals.difference * 100) === 0 ? "text-emerald-600" : "text-destructive"}>
              Difference: {formatCurrency(totals.difference)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="entry-description">Description</Label>
          <Textarea
            id="entry-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe why this journal entry is being posted."
            className="min-h-[90px]"
          />
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[2fr,2fr,1fr,1fr,auto]">
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={line.account_id || "none"} onValueChange={(value) => updateLine(index, "account_id", value === "none" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select account</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Debit</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.debit}
                  onChange={(e) => {
                    updateLine(index, "debit", e.target.value);
                    if (e.target.value) updateLine(index, "credit", "");
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Credit</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.credit}
                  onChange={(e) => {
                    updateLine(index, "credit", e.target.value);
                    if (e.target.value) updateLine(index, "debit", "");
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLines((current) => current.length > 2 ? current.filter((_, i) => i !== index) : current)}
                  disabled={lines.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}>
            <Plus className="mr-2 h-4 w-4" />
            Add Line
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {createMutation.isPending ? "Posting..." : "Post Journal Entry"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
