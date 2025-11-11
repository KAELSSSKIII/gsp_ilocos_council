import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { demoEmployees } from "@/utils/demo-data";
import { ClipboardList, Clock, Target } from "lucide-react";

export function EmployeesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Employee Management</h1>
          <p className="text-muted-foreground">
            Track roles, shift attendance, and performance of Girl Scout staff.
          </p>
        </div>
        <Button>Add Employee</Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Active Staff</CardTitle>
          <CardDescription>Manage user permissions and monitor attendance.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demoEmployees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="font-medium text-card-foreground">{employee.full_name}</div>
                    <div className="text-xs text-muted-foreground">ID: {employee.id}</div>
                  </TableCell>
                  <TableCell className="capitalize">{employee.role.replace("_", " ")}</TableCell>
                  <TableCell>{employee.branch}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">On Shift</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                    <Button size="sm" variant="ghost">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <Clock className="h-5 w-5 text-primary" /> Shift Attendance
            </CardTitle>
            <CardDescription>Clock-in/out tracking integrates with payroll automation.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Live attendance widgets and shift variance alerts will appear here once attendance capture is wired up.
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <ClipboardList className="h-5 w-5 text-emerald-500" /> Role-Based Access
            </CardTitle>
            <CardDescription>Assign Supabase auth users to cashier, accountant, HR, or manager roles.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A detailed permissions matrix and audit trail will be implemented to align with Supabase RLS policies.
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <Target className="h-5 w-5 text-amber-500" /> Commissions & Goals
            </CardTitle>
            <CardDescription>Track incentive programs and sales targets per employee.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sales performance charts, commission rules, and payout summaries will be displayed once the POS posting is
            connected.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



