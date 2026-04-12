import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import api from "@/lib/api";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { CalendarIcon, RefreshCcw, Pencil, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RECEIPT_LAYOUT,
  DEFAULT_RECEIPT_FIELD_POSITIONS,
  DEFAULT_RECEIPT_ITEMS_LAYOUT,
  getReceiptFieldPositions,
  getReceiptItemsLayout,
  LocalReceiptSettings,
  PaperWidth,
  ReceiptFieldKey,
  ReceiptFieldPosition,
  ReceiptItemsLayout,
  ReceiptLayoutMode,
  clearLocalReceiptSettings,
  readLocalReceiptSettings,
  writeLocalReceiptSettings,
} from "@/modules/pos/utils/receiptSettingsStorage";

interface ReceiptSettingsRecord {
  id: string;
  start_number: number;
  end_number: number;
  current_number: number;
  date_issued: string;
  created_by: string | null;
  updated_at: string;
}

const RECEIPT_FIELD_LABELS: Record<ReceiptFieldKey, string> = {
  soldTo: "Sold To",
  date: "Date",
  tin: "TIN",
  term: "Term / Payment Term",
  address: "Address",
  businessStyle: "Business Style",
  amountWords: "Amount in Words",
  paymentMethod: "Form of Payment",
  paymentAmount: "Payment Amount",
  cashierName: "Cashier Name",
  totalSales: "Total Sales",
  totalDiscount: "Total Discount",
  totalAmountDue: "Total Amount Due",
};

