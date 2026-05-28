import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Pencil, UserPlus, UserX } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/utils/format";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  employee_number: string;
  full_name: string;
  position: string;
  department: string | null;
  branch: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  hire_date: string;
  salary: number;
  is_active: boolean;
  created_at: string;
}

const BLANK: Omit<Employee, "id" | "created_at"> = {
  employee_number: "",
  full_name: "",
  position: "",
  department: "",
  branch: "",
  email: "",
  phone: "",
  address: "",
  hire_date: new Date().toISOString().slice(0, 10),
  salary: 0,
  is_active: true,
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toNullableString(value: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch]       = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [form, setForm]           = useState(BLANK);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.get<{ employees: Employee[] }>("/employees").then((r) => r.employees),
  });

  const employees = data ?? [];

  // ── mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: typeof BLANK) => api.post("/employees", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee added");
      setShowDialog(false);
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Failed to add employee")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<typeof BLANK> }) =>
      api.patch(`/employees/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated");
      setShowDialog(false);
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Failed to update employee")),
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null);
    setForm({ ...BLANK });
    setShowDialog(true);
  };

  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setForm({
      employee_number: emp.employee_number,
      full_name:  emp.full_name,
      position:   emp.position,
      department: emp.department ?? "",
      branch:     emp.branch ?? "",
      email:      emp.email ?? "",
      phone:      emp.phone ?? "",
      address:    emp.address ?? "",
      hire_date:  emp.hire_date.slice(0, 10),
      salary:     emp.salary,
      is_active:  emp.is_active,
    });
    setShowDialog(true);
  };

  const toggleActive = (emp: Employee) => {
    updateMutation.mutate({
      id: emp.id,
      body: { is_active: !emp.is_active },
    });
  };

  const handleSubmit = () => {
    if (!form.employee_number || !form.full_name || !form.position || !form.hire_date) {
      toast.error("Employee #, name, position, and hire date are required");
      return;
    }

    const payload = {
      employee_number: form.employee_number.trim(),
      full_name: form.full_name.trim(),
      position: form.position.trim(),
      department: toNullableString(form.department),
      branch: toNullableString(form.branch),
      email: toNullableString(form.email),
      phone: toNullableString(form.phone),
      address: toNullableString(form.address),
      hire_date: form.hire_date,
      salary: form.salary,
      is_active: form.is_active,
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, body: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const set = (field: keyof typeof BLANK, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  // ── filter ─────────────────────────────────────────────────────────────────
  const filtered = employees.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.full_name.toLowerCase().includes(q) ||
      e.employee_number.toLowerCase().includes(q) ||
      e.position.toLowerCase().includes(q)
    );
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Employee Management</h1>
          <p className="text-muted-foreground">
            Manage staff records, roles, and salary information.
          </p>
        </div>
        <Button onClick={openAdd} className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-card-foreground">Staff</CardTitle>
            <Input
              className="max-w-xs ml-auto"
              placeholder="Search name, ID, position…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No employees found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow key={emp.id} className={emp.is_active ? "" : "opacity-50"}>
                    <TableCell className="font-mono text-xs">{emp.employee_number}</TableCell>
                    <TableCell>
                      <div className="font-medium text-card-foreground">{emp.full_name}</div>
                      {emp.email && (
                        <div className="text-xs text-muted-foreground">{emp.email}</div>
                      )}
                    </TableCell>
                    <TableCell>{emp.position}</TableCell>
                    <TableCell>{emp.department ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(emp.salary)}</TableCell>
                    <TableCell>
                      <Badge variant={emp.is_active ? "secondary" : "outline"}>
                        {emp.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(emp)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(emp)}
                        title={emp.is_active ? "Deactivate" : "Reactivate"}
                        className={emp.is_active ? "text-destructive" : "text-emerald-600"}
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label>Employee #</Label>
              <Input
                value={form.employee_number}
                onChange={(e) => set("employee_number", e.target.value)}
                placeholder="EMP-001"
              />
            </div>
            <div className="space-y-1">
              <Label>Hire Date</Label>
              <Input
                type="date"
                value={form.hire_date}
                onChange={(e) => set("hire_date", e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Full Name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Maria Santos"
              />
            </div>

            <div className="space-y-1">
              <Label>Position</Label>
              <Input
                value={form.position}
                onChange={(e) => set("position", e.target.value)}
                placeholder="Cashier"
              />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Input
                value={form.department ?? ""}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Operations"
              />
            </div>

            <div className="space-y-1">
              <Label>Branch</Label>
              <Input
                value={form.branch ?? ""}
                onChange={(e) => set("branch", e.target.value)}
                placeholder="Main"
              />
            </div>
            <div className="space-y-1">
              <Label>Monthly Salary</Label>
              <Input
                type="number"
                min={0}
                value={form.salary}
                onChange={(e) => set("salary", parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Address</Label>
              <Input
                value={form.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>

            {editTarget && (
              <div className="col-span-2 space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.is_active ? "active" : "inactive"}
                  onValueChange={(v) => set("is_active", v === "active")}
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
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isBusy}>
              {isBusy ? "Saving…" : editTarget ? "Save Changes" : "Add Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
