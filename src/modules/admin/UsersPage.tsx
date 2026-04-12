import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, UserCog, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/api";
import { useSessionStore } from "@/store/sessionStore";

interface StaffUser {
  id: string;
  full_name: string;
  username: string;
  role: string;
  branch: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  last_modified_at: string | null;
  last_modified_by_name: string | null;
}

interface AuditTrailEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_role: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  target_user_username: string | null;
  entity_display_name: string | null;
}

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "accountant", label: "Accountant" },
  { value: "cashier", label: "Cashier" },
  { value: "hr", label: "HR" },
  { value: "inventory_clerk", label: "Inventory Clerk" },
  { value: "manager", label: "Manager" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-100 text-violet-800",
  accountant: "bg-blue-100 text-blue-800",
  cashier: "bg-emerald-100 text-emerald-800",
  hr: "bg-orange-100 text-orange-800",
  inventory_clerk: "bg-amber-100 text-amber-800",
  manager: "bg-pink-100 text-pink-800",
};

const BLANK_FORM = { full_name: "", username: "", password: "", role: "cashier", branch: "", phone: "" };

const formatAuditDate = (value: string | null) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export function UsersPage() {
  const qc = useQueryClient();
  const currentUserId = useSessionStore((state) => state.profile?.id);

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [form, setForm] = useState({ ...BLANK_FORM });

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: StaffUser[] }>("/users").then((response) => response.users),
  });

  const { data: auditTrail = [], isLoading: isAuditTrailLoading } = useQuery({
    queryKey: ["users", "audit-trail"],
    queryFn: () => api.get<{ entries: AuditTrailEntry[] }>("/users/audit-trail").then((response) => response.entries),
  });

  const users = data ?? [];

  const refreshUserQueries = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["users", "audit-trail"] });
  };

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post("/users", body),
    onSuccess: () => {
      refreshUserQueries();
      toast.success("Account created successfully.");
      setShowCreate(false);
    },
    onError: (error: Error) => toast.error(error.message ?? "Failed to create account"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/users/${id}`, body),
    onSuccess: () => {
      refreshUserQueries();
      toast.success("Account updated.");
      setEditTarget(null);
    },
    onError: (error: Error) => toast.error(error.message ?? "Failed to update account"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      refreshUserQueries();
      toast.success("Account deleted.");
      setDeleteTarget(null);
    },
    onError: (error: Error) => toast.error(error.message ?? "Failed to delete account"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.patch(`/users/${id}`, { password }),
    onSuccess: () => {
      toast.success("Password reset successfully.");
      setResetTarget(null);
      setResetPw("");
    },
    onError: (error: Error) => toast.error(error.message ?? "Failed to reset password"),
  });

  const handleResetPassword = () => {
    if (!resetTarget) return;
    if (resetPw.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    resetPasswordMutation.mutate({ id: resetTarget.id, password: resetPw });
  };

  const onFieldChange = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((previous) => ({ ...previous, [key]: event.target.value }));
  };

  const openCreate = () => {
    setForm({ ...BLANK_FORM });
    setShowCreate(true);
  };

  const openEdit = (user: StaffUser) => {
    setForm({
      full_name: user.full_name,
      username: user.username,
      password: "",
      role: user.role,
      branch: user.branch ?? "",
      phone: user.phone ?? "",
    });
    setEditTarget(user);
  };

  const handleCreate = () => {
    if (!form.full_name || !form.username || !form.password || !form.role) {
      toast.error("Name, username, password, and role are required");
      return;
    }

    createMutation.mutate({
      full_name: form.full_name,
      username: form.username,
      password: form.password,
      role: form.role,
      branch: form.branch || null,
      phone: form.phone || null,
    });
  };

  const handleUpdate = () => {
    if (!editTarget) return;

    const body: Record<string, unknown> = {
      full_name: form.full_name,
      role: form.role,
      branch: form.branch || null,
      phone: form.phone || null,
    };

    if (form.password) {
      body.password = form.password;
    }

    updateMutation.mutate({ id: editTarget.id, body });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <UserCog className="h-7 w-7" /> User Accounts
          </h1>
          <p className="text-muted-foreground">Manage staff logins, last sign-ins, and recent edits.</p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New Account
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {ROLES.map((role) => {
          const count = users.filter((user) => user.role === role.value).length;
          return (
            <Card key={role.value} className="text-center">
              <CardContent className="pb-3 pt-4">
                <p className="text-2xl font-bold">{count}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{role.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Staff Accounts</CardTitle>
          <CardDescription>{users.length} account{users.length !== 1 ? "s" : ""} total</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Last Edited</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                            {user.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-card-foreground">
                            {user.full_name}
                            {user.id === currentUserId && (
                              <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">@{user.username}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"}`}>
                          {user.role.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{user.branch ?? "-"}</TableCell>
                      <TableCell className="text-sm">{user.phone ?? "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatAuditDate(user.last_login_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.last_modified_at
                          ? `${formatAuditDate(user.last_modified_at)}${user.last_modified_by_name ? ` by ${user.last_modified_by_name}` : ""}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground"
                            title="Reset password"
                            onClick={() => { setResetTarget(user); setResetPw(""); }}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(user)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive"
                            disabled={user.id === currentUserId}
                            onClick={() => setDeleteTarget(user)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Recent Audit Trail</CardTitle>
          <CardDescription>Tracks sign-ins and operational actions like employee updates and payroll processing.</CardDescription>
        </CardHeader>
        <CardContent>
          {isAuditTrailLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading audit trail...</p>
          ) : auditTrail.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Module Record</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditTrail.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm text-muted-foreground">{formatAuditDate(entry.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {entry.action.replaceAll("_", " ")}
                        </Badge>
                        <div className="mt-1 text-xs text-muted-foreground capitalize">
                          {entry.entity_type.replaceAll("_", " ")}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-card-foreground">{entry.actor_name ?? "System"}</div>
                        {entry.actor_username && (
                          <div className="font-mono text-xs text-muted-foreground">@{entry.actor_username}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-card-foreground">
                          {entry.entity_display_name ?? entry.target_user_name ?? "-"}
                        </div>
                        {entry.target_user_username && (
                          <div className="font-mono text-xs text-muted-foreground">@{entry.target_user_username}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={onFieldChange("full_name")} placeholder="Juan dela Cruz" />
            </div>
            <div className="space-y-1">
              <Label>Username</Label>
              <Input value={form.username} onChange={onFieldChange("username")} placeholder="juan_dela_cruz" />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={onFieldChange("password")} placeholder="Min. 6 characters" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(value) => setForm((previous) => ({ ...previous, role: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Branch <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={form.branch} onChange={onFieldChange("branch")} placeholder="Main Office" />
              </div>
              <div className="space-y-1">
                <Label>Phone <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={form.phone} onChange={onFieldChange("phone")} placeholder="09xx-xxx-xxxx" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={onFieldChange("full_name")} />
            </div>
            <div className="space-y-1">
              <Label>Username</Label>
              <Input value={form.username} disabled className="bg-muted font-mono text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Username cannot be changed.</p>
            </div>
            <div className="space-y-1">
              <Label>New Password <span className="text-xs text-muted-foreground">(leave blank to keep current)</span></Label>
              <Input type="password" value={form.password} onChange={onFieldChange("password")} placeholder="Enter new password..." />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(value) => setForm((previous) => ({ ...previous, role: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Branch</Label>
                <Input value={form.branch} onChange={onFieldChange("branch")} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={onFieldChange("phone")} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setResetPw(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Set a new password for <strong>{resetTarget?.full_name}</strong>.
            </p>
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input
                type="password"
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                placeholder="Min. 6 characters"
                onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setResetPw(""); }}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.full_name}</strong>? This will permanently remove their login access and cannot be undone.
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
    </div>
  );
}
