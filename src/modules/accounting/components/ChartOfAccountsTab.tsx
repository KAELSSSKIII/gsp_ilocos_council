import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
type AccountCategory =
  | "current_asset"
  | "fixed_asset"
  | "current_liability"
  | "long_term_liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "operating_expense"
  | "other_income"
  | "other_expense";
type NormalBalance = "debit" | "credit";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  category: AccountCategory;
  normal_balance: NormalBalance;
  parent_account_id: string | null;
  parent_account_code: string | null;
  parent_account_name: string | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
}

interface AccountFormState {
  code: string;
  name: string;
  account_type: AccountType;
  category: AccountCategory;
  normal_balance: NormalBalance;
  parent_account_id: string;
  description: string;
  is_active: boolean;
}

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

const CATEGORY_OPTIONS: { value: AccountCategory; label: string }[] = [
  { value: "current_asset", label: "Current Asset" },
  { value: "fixed_asset", label: "Fixed Asset" },
  { value: "current_liability", label: "Current Liability" },
  { value: "long_term_liability", label: "Long-term Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "cost_of_sales", label: "Cost of Sales" },
  { value: "operating_expense", label: "Operating Expense" },
  { value: "other_income", label: "Other Income" },
  { value: "other_expense", label: "Other Expense" },
];

const BALANCE_OPTIONS: { value: NormalBalance; label: string }[] = [
  { value: "debit", label: "Debit" },
  { value: "credit", label: "Credit" },
];

const EMPTY_FORM: AccountFormState = {
  code: "",
  name: "",
  account_type: "asset",
  category: "current_asset",
  normal_balance: "debit",
  parent_account_id: "",
  description: "",
  is_active: true,
};
const EMPTY_ACCOUNTS: Account[] = [];

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ChartOfAccountsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | AccountType>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountFormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: () => api.get<Account[]>("/accounts"),
  });

  const accounts = data ?? EMPTY_ACCOUNTS;
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesType = typeFilter === "all" || account.account_type === typeFilter;
      const matchesSearch = !query || [
        account.code,
        account.name,
        account.category,
        account.parent_account_name ?? "",
      ].some((value) => value.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });
  }, [accounts, search, typeFilter]);

  const summary = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((account) => account.is_active).length,
    system: accounts.filter((account) => account.is_system).length,
    custom: accounts.filter((account) => !account.is_system).length,
  }), [accounts]);

  const resetForm = () => {
    setEditingAccount(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (account: Account) => {
    if (account.is_system) return;
    setEditingAccount(account);
    setForm({
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      category: account.category,
      normal_balance: account.normal_balance,
      parent_account_id: account.parent_account_id ?? "",
      description: account.description ?? "",
      is_active: account.is_active,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: AccountFormState) => {
      const body = {
        ...payload,
        parent_account_id: payload.parent_account_id || null,
        description: payload.description.trim() || null,
      };

      if (editingAccount) {
        return api.patch(`/accounts/${editingAccount.id}`, body);
      }

      return api.post("/accounts", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      toast.success(editingAccount ? "Account updated" : "Account created");
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to save account");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      toast.success("Account deleted");
      setDeleteTarget(null);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
      setDeleteTarget(null);
    },
  });

  const parentOptions = accounts.filter((account) => !editingAccount || account.id !== editingAccount.id);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-emerald-600">{summary.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>System Accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-sky-700">{summary.system}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Custom Accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-amber-700">{summary.custom}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Chart of Accounts</CardTitle>
              <CardDescription>
                Manage the account structure that will power journal entries, posting, and financial statements.
              </CardDescription>
            </div>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="account-search">Search</Label>
              <Input
                id="account-search"
                placeholder="Code, name, category..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="w-full md:w-56">
              <Label>Account Type</Label>
              <Select value={typeFilter} onValueChange={(value: "all" | AccountType) => setTypeFilter(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading accounts...</p>
          ) : filteredAccounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No accounts matched your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono text-xs">{account.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{account.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {account.parent_account_name
                            ? `Parent: ${account.parent_account_code} - ${account.parent_account_name}`
                            : account.description || "Top-level account"}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{account.account_type}</TableCell>
                      <TableCell>{titleCase(account.category)}</TableCell>
                      <TableCell className="capitalize">{account.normal_balance}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Badge variant={account.is_active ? "default" : "secondary"}>
                            {account.is_active ? "Active" : "Inactive"}
                          </Badge>
                          {account.is_system && <Badge variant="outline">System</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(account)}
                            disabled={account.is_system}
                          >
                            {account.is_system ? "Protected" : "Edit"}
                          </Button>
                          {!account.is_system && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(account)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.code} — {deleteTarget?.name}</strong>?
              This cannot be undone. Accounts with journal entries or active mappings cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Create Account"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-code">Code</Label>
              <Input
                id="account-code"
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select
                value={form.account_type}
                onValueChange={(value: AccountType) => setForm((current) => ({ ...current, account_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value: AccountCategory) => setForm((current) => ({ ...current, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Normal Balance</Label>
              <Select
                value={form.normal_balance}
                onValueChange={(value: NormalBalance) => setForm((current) => ({ ...current, normal_balance: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BALANCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Parent Account</Label>
              <Select
                value={form.parent_account_id || "none"}
                onValueChange={(value) => setForm((current) => ({
                  ...current,
                  parent_account_id: value === "none" ? "" : value,
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Parent</SelectItem>
                  {parentOptions.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="account-description">Description</Label>
              <Input
                id="account-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Optional note for posting and reporting."
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.is_active ? "active" : "inactive"}
                onValueChange={(value) => setForm((current) => ({ ...current, is_active: value === "active" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.code.trim() || !form.name.trim()}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : editingAccount ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
