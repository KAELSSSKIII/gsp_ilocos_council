import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";
import api from "@/lib/api";
import { useSessionStore, selectRole } from "@/store/sessionStore";
import { formatNumber } from "@/utils/format";

type Member = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  discount_rate: number;
  created_at: string;
  updated_at: string | null;
};

const defaultForm = { code: "", name: "", email: "", discount_rate: "" };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function MembersPage() {
  const role = useSessionStore(selectRole);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { members: data } = await api.get<{ members: Member[] }>("/members");
      setMembers(data ?? []);
    } catch {
      toast.error("Failed to load members.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (member: Member) => {
    setEditTarget(member);
    setForm({
      code: member.code,
      name: member.name,
      email: member.email ?? "",
      discount_rate: member.discount_rate > 0 ? String(member.discount_rate * 100) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const email = form.email.trim() || null;
    const rateInput = parseFloat(form.discount_rate);
    const discount_rate = isNaN(rateInput) ? 0 : Math.min(Math.max(rateInput, 0), 100) / 100;

    if (!name) { toast.error("Name is required."); return; }
    if (!code) { toast.error("Member code is required."); return; }

    setSaving(true);
    try {
      if (editTarget) {
        const { member } = await api.patch<{ member: Member }>(`/members/${editTarget.id}`, {
          name, email, discount_rate,
        });
        setMembers((prev) => prev.map((m) => (m.id === editTarget.id ? member : m)));
        toast.success("Member updated.");
      } else {
        const { member } = await api.post<{ member: Member }>("/members", {
          code, name, email, discount_rate,
        });
        setMembers((prev) => [...prev, member]);
        toast.success("Member added.");
      }
      setDialogOpen(false);
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Failed to save member.");
      toast.error(msg.includes("unique") ? "That member code is already taken." : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/members/${deleteTarget.id}`);
      setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast.success("Member removed.");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete member.");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.code.toLowerCase().includes(search.toLowerCase()) ||
    (m.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Members</h1>
            <p className="text-sm text-muted-foreground">
              Enroll loyalty members and set individual discount rates.
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add Member
        </Button>
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Member List</CardTitle>
          <CardDescription>{members.length} member{members.length !== 1 ? "s" : ""} enrolled</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by name, code, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {search ? "No members match your search." : "No members yet. Add the first one."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{member.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
                    <TableCell>
                      {member.discount_rate > 0 ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          {formatNumber(member.discount_rate * 100, 0)}% off
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(member)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {role === "admin" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(member)}
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
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Member" : "Add Member"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update the member's details or discount rate."
                : "Enroll a new loyalty member. The code will be auto-uppercased."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="member-code">Member Code</Label>
              <Input
                id="member-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. MEM-001"
                disabled={!!editTarget}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-name">Full Name</Label>
              <Input
                id="member-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Maria Santos"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="member-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="e.g. maria@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-discount">Discount % <span className="text-muted-foreground">(0 = no discount)</span></Label>
              <div className="relative">
                <Input
                  id="member-discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.discount_rate}
                  onChange={(e) => setForm((f) => ({ ...f, discount_rate: e.target.value }))}
                  placeholder="e.g. 10"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Applied automatically to non-rental items when this member is selected at POS.</p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editTarget ? "Save Changes" : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.code}) from the loyalty program?
              Past sales linked to this member will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
