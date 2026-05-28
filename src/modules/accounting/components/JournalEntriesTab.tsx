import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/utils/format";

interface JournalEntryLine {
  id: string;
  line_number: number;
  account_id: string;
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
  description: string | null;
  status: string;
  posted_at: string | null;
  created_at: string;
  is_reversal?: boolean;
  lines: JournalEntryLine[];
}

interface JournalEntriesResponse {
  data: JournalEntry[];
  total: number;
  page: number;
  page_size: number;
}

const PAGE_SIZE = 25;

export function JournalEntriesTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [entryPendingDelete, setEntryPendingDelete] = useState<JournalEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["journal-entries", page],
    queryFn: () =>
      api.get<JournalEntriesResponse>(`/accounting/journal-entries?page=${page}&page_size=${PAGE_SIZE}`)
        .then((response) => ({
          ...response,
          data: response.data.map((entry) => ({
            ...entry,
            is_reversal: entry.entry_number.startsWith("JE-REV") || (typeof entry.source_key === "string" && entry.source_key.includes(":void:")),
          })),
        })),
  });

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/accounting/journal-entries/${id}`),
    onSuccess: () => {
      toast.success("Journal entry deleted");
      setEntryPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete journal entry");
    },
  });

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Journal Entries</CardTitle>
        <CardDescription>
          Auto-posted accounting entries created from sales, invoices, vouchers, and payroll actions.
          {total > 0 && ` · ${total} total · page ${page + 1} of ${totalPages || 1}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading journal entries...</p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No journal entries found yet.</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry: JournalEntry) => (
              <div key={entry.id} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{entry.entry_number}</p>
                      <Badge variant="outline" className="capitalize">
                        {entry.reference_type ?? "journal"}
                      </Badge>
                      {entry.is_reversal && <Badge variant="destructive">Reversal</Badge>}
                      <Badge variant={entry.status === "posted" ? "default" : "secondary"} className="capitalize">
                        {entry.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.description || "No description"}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{formatDate(entry.entry_date)}</p>
                      <p>{entry.source_key ?? "manual"}</p>
                    </div>
                    {entry.entry_number.startsWith("JE-MAN") && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setEntryPendingDelete(entry)}
                        disabled={deleteMutation.isPending}
                        aria-label={`Delete ${entry.entry_number}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto px-4 py-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div className="font-mono text-xs">{line.account_code}</div>
                            <div className="text-sm">{line.account_name}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {line.description || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.debit > 0 ? formatCurrency(line.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.credit > 0 ? formatCurrency(line.credit) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}

        <AlertDialog open={!!entryPendingDelete} onOpenChange={(open) => !open && setEntryPendingDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Journal Entry?</AlertDialogTitle>
              <AlertDialogDescription>
                {entryPendingDelete
                  ? `This will permanently delete manual journal entry ${entryPendingDelete.entry_number}. This action cannot be undone.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending || !entryPendingDelete}
                onClick={(event) => {
                  event.preventDefault();
                  if (entryPendingDelete) {
                    deleteMutation.mutate(entryPendingDelete.id);
                  }
                }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
      </CardContent>
    </Card>
  );
}
