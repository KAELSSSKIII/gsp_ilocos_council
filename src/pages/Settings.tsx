import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { FEATURE_ACCESS, hasRoleAccess, ROUTE_ACCESS } from "@/lib/permissions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReceiptSettingsPage } from "@/modules/pos/ReceiptSettingsPage";
import { usePOSStore } from "@/store/posStore";
import { useSessionStore } from "@/store/sessionStore";
import { fetchBusinessSettings, readBusinessSettings, saveBusinessSettings } from "@/utils/businessSettings";

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

const actionLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const DEFAULT_SETTINGS = readBusinessSettings();

type ReceiptSeries = {
  id: string;
  series_label: string;
  from_number: number;
  to_number: number;
  current_number: number;
  is_active: boolean;
  created_at: string;
};

export default function Settings() {
  const profile = useSessionStore((state) => state.profile);
  const canManageReceiptSettings = hasRoleAccess(profile?.role, FEATURE_ACCESS.manageReceiptSettings);
  const isAdmin = profile?.role === "admin";
  const canManageSeries = hasRoleAccess(profile?.role, ROUTE_ACCESS.receiptSeries);
  const qc = useQueryClient();

  const [isSavingBusinessSettings, setIsSavingBusinessSettings] = useState(false);
  const [taxPct, setTaxPct] = useState<string>(String(+(DEFAULT_SETTINGS.taxRate * 100).toFixed(4)));
  const [rentalPct, setRentalPct] = useState<string>(String(+(DEFAULT_SETTINGS.rentalDiscountRate * 100).toFixed(4)));
  const [orgName, setOrgName] = useState(DEFAULT_SETTINGS.orgName);
  const [regionName, setRegionName] = useState(DEFAULT_SETTINGS.regionName);
  const [councilName, setCouncilName] = useState(DEFAULT_SETTINGS.councilName);
  const [orgAddress, setOrgAddress] = useState(DEFAULT_SETTINGS.orgAddress);
  const [bankAccount1, setBankAccount1] = useState(DEFAULT_SETTINGS.bankAccount1);
  const [bankAccount2, setBankAccount2] = useState(DEFAULT_SETTINGS.bankAccount2);
  const [bankAccount3, setBankAccount3] = useState(DEFAULT_SETTINGS.bankAccount3);
  const [bankAccount4, setBankAccount4] = useState(DEFAULT_SETTINGS.bankAccount4);
  const [bankAccount5, setBankAccount5] = useState(DEFAULT_SETTINGS.bankAccount5);
  const [reportPreparedByName, setReportPreparedByName] = useState(DEFAULT_SETTINGS.reportPreparedByName);
  const [reportPreparedByTitle, setReportPreparedByTitle] = useState(DEFAULT_SETTINGS.reportPreparedByTitle);
  const [reportVerifiedByName, setReportVerifiedByName] = useState(DEFAULT_SETTINGS.reportVerifiedByName);
  const [reportVerifiedByTitle, setReportVerifiedByTitle] = useState(DEFAULT_SETTINGS.reportVerifiedByTitle);
  const [reportApprovedByName, setReportApprovedByName] = useState(DEFAULT_SETTINGS.reportApprovedByName);
  const [reportApprovedByTitle, setReportApprovedByTitle] = useState(DEFAULT_SETTINGS.reportApprovedByTitle);

  const { data: auditEntries = [] } = useQuery({
    queryKey: ["settings", "audit-trail"],
    enabled: isAdmin,
    queryFn: () => api.get<{ entries: AuditTrailEntry[] }>("/users/audit-trail").then((response) => response.entries),
  });

  // ── Receipt Series ────────────────────────────────────────────────────────
  const [seriesForm, setSeriesForm] = useState({ series_label: "", from_number: "", to_number: "" });
  const { data: seriesData, isLoading: seriesLoading } = useQuery({
    queryKey: ["receipt-series"],
    enabled: canManageSeries,
    queryFn: () => api.get<{ series: ReceiptSeries[] }>("/receipt-series").then((r) => r.series),
  });
  const seriesList = seriesData ?? [];
  const activeSeries = seriesList.find((s) => s.is_active);

  const createSeriesMutation = useMutation({
    mutationFn: (body: { series_label: string; from_number: number; to_number: number }) =>
      api.post("/receipt-series", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipt-series"] });
      toast.success("Receipt series created.");
      setSeriesForm({ series_label: "", from_number: "", to_number: "" });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to create series."),
  });

  const activateSeriesMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/receipt-series/${id}`, { is_active: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipt-series"] });
      toast.success("Series activated.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to activate series."),
  });

  const handleCreateSeries = () => {
    const from = parseInt(seriesForm.from_number, 10);
    const to   = parseInt(seriesForm.to_number, 10);
    if (!seriesForm.series_label.trim()) { toast.error("Series label is required."); return; }
    if (!Number.isInteger(from) || from < 1) { toast.error("From number must be a positive integer."); return; }
    if (!Number.isInteger(to) || to < from)  { toast.error("To number must be >= from number."); return; }
    createSeriesMutation.mutate({ series_label: seriesForm.series_label.trim(), from_number: from, to_number: to });
  };

  useEffect(() => {
    let cancelled = false;

    void fetchBusinessSettings().then((settings) => {
      if (cancelled) return;
      setTaxPct(String(+(settings.taxRate * 100).toFixed(4)));
      setRentalPct(String(+(settings.rentalDiscountRate * 100).toFixed(4)));
      setOrgName(settings.orgName);
      setRegionName(settings.regionName);
      setCouncilName(settings.councilName);
      setOrgAddress(settings.orgAddress);
      setBankAccount1(settings.bankAccount1);
      setBankAccount2(settings.bankAccount2);
      setBankAccount3(settings.bankAccount3);
      setBankAccount4(settings.bankAccount4);
      setBankAccount5(settings.bankAccount5);
      setReportPreparedByName(settings.reportPreparedByName);
      setReportPreparedByTitle(settings.reportPreparedByTitle);
      setReportVerifiedByName(settings.reportVerifiedByName);
      setReportVerifiedByTitle(settings.reportVerifiedByTitle);
      setReportApprovedByName(settings.reportApprovedByName);
      setReportApprovedByTitle(settings.reportApprovedByTitle);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveBusinessSettings = async () => {
    const taxRate = parseFloat(taxPct) / 100;
    const rentalDiscountRate = parseFloat(rentalPct) / 100;

    if (isNaN(taxRate) || taxRate < 0 || taxRate > 1) {
      toast.error("Tax rate must be between 0 and 100.");
      return;
    }

    if (isNaN(rentalDiscountRate) || rentalDiscountRate < 0 || rentalDiscountRate > 1) {
      toast.error("Rental discount rate must be between 0 and 100.");
      return;
    }

    setIsSavingBusinessSettings(true);
    try {
      const settings = await saveBusinessSettings({
        taxRate,
        rentalDiscountRate,
        orgName,
        regionName,
        councilName,
        orgAddress,
        bankAccount1,
        bankAccount2,
        bankAccount3,
        bankAccount4,
        bankAccount5,
        reportPreparedByName,
        reportPreparedByTitle,
        reportVerifiedByName,
        reportVerifiedByTitle,
        reportApprovedByName,
        reportApprovedByTitle,
      });
      usePOSStore.getState().setTaxRate(settings.taxRate);
      toast.success("Business settings saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save business settings.";
      toast.error(message);
    } finally {
      setIsSavingBusinessSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">System configuration and application preferences.</p>
      </div>

      <Tabs defaultValue="business" className="space-y-4">
        <TabsList>
          <TabsTrigger value="business">Business Settings</TabsTrigger>
          {canManageReceiptSettings && <TabsTrigger value="receipt">Receipt Settings</TabsTrigger>}
          {canManageSeries && <TabsTrigger value="series">Receipt Series</TabsTrigger>}
          <TabsTrigger value="system">System Info</TabsTrigger>
          {isAdmin && <TabsTrigger value="audit">Audit Trail</TabsTrigger>}
        </TabsList>

        <TabsContent value="business">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Business Settings</CardTitle>
              <CardDescription>Configure tax and reporting details. These settings are shared across the system.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tax-rate">VAT / Tax Rate (%)</Label>
                  <p className="text-xs text-muted-foreground">Applied to all sales at checkout. Default: 12% (Philippines VAT).</p>
                  <Input id="tax-rate" type="number" min={0} max={100} step={0.1} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rental-discount">Rental Discount Rate (%)</Label>
                  <p className="text-xs text-muted-foreground">Applied to rental items for PWD, Senior Citizen, Council, and Council Staff.</p>
                  <Input id="rental-discount" type="number" min={0} max={100} step={0.1} value={rentalPct} onChange={(e) => setRentalPct(e.target.value)} className="w-40" />
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-semibold text-foreground">Organization Info</h3>
                <p className="-mt-2 text-xs text-muted-foreground">Used in SCRD and Income Statement exports, receipts, payroll, and accounting views.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region-name">Region</Label>
                    <Input id="region-name" value={regionName} onChange={(e) => setRegionName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="council-name">Council</Label>
                    <Input id="council-name" value={councilName} onChange={(e) => setCouncilName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-address">Office Address</Label>
                  <p className="text-xs text-muted-foreground">Printed on report letterheads and receipts.</p>
                  <Input id="org-address" value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} />
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-semibold text-foreground">Report Signatures</h3>
                <p className="-mt-2 text-xs text-muted-foreground">Names and titles printed on signature lines in DCCR, vouchers, and other official reports. Leave name blank to show a blank signature line.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prepared By</p>
                    <div className="space-y-2">
                      <Label htmlFor="prep-name">Name</Label>
                      <Input id="prep-name" value={reportPreparedByName} onChange={(e) => setReportPreparedByName(e.target.value)} placeholder="Leave blank for open signature line" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prep-title">Title</Label>
                      <Input id="prep-title" value={reportPreparedByTitle} onChange={(e) => setReportPreparedByTitle(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Verified By</p>
                    <div className="space-y-2">
                      <Label htmlFor="verified-name">Name</Label>
                      <Input id="verified-name" value={reportVerifiedByName} onChange={(e) => setReportVerifiedByName(e.target.value)} placeholder="Leave blank for open signature line" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="verified-title">Title</Label>
                      <Input id="verified-title" value={reportVerifiedByTitle} onChange={(e) => setReportVerifiedByTitle(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Approved By</p>
                    <div className="space-y-2">
                      <Label htmlFor="approved-name">Name</Label>
                      <Input id="approved-name" value={reportApprovedByName} onChange={(e) => setReportApprovedByName(e.target.value)} placeholder="Leave blank for open signature line" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="approved-title">Title</Label>
                      <Input id="approved-title" value={reportApprovedByTitle} onChange={(e) => setReportApprovedByTitle(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-semibold text-foreground">Bank Accounts</h3>
                <p className="-mt-2 text-xs text-muted-foreground">Account labels shown in the SCRD "Accounted For As Follows" section.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { id: "ba1", label: "Account 1 (General Ops)", value: bankAccount1, set: setBankAccount1 },
                    { id: "ba2", label: "Account 2 (Retirement Fund)", value: bankAccount2, set: setBankAccount2 },
                    { id: "ba3", label: "Account 3 (Capital - 1)", value: bankAccount3, set: setBankAccount3 },
                    { id: "ba4", label: "Account 4 (Capital - 2)", value: bankAccount4, set: setBankAccount4 },
                    { id: "ba5", label: "Account 5 (Capital - 3)", value: bankAccount5, set: setBankAccount5 },
                  ].map(({ id, label, value, set }) => (
                    <div key={id} className="space-y-1">
                      <Label htmlFor={id}>{label}</Label>
                      <Input id={id} value={value} onChange={(e) => set(e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={() => void handleSaveBusinessSettings()} className="gap-2" disabled={isSavingBusinessSettings}>
                <Save className="h-4 w-4" />
                {isSavingBusinessSettings ? "Saving..." : "Save"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {canManageReceiptSettings && (
          <TabsContent value="receipt">
            <ReceiptSettingsPage embedded />
          </TabsContent>
        )}

        <TabsContent value="system">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">Current User</CardTitle>
                <CardDescription>Logged-in account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{profile?.full_name ?? "-"}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Username</span>
                  <span className="font-medium font-mono">@{profile?.username ?? "-"}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Role</span>
                  <Badge variant="secondary" className="capitalize">{profile?.role ?? "-"}</Badge>
                </div>
                {profile?.branch && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Branch</span>
                      <span className="font-medium">{profile.branch}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">Application</CardTitle>
                <CardDescription>Software information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">System</span>
                  <span className="font-medium">GSP Business Suite</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Version</span>
                  <Badge variant="outline">1.0.0</Badge>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Database</span>
                  <Badge variant="default" className="bg-emerald-600">PostgreSQL</Badge>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Build</span>
                  <span className="font-medium text-muted-foreground">Vite + React 18 + TypeScript</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {canManageSeries && (
          <TabsContent value="series">
            <div className="space-y-4">
              {/* Warning banner when near limit */}
              {activeSeries && (() => {
                const remaining = activeSeries.to_number - activeSeries.current_number;
                return remaining <= 100 ? (
                  <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Series &quot;{activeSeries.series_label}&quot; has only {remaining} receipt{remaining !== 1 ? "s" : ""} remaining (ends at {activeSeries.to_number.toLocaleString()}).
                  </div>
                ) : null;
              })()}

              {/* Create new series */}
              {isAdmin && (
                <Card className="border-border/70 shadow-sm">
                  <CardHeader>
                    <CardTitle>New Receipt Series</CardTitle>
                    <CardDescription>Define a BIR-authorized receipt number range.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Series Label</Label>
                      <Input
                        placeholder="e.g. Series 001"
                        value={seriesForm.series_label}
                        onChange={(e) => setSeriesForm((p) => ({ ...p, series_label: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>From Number</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="1"
                        value={seriesForm.from_number}
                        onChange={(e) => setSeriesForm((p) => ({ ...p, from_number: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>To Number</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="1000"
                        value={seriesForm.to_number}
                        onChange={(e) => setSeriesForm((p) => ({ ...p, to_number: e.target.value }))}
                      />
                    </div>
                    <div className="sm:col-span-3 flex justify-end">
                      <Button onClick={handleCreateSeries} disabled={createSeriesMutation.isPending}>
                        {createSeriesMutation.isPending ? "Creating…" : "Create Series"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Series table */}
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>All Series</CardTitle>
                  <CardDescription>
                    {seriesList.length} series total
                    {activeSeries ? ` · Active: "${activeSeries.series_label}" (${activeSeries.current_number.toLocaleString()} / ${activeSeries.to_number.toLocaleString()})` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {seriesLoading ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                  ) : seriesList.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No series created yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Label</TableHead>
                          <TableHead>Range</TableHead>
                          <TableHead>Current</TableHead>
                          <TableHead>Remaining</TableHead>
                          <TableHead>Status</TableHead>
                          {isAdmin && <TableHead className="text-right">Action</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {seriesList.map((s) => {
                          const remaining = s.to_number - s.current_number;
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">{s.series_label}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {s.from_number.toLocaleString()} – {s.to_number.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm">{s.current_number.toLocaleString()}</TableCell>
                              <TableCell>
                                <span className={remaining <= 100 ? "font-semibold text-amber-600" : "text-sm"}>
                                  {remaining.toLocaleString()}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={s.is_active ? "default" : "secondary"}>
                                  {s.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              {isAdmin && (
                                <TableCell className="text-right">
                                  {!s.is_active && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={activateSeriesMutation.isPending}
                                      onClick={() => activateSeriesMutation.mutate(s.id)}
                                    >
                                      Set Active
                                    </Button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="audit">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <History className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>Audit Trail</CardTitle>
                    <CardDescription>Admin-only log of operational activity, including receipts, journal entries, payroll, inventory, and settings changes.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {auditEntries.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    No audit entries recorded yet.
                  </div>
                ) : (
                  auditEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border/70 bg-card px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{actionLabel(entry.action)}</Badge>
                          <Badge variant="outline" className="capitalize">{entry.entity_type.replaceAll("_", " ")}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString("en-PH", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">{entry.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.actor_name ?? "System"} · {entry.actor_username ? `@${entry.actor_username}` : "-"} · <span className="capitalize">{entry.actor_role ?? "-"}</span>
                        </p>
                        {(entry.entity_display_name || entry.target_user_name || entry.entity_id) && (
                          <p className="text-xs text-muted-foreground">
                            Record: {entry.entity_display_name ?? entry.target_user_name ?? entry.entity_id}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
