import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function JournalEntriesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["journal-entries"],
    queryFn: () =>
      api.get<{ entries: JournalEntry[] }>("/accounting/journal-entries?limit=100")
        .then((response) => response.entries.map((entry) => ({
          ...entry,
          is_reversal: entry.entry_number.startsWith("JE-REV") || (typeof entry.source_key === "string" && entry.source_key.includes(":void:")),
        }))),
  });

  const entries = data ?? [];

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Journal Entries</CardTitle>
        <CardDescription>
          Auto-posted accounting entries created from sales, invoices, vouchers, and payroll actions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading journal entries...</p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No journal entries found yet.</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
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
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{formatDate(entry.entry_date)}</p>
                    <p>{entry.source_key ?? "manual"}</p>
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
      </CardContent>
    </Card>
  );
}
