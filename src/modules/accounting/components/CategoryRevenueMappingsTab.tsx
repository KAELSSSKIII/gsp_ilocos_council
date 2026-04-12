import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  revenue_account_id: string | null;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  account_type: string;
}

export function CategoryRevenueMappingsTab() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: categoriesData, isLoading } = useQuery({
    queryKey: ["product-categories"],
    queryFn: () => api.get<{ categories: CategoryRow[] }>("/products/categories").then((res) => res.categories),
  });
  const { data: accountsData } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: () => api.get<AccountOption[]>("/accounts"),
  });

  const categories = categoriesData ?? [];
  const accounts = (accountsData ?? []).filter((account) => account.is_active && account.account_type === "income");

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        categories.map((category) =>
          api.patch(`/products/categories/${category.id}`, {
            revenue_account_id: (drafts[category.id] ?? category.revenue_account_id) || null,
          })
        )
      );
    },
    onSuccess: () => {
      toast.success("Category revenue mappings saved");
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ["product-categories"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to save category mappings");
    },
  });

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Category Revenue Accounts</CardTitle>
        <CardDescription>
          Map each product category to its own revenue account so merchandise sales post more precisely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading categories...</p>
        ) : (
          <>
            <div className="grid gap-4">
              {categories.map((category) => (
                <div key={category.id} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1.4fr,1fr] md:items-center">
                  <div>
                    <Label className="text-sm font-semibold">{category.name}</Label>
                    <p className="text-sm text-muted-foreground">{category.description || "No description"}</p>
                  </div>
                  <Select
                    value={drafts[category.id] ?? category.revenue_account_id ?? "none"}
                    onValueChange={(value) => setDrafts((current) => ({
                      ...current,
                      [category.id]: value === "none" ? "" : value,
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Use default merchandise revenue" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Use default merchandise revenue</SelectItem>
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
                {saveMutation.isPending ? "Saving..." : "Save Category Mappings"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
