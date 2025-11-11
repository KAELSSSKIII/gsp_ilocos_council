import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileCheck, FileDigit, Workflow, Send } from "lucide-react";
import { formatCurrency } from "@/utils/format";

const voucherRows = [
  {
    id: "VCH-00045",
    type: "Sales",
    amount: 2450,
    status: "Pending",
    createdBy: "Maria Santos",
  },
  {
    id: "VCH-00046",
    type: "Payment",
    amount: 980,
    status: "Approved",
    createdBy: "Ana Reyes",
  },
];

export function VouchersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Vouchers & Approvals</h1>
          <p className="text-muted-foreground">Manage payment, receipt, journal, and payroll vouchers.</p>
        </div>
        <Button>Create Voucher</Button>
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="queue">Approval Queue</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="workflows">Workflow Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <FileDigit className="h-5 w-5 text-primary" /> Pending Vouchers
              </CardTitle>
              <CardDescription>Review and approve vouchers before they are posted to accounting.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead className="w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {voucherRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-card-foreground">{row.id}</TableCell>
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{formatCurrency(row.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "Approved" ? "secondary" : "outline"}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.createdBy}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline">
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost">
                          Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="grid gap-4 md:grid-cols-2">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <FileCheck className="h-5 w-5 text-emerald-500" /> Recent Approvals
              </CardTitle>
              <CardDescription>Completed vouchers ready for posting.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Once the flow is active, voucher history, audit trails, and linked journal entries will be visible here.
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Send className="h-5 w-5 text-sky-500" /> Notifications
              </CardTitle>
              <CardDescription>Email and in-app alerts for supervisor approvals.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Configure escalations and auto reminders so vouchers never stall in the queue.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Workflow className="h-5 w-5 text-amber-500" /> Workflow Builder
              </CardTitle>
              <CardDescription>Define approval chains, threshold limits, and posting rules.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                Drag-and-drop workflow editor will let you set up manager approvals, notifications, and automatic
                posting to accounting once conditions are met.
              </p>
              <p>
                Integrate with Supabase Row-Level Security so only authorised roles can approve or modify specific
                voucher types.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}



