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
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { CalendarIcon, RefreshCcw, Pencil, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LocalReceiptSettings,
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

export function ReceiptSettingsPage() {
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

  const nextNumber = useMemo(() => {
    if (typeof currentNumber !== "number") return null;
    if (typeof endNumber !== "number") return null;
    if (currentNumber > endNumber) return null;
    return currentNumber;
  }, [currentNumber, endNumber]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured) {
        const local = readLocalReceiptSettings();
        if (local) {
          setStartNumber(local.startNumber);
          setEndNumber(local.endNumber);
          setCurrentNumber(local.currentNumber);
          setDateIssued(new Date(local.dateIssued));
          setLastUpdated(local.updatedAt);
          setUpdatedBy(local.updatedBy ?? null);
        }
        return;
      }

      const { data, error } = await supabase
        .from("receipt_settings")
        .select("id,start_number,end_number,current_number,date_issued,created_by,updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setRecordId(data.id);
        setStartNumber(data.start_number);
        setEndNumber(data.end_number);
        setCurrentNumber(data.current_number);
        setDateIssued(new Date(data.date_issued));
        setLastUpdated(data.updated_at);
        setUpdatedBy(data.created_by);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unable to load receipt settings.";
      toast.error(message);
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

  const persistLocalSettings = (settings: LocalReceiptSettings) => {
    writeLocalReceiptSettings(settings);
    setLastUpdated(settings.updatedAt);
    setUpdatedBy(settings.updatedBy ?? null);
    setRecordId("local");
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

    if (!isSupabaseConfigured) {
      const payload: LocalReceiptSettings = {
        ...baseSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: profile?.full_name ?? profile?.id ?? null,
      };
      persistLocalSettings(payload);
      setCurrentNumber(payload.currentNumber);
      toast.success("Receipt series saved locally.");
      setIsEditing(false);
      return;
    }

    try {
      const payload = {
        start_number: baseSettings.startNumber,
        end_number: baseSettings.endNumber,
        current_number: baseSettings.currentNumber,
        date_issued: baseSettings.dateIssued,
        created_by: profile?.id ?? null,
      };

      const { data, error } = recordId
        ? await supabase
            .from("receipt_settings")
            .update(payload)
            .eq("id", recordId)
            .select()
            .single()
        : await supabase.from("receipt_settings").insert(payload).select().single();

      if (error) throw error;

      if (data && "id" in data && data.id) {
        setRecordId(data.id);
        setLastUpdated(data.updated_at ?? new Date().toISOString());
        setUpdatedBy(data.created_by ?? profile?.id ?? null);
      } else {
        setLastUpdated(new Date().toISOString());
        setUpdatedBy(profile?.id ?? null);
      }

      setCurrentNumber(baseSettings.currentNumber);
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

    if (!isSupabaseConfigured) {
      const local = readLocalReceiptSettings();
      if (!local) {
        toast.error("No local series configured.");
        return;
      }

      const payload: LocalReceiptSettings = {
        ...local,
        currentNumber: resetNumber,
        updatedAt: new Date().toISOString(),
        updatedBy: profile?.full_name ?? profile?.id ?? null,
      };
      persistLocalSettings(payload);
      setCurrentNumber(resetNumber);
      toast.success("Series reset locally.");
      return;
    }

    if (!recordId) {
      toast.error("No receipt series found. Save one first.");
      return;
    }

    try {
      const { error } = await supabase
        .from("receipt_settings")
        .update({
          current_number: resetNumber,
          updated_at: new Date().toISOString(),
          created_by: profile?.id ?? null,
        })
        .eq("id", recordId);

      if (error) throw error;

      setCurrentNumber(resetNumber);
      setLastUpdated(new Date().toISOString());
      setUpdatedBy(profile?.id ?? null);
      toast.success("Receipt series reset.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reset receipt series.";
      toast.error(message);
    }
  };

  const handleEditToggle = () => {
    setIsEditing((value) => !value);
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
  };

  return (
    <div className="space-y-6 pb-24">
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Receipt Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage receipt numbering series, issuance dates, and monitor the next available
              receipt.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {lastUpdated ? `Last updated ${format(new Date(lastUpdated), "PPpp")}` : "No series yet"}
            {updatedBy ? ` · Updated by ${updatedBy}` : ""}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 sm:px-6 lg:px-8 lg:grid-cols-[3fr_2fr]">
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
                        className={cn(
                          "w-full justify-start",
                          !dateIssued && "text-muted-foreground"
                        )}
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
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isLoading || (!recordId && !isSupabaseConfigured)}
                className="gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                Reset Series
              </Button>
              {!isSupabaseConfigured ? (
                <Button variant="ghost" onClick={handleClearLocal} disabled={isLoading}>
                  Clear Local
                </Button>
              ) : null}
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
    </div>
  );
}