export function ReceiptSettingsPage({ embedded = false }: { embedded?: boolean }) {
  const profile = useSessionStore(selectProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [startNumber, setStartNumber] = useState<number | "">("");
  const [endNumber, setEndNumber] = useState<number | "">("");
  const [currentNumber, setCurrentNumber] = useState<number | "">("");
  const [dateIssued, setDateIssued] = useState<Date | undefined>();
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>("a4");
  const [receiptLayout, setReceiptLayout] = useState<ReceiptLayoutMode>(DEFAULT_RECEIPT_LAYOUT);
  const [footerText, setFooterText] = useState("");
  const [receiptFieldPositions, setReceiptFieldPositions] = useState<Record<ReceiptFieldKey, ReceiptFieldPosition>>(
    DEFAULT_RECEIPT_FIELD_POSITIONS
  );
  const [receiptItemsLayout, setReceiptItemsLayout] = useState<ReceiptItemsLayout>(DEFAULT_RECEIPT_ITEMS_LAYOUT);

  // BIR Invoice Information (localStorage only)
  const [orgAddress, setOrgAddress] = useState("");
  const [orgTin, setOrgTin] = useState("");
  const [birAuthNo, setBirAuthNo] = useState("");
  const [birAuthDateIssued, setBirAuthDateIssued] = useState("");
  const [birSeriesLabel, setBirSeriesLabel] = useState("");
  const [printerAccredNo, setPrinterAccredNo] = useState("");
  const [printerAccredDate, setPrinterAccredDate] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [printerTin, setPrinterTin] = useState("");

  const nextNumber = useMemo(() => {
    if (typeof currentNumber !== "number") return null;
    if (typeof endNumber !== "number") return null;
    if (currentNumber > endNumber) return null;
    return currentNumber;
  }, [currentNumber, endNumber]);

  const loadSettings = async () => {
    setIsLoading(true);
    // Always load print preferences from localStorage (they are not stored on server)
    const localPrefs = readLocalReceiptSettings();
    setAutoPrint(localPrefs?.autoPrint ?? false);
    setPaperWidth(localPrefs?.paperWidth ?? "a4");
    setReceiptLayout(localPrefs?.receiptLayout ?? DEFAULT_RECEIPT_LAYOUT);
    setFooterText(localPrefs?.footerText ?? "");
    setReceiptFieldPositions(getReceiptFieldPositions(localPrefs));
    setReceiptItemsLayout(getReceiptItemsLayout(localPrefs));
    setOrgAddress(localPrefs?.orgAddress ?? "");
    setOrgTin(localPrefs?.orgTin ?? "");
    setBirAuthNo(localPrefs?.birAuthNo ?? "");
    setBirAuthDateIssued(localPrefs?.birAuthDateIssued ?? "");
    setBirSeriesLabel(localPrefs?.birSeriesLabel ?? "");
    setPrinterAccredNo(localPrefs?.printerAccredNo ?? "");
    setPrinterAccredDate(localPrefs?.printerAccredDate ?? "");
    setPrinterName(localPrefs?.printerName ?? "");
    setPrinterTin(localPrefs?.printerTin ?? "");

    try {
      const { settings } = await api.get<{ settings: ReceiptSettingsRecord | null }>("/receipt-settings");

      if (settings) {
        setRecordId(settings.id);
        setStartNumber(settings.start_number);
        setEndNumber(settings.end_number);
        setCurrentNumber(settings.current_number);
        setDateIssued(new Date(settings.date_issued));
        setLastUpdated(settings.updated_at);
        setUpdatedBy(settings.created_by);
      } else {
        // Fall back to local if no DB record exists yet
        const local = readLocalReceiptSettings();
        if (local) {
          setStartNumber(local.startNumber);
          setEndNumber(local.endNumber);
          setCurrentNumber(local.currentNumber);
          setDateIssued(new Date(local.dateIssued));
          setLastUpdated(local.updatedAt);
          setUpdatedBy(local.updatedBy ?? null);
        }
      }
    } catch (error) {
      console.error(error);
      // Fall back to local on API error
      const local = readLocalReceiptSettings();
      if (local) {
        setStartNumber(local.startNumber);
        setEndNumber(local.endNumber);
        setCurrentNumber(local.currentNumber);
        setDateIssued(new Date(local.dateIssued));
        setLastUpdated(local.updatedAt);
        setUpdatedBy(local.updatedBy ?? null);
      } else {
        const message = error instanceof Error ? error.message : "Unable to load receipt settings.";
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const validate = () => {
    if (typeof startNumber !== "number" || typeof endNumber !== "number") {
      toast.error("Start and end numbers are required.");
      return false;
    }
    if (startNumber >= endNumber) {
      toast.error("Start number must be less than end number.");
      return false;
    }
    if (!dateIssued) {
      toast.error("Select the issuance date.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const baseSettings = {
      startNumber: startNumber as number,
      endNumber: endNumber as number,
      currentNumber:
        typeof currentNumber === "number" && !isEditing ? currentNumber : (startNumber as number),
      dateIssued: (dateIssued ?? new Date()).toISOString().slice(0, 10),
    };

    try {
      const payload = {
        start_number: baseSettings.startNumber,
        end_number: baseSettings.endNumber,
        current_number: baseSettings.currentNumber,
        date_issued: baseSettings.dateIssued,
        created_by: profile?.id ?? null,
      };

      let data: ReceiptSettingsRecord;
      if (recordId && recordId !== "local") {
        const result = await api.patch<{ settings: ReceiptSettingsRecord }>(`/receipt-settings/${recordId}`, payload);
        data = result.settings;
      } else {
        const result = await api.post<{ settings: ReceiptSettingsRecord }>("/receipt-settings", payload);
        data = result.settings;
      }

      setRecordId(data.id);
      setLastUpdated(data.updated_at ?? new Date().toISOString());
      setUpdatedBy(data.created_by ?? profile?.id ?? null);
      setCurrentNumber(baseSettings.currentNumber);

      // Keep local in sync
      writeLocalReceiptSettings({
        startNumber: baseSettings.startNumber,
        endNumber: baseSettings.endNumber,
        currentNumber: baseSettings.currentNumber,
        dateIssued: baseSettings.dateIssued,
        updatedAt: data.updated_at ?? new Date().toISOString(),
        updatedBy: profile?.full_name ?? profile?.id ?? null,
        autoPrint,
        paperWidth,
        receiptLayout,
        footerText,
        receiptFieldPositions,
        receiptItemsLayout,
      });

      toast.success("Receipt series saved.");
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unable to save receipt settings.";
      toast.error(message);
    }
  };

  const handleReset = async () => {
    if (typeof startNumber !== "number") {
      toast.error("Set a start number before resetting.");
      return;
    }

    const resetNumber = startNumber;

    if (!recordId || recordId === "local") {
      toast.error("No receipt series found. Save one first.");
      return;
    }

    try {
      await api.patch(`/receipt-settings/${recordId}`, {
        current_number: resetNumber,
        created_by: profile?.id ?? null,
      });

      setCurrentNumber(resetNumber);
      setLastUpdated(new Date().toISOString());
      setUpdatedBy(profile?.id ?? null);

      const local = readLocalReceiptSettings();
      if (local) {
        writeLocalReceiptSettings({
          ...local,
          currentNumber: resetNumber,
          updatedAt: new Date().toISOString(),
          updatedBy: profile?.full_name ?? profile?.id ?? null,
        });
      }

      toast.success("Receipt series reset.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reset receipt series.";
      toast.error(message);
    }
  };

  const handleEditToggle = () => {
    setIsEditing((value) => !value);
  };

  const buildLocalSettings = (): LocalReceiptSettings => {
    const local = readLocalReceiptSettings();
    return {
      startNumber: typeof startNumber === "number" ? startNumber : 0,
      endNumber: typeof endNumber === "number" ? endNumber : 0,
      currentNumber: typeof currentNumber === "number" ? currentNumber : 0,
      dateIssued: dateIssued?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      updatedAt: local?.updatedAt ?? new Date().toISOString(),
      updatedBy: local?.updatedBy,
      autoPrint,
      paperWidth,
      receiptLayout,
      footerText,
      receiptFieldPositions,
      receiptItemsLayout,
      orgAddress,
      orgTin,
      birAuthNo,
      birAuthDateIssued,
      birSeriesLabel,
      printerAccredNo,
      printerAccredDate,
      printerName,
      printerTin,
    };
  };

  const handleSaveBirSettings = () => {
    writeLocalReceiptSettings(buildLocalSettings());
    toast.success("BIR invoice information saved.");
  };

  const handleSaveReceiptAlignment = () => {
    writeLocalReceiptSettings(buildLocalSettings());
    toast.success("Receipt alignment saved.");
  };

  const updateReceiptFieldPosition = (
    field: ReceiptFieldKey,
    property: keyof ReceiptFieldPosition,
    value: number
  ) => {
    setReceiptFieldPositions((current) => ({
      ...current,
      [field]: {
        ...current[field],
        [property]: value,
      },
    }));
  };

  const updateReceiptItemsLayout = (property: keyof ReceiptItemsLayout, value: number) => {
    setReceiptItemsLayout((current) => ({
      ...current,
      [property]: value,
    }));
  };

  const handleResetReceiptAlignment = () => {
    setReceiptFieldPositions(DEFAULT_RECEIPT_FIELD_POSITIONS);
    setReceiptItemsLayout(DEFAULT_RECEIPT_ITEMS_LAYOUT);
    writeLocalReceiptSettings({
      ...buildLocalSettings(),
      receiptFieldPositions: DEFAULT_RECEIPT_FIELD_POSITIONS,
      receiptItemsLayout: DEFAULT_RECEIPT_ITEMS_LAYOUT,
    });
    toast.success("Receipt alignment reset to defaults.");
  };

  const handleClearLocal = () => {
    clearLocalReceiptSettings();
    setRecordId(null);
    setStartNumber("");
    setEndNumber("");
    setCurrentNumber("");
    setDateIssued(undefined);
    setLastUpdated(null);
    setUpdatedBy(null);
    setAutoPrint(false);
    setPaperWidth("a4");
    setReceiptLayout(DEFAULT_RECEIPT_LAYOUT);
    setFooterText("");
    setReceiptFieldPositions(DEFAULT_RECEIPT_FIELD_POSITIONS);
    setReceiptItemsLayout(DEFAULT_RECEIPT_ITEMS_LAYOUT);
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Receipt Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage receipt numbering, print preferences, alignment, and BIR invoice details.
          </p>
        </div>
      )}

      <Tabs defaultValue="series" className="space-y-4">
        <TabsList>
          <TabsTrigger value="series">Receipt Series</TabsTrigger>
          <TabsTrigger value="print">Print Preferences</TabsTrigger>
          <TabsTrigger value="alignment">Receipt Alignment</TabsTrigger>
          <TabsTrigger value="bir">BIR Information</TabsTrigger>
        </TabsList>

        {/* ── Receipt Series ─────────────────────────────────────────────── */}
        <TabsContent value="series" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Receipt Series Management</CardTitle>
                <CardDescription>Configure your receipt numbering series and issuance date.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isLoading ? (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    Loading settings…
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="start-number">Start Receipt Number</Label>
                      <Input
                        id="start-number"
                        type="number"
                        value={startNumber ?? ""}
                        disabled={!isEditing && recordId !== null}
                        onChange={(event) => setStartNumber(Number(event.target.value) || "")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-number">End Receipt Number</Label>
                      <Input
                        id="end-number"
                        type="number"
                        value={endNumber ?? ""}
                        disabled={!isEditing && recordId !== null}
                        onChange={(event) => setEndNumber(Number(event.target.value) || "")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="current-number">Current Receipt Number</Label>
                      <Input
                        id="current-number"
                        type="number"
                        value={currentNumber ?? ""}
                        readOnly
                        className="bg-muted/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date Issued</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start", !dateIssued && "text-muted-foreground")}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateIssued ? format(dateIssued, "PPP") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateIssued}
                            onSelect={(value) => setDateIssued(value ?? undefined)}
                            disabled={(date) => date > new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={handleSave} className="gap-2">
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                  <Button variant="secondary" onClick={handleEditToggle} disabled={isLoading || !recordId}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {isEditing ? "Cancel Edit" : "Edit"}
                  </Button>
                  <Button variant="outline" onClick={handleReset} disabled={isLoading || !recordId} className="gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    Reset Series
                  </Button>
                  <Button variant="ghost" onClick={handleClearLocal} disabled={isLoading}>
                    Clear Local
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Series Summary</CardTitle>
                <CardDescription>A quick view of the active receipt range.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground">Active Range:</span>{" "}
                  {typeof startNumber === "number" && typeof endNumber === "number"
                    ? `${startNumber} – ${endNumber}`
                    : "Not configured"}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Next Receipt Number:</span>{" "}
                  {typeof nextNumber === "number" ? `#${nextNumber}` : "N/A"}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Issuance Date:</span>{" "}
                  {dateIssued ? format(dateIssued, "PPP") : "Not set"}
                </div>
                <Separator />
                <div>
                  <span className="font-semibold text-foreground">Last Updated:</span>{" "}
                  {lastUpdated ? format(new Date(lastUpdated), "PPP pp") : "—"}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Updated By:</span>{" "}
                  {updatedBy ?? "—"}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Print Preferences ──────────────────────────────────────────── */}
        <TabsContent value="print">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Print Preferences</CardTitle>
              <CardDescription>
                Configure automatic printing, paper size, layout, and footer text. Saved locally on this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="auto-print-switch" className="text-sm font-medium">
                    Auto-print on completion
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically open the print dialog when an order is completed.
                  </p>
                </div>
                <Switch
                  id="auto-print-switch"
                  checked={autoPrint}
                  onCheckedChange={(checked) => {
                    setAutoPrint(checked);
                    writeLocalReceiptSettings({ ...buildLocalSettings(), autoPrint: checked });
                  }}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Paper width</Label>
                  <p className="text-xs text-muted-foreground">Match this to your printer's paper size.</p>
                </div>
                <Select
                  value={paperWidth}
                  onValueChange={(value) => {
                    const w = value as PaperWidth;
                    setPaperWidth(w);
                    writeLocalReceiptSettings({ ...buildLocalSettings(), paperWidth: w });
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4 (default)</SelectItem>
                    <SelectItem value="80mm">80mm Thermal</SelectItem>
                    <SelectItem value="58mm">58mm Thermal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Receipt layout</Label>
                  <p className="text-xs text-muted-foreground">
                    Use "Pre-printed official form" when the paper already has the receipt design printed on it.
                  </p>
                </div>
                <Select
                  value={receiptLayout}
                  onValueChange={(value) => {
                    const layout = value as ReceiptLayoutMode;
                    setReceiptLayout(layout);
                    writeLocalReceiptSettings({ ...buildLocalSettings(), receiptLayout: layout });
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="template">Generated template</SelectItem>
                    <SelectItem value="preprinted">Pre-printed official form</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="footer-text" className="text-sm font-medium">Receipt Footer Text</Label>
                <p className="text-xs text-muted-foreground">
                  Appears at the bottom of every receipt. Use it for return policy, contact info, or a custom message.
                </p>
                <Textarea
                  id="footer-text"
                  rows={3}
                  placeholder="e.g. No exchange, no return. For inquiries call 09XX-XXX-XXXX."
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  onBlur={() => writeLocalReceiptSettings(buildLocalSettings())}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Receipt Alignment ──────────────────────────────────────────── */}
        <TabsContent value="alignment">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Pre-printed Receipt Alignment</CardTitle>
              <CardDescription>
                Adjust exact print positions for the official pre-printed receipt form. All values are in millimeters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
                Start with small changes like <code>0.5</code> or <code>1</code>. Increase X to move right, increase Y to move down.
                Save, print a test receipt, then fine-tune until text lands on the pre-printed lines.
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Items Table</p>
                  <p className="text-xs text-muted-foreground">
                    Controls the repeated item descriptions and amounts on the left side of the form.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(["descriptionX", "amountX", "startY", "rowGap", "descriptionWidth", "amountWidth", "fontSize"] as const).map((key) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`items-${key}`}>{key.replace(/([A-Z])/g, " $1").trim()}</Label>
                      <Input
                        id={`items-${key}`}
                        type="number"
                        step="0.1"
                        value={receiptItemsLayout[key]}
                        onChange={(e) => updateReceiptItemsLayout(key, Number(e.target.value) || 0)}
                      />
                    </div>
                  ))}
                  <div className="space-y-2">
                    <Label htmlFor="items-maxRows">Max Rows</Label>
                    <Input
                      id="items-maxRows"
                      type="number"
                      step="1"
                      value={receiptItemsLayout.maxRows}
                      onChange={(e) => updateReceiptItemsLayout("maxRows", Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Individual Fields</p>
                  <p className="text-xs text-muted-foreground">Set exact X, Y, width, and font size per field.</p>
                </div>
                <div className="space-y-4">
                  {(Object.keys(RECEIPT_FIELD_LABELS) as ReceiptFieldKey[]).map((field) => (
                    <div key={field} className="rounded-lg border border-border/60 p-4">
                      <p className="mb-3 text-sm font-medium text-foreground">{RECEIPT_FIELD_LABELS[field]}</p>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {(["x", "y", "width", "fontSize"] as const).map((prop) => (
                          <div key={prop} className="space-y-2">
                            <Label htmlFor={`${field}-${prop}`}>{prop === "fontSize" ? "Font Size" : prop.toUpperCase()}</Label>
                            <Input
                              id={`${field}-${prop}`}
                              type="number"
                              step="0.1"
                              value={receiptFieldPositions[field][prop]}
                              onChange={(e) => updateReceiptFieldPosition(field, prop, Number(e.target.value) || 0)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSaveReceiptAlignment}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Alignment
                </Button>
                <Button variant="outline" onClick={handleResetReceiptAlignment}>Reset to Defaults</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BIR Information ────────────────────────────────────────────── */}
        <TabsContent value="bir">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>BIR Invoice Information</CardTitle>
              <CardDescription>
                Details printed on official BIR Sales/Service Invoices. Saved locally on this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="org-address">Organization Address</Label>
                  <Input
                    id="org-address"
                    placeholder="e.g. Plaza Burgos Ilocos Sur 2700, City of Vigan..."
                    value={orgAddress}
                    onChange={(e) => setOrgAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-tin">Organization TIN (Non-VAT Reg.)</Label>
                  <Input
                    id="org-tin"
                    placeholder="e.g. 000-123-456-000"
                    value={orgTin}
                    onChange={(e) => setOrgTin(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bir-series-label">BIR Series Label</Label>
                  <Input
                    id="bir-series-label"
                    placeholder="e.g. 200 Bklts. 50x2 30001-40000"
                    value={birSeriesLabel}
                    onChange={(e) => setBirSeriesLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bir-auth-no">BIR Authority to Print No.</Label>
                  <Input
                    id="bir-auth-no"
                    placeholder="e.g. 12AB2025-00123"
                    value={birAuthNo}
                    onChange={(e) => setBirAuthNo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bir-auth-date">BIR Auth. Date Issued</Label>
                  <Input
                    id="bir-auth-date"
                    placeholder="e.g. January 15, 2025"
                    value={birAuthDateIssued}
                    onChange={(e) => setBirAuthDateIssued(e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <p className="mb-3 text-sm font-medium text-foreground">Printer Information</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="printer-name">Printer Name</Label>
                    <Input
                      id="printer-name"
                      placeholder="e.g. ABC Printing Press"
                      value={printerName}
                      onChange={(e) => setPrinterName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="printer-tin">Printer TIN</Label>
                    <Input
                      id="printer-tin"
                      placeholder="e.g. 000-456-789-000"
                      value={printerTin}
                      onChange={(e) => setPrinterTin(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="printer-accred-no">Printer Accreditation No.</Label>
                    <Input
                      id="printer-accred-no"
                      placeholder="e.g. ACC-2025-00456"
                      value={printerAccredNo}
                      onChange={(e) => setPrinterAccredNo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="printer-accred-date">Printer Accreditation Date</Label>
                    <Input
                      id="printer-accred-date"
                      placeholder="e.g. March 1, 2025"
                      value={printerAccredDate}
                      onChange={(e) => setPrinterAccredDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveBirSettings} className="gap-2">
                <Save className="h-4 w-4" />
                Save BIR Information
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
