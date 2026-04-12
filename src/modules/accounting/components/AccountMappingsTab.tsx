import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface MappingRow {
  mapping_key: string;
  label: string;
  description: string;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
}

export function AccountMappingsTab() {
  const queryClient = useQueryClient();
  const { data: accountsData } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: () => api.get<AccountOption[]>("/accounts"),
  });
  const { data: mappingsData, isLoading } = useQuery({
    queryKey: ["accounting-mappings"],
    queryFn: () => api.get<{ mappings: MappingRow[] }>("/accounting/mappings").then((res) => res.mappings),
  });

  const accounts = useMemo(
    () => (accountsData ?? []).filter((account) => account.is_active),
    [accountsData]
  );
  const mappings = mappingsData ?? [];
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});

  const effectiveValue = (mapping: MappingRow) => draftMappings[mapping.mapping_key] ?? mapping.account_id ?? "none";

  const saveMutation = useMutation({
    mutationFn: () => api.put("/accounting/mappings", {
      mappings: mappings.map((mapping) => ({
        mapping_key: mapping.mapping_key,
        account_id: (draftMappings[mapping.mapping_key] ?? mapping.account_id) || null,
      })).filter((mapping) => mapping.account_id),
    }),
    onSuccess: () => {
      toast.success("Account mappings saved");
      setDraftMappings({});
      queryClient.invalidateQueries({ queryKey: ["accounting-mappings"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to save mappings");
    },
  });

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Account Mappings</CardTitle>
        <CardDescription>
          Choose which accounts the automation uses for sales, invoices, vouchers, and payroll postings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading account mappings...</p>
        ) : (
          <>
            <div className="grid gap-4">
              {mappings.map((mapping) => (
                <div key={mapping.mapping_key} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1.6fr,1fr] md:items-center">
                  <div>
                    <Label className="text-sm font-semibold">{mapping.label}</Label>
                    <p className="text-sm text-muted-foreground">{mapping.description}</p>
                    {mapping.account_code && mapping.account_name && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Current: {mapping.account_code} - {mapping.account_name}
                      </p>
                    )}
                  </div>
                  <Select
                    value={effectiveValue(mapping)}
                    onValueChange={(value) => setDraftMappings((current) => ({
                      ...current,
                      [mapping.mapping_key]: value,
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No account selected</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Mappings"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
