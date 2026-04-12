import { useEffect, useMemo, useState } from "react";
import Barcode from "react-barcode";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BARCODE_PRINT_PRESETS,
  BarcodePrintPresetId,
  getBarcodePrintPreset,
  openBarcodePrintWindow,
} from "@/modules/pos/utils/barcodePrint";
import { formatCurrency } from "@/utils/format";

type ProductPayload = {
  id?: string;
  sku: string;
  name: string;
  stock_quantity: number;
  size?: string | null;
  selling_price?: number | null;
};

type Props = {
  product: ProductPayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PrintBarcodesDialog({ product, open, onOpenChange }: Props) {
  const [copies, setCopies] = useState(1);
  const [presetId, setPresetId] = useState<BarcodePrintPresetId>("retail");
  const [showName, setShowName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  useEffect(() => {
    if (product && open) {
      setCopies(Math.max(1, product.stock_quantity));
    }
  }, [product, open]);

  const preset = getBarcodePrintPreset(presetId);

  const displayName = useMemo(() => {
    if (!product) return "";
    return product.size ? `${product.name} (${product.size})` : product.name;
  }, [product]);

  const previewCopies = Math.max(1, Math.min(9999, Math.floor(copies || 1)));

  const handlePrint = () => {
    if (!product) return;

    const barcodeValue = product.sku?.trim();
    if (!barcodeValue) {
      toast.error("This product has no SKU to encode as a barcode.");
      return;
    }

    const result = openBarcodePrintWindow(
      [
        {
          product: {
            sku: barcodeValue,
            name: product.name,
            size: product.size,
            selling_price: product.selling_price ?? null,
          },
          qty: previewCopies,
        },
      ],
      { presetId, showName, showSku, showPrice },
      `Barcodes - ${displayName}`
    );

    if (!result.ok) {
      toast.error(result.reason);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Print Barcodes</DialogTitle>
          <DialogDescription>
            {displayName} · SKU: <span className="font-mono">{product.sku}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-semibold text-foreground">Print setup</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose the label style and which details should appear on the printed sticker.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="barcode-preset">Label preset</Label>
              <Select value={presetId} onValueChange={(value) => setPresetId(value as BarcodePrintPresetId)}>
                <SelectTrigger id="barcode-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BARCODE_PRINT_PRESETS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{preset.description}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="barcode-copies">Copies to print</Label>
              <Input
                id="barcode-copies"
                type="number"
                min={1}
                max={9999}
                step={1}
                value={copies}
                onChange={(event) => setCopies(Math.max(1, Math.min(9999, Number(event.target.value))))}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to current stock quantity ({product.stock_quantity} units)
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">Printed fields</p>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="show-name" className="text-sm">Product name</Label>
                <Checkbox id="show-name" checked={showName} onCheckedChange={(checked) => setShowName(Boolean(checked))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="show-sku" className="text-sm">SKU text</Label>
                <Checkbox id="show-sku" checked={showSku} onCheckedChange={(checked) => setShowSku(Boolean(checked))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="show-price" className="text-sm">Price</Label>
                  <p className="text-xs text-muted-foreground">
                    {product.selling_price != null ? formatCurrency(product.selling_price) : "No price available"}
                  </p>
                </div>
                <Checkbox
                  id="show-price"
                  checked={showPrice}
                  disabled={product.selling_price == null}
                  onCheckedChange={(checked) => setShowPrice(Boolean(checked))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Preview</p>
                <p className="text-xs text-muted-foreground">This is how one printed label will look.</p>
              </div>
              <Badge variant="secondary">
                {previewCopies} copy{previewCopies !== 1 ? "ies" : ""}
              </Badge>
            </div>

            <div className="rounded-[1.5rem] border border-border bg-slate-50 p-5">
              <div
                className="mx-auto flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-center"
                style={{
                  width: preset.id === "compact" ? "12rem" : preset.id === "retail" ? "14rem" : "17rem",
                  minHeight: preset.id === "compact" ? "7rem" : preset.id === "retail" ? "8.5rem" : "10rem",
                }}
              >
                {showName ? (
                  <p className="line-clamp-2 text-center text-sm font-semibold text-slate-900">{displayName}</p>
                ) : null}
                <Barcode
                  value={product.sku}
                  format="CODE128"
                  displayValue={false}
                  lineColor="#000000"
                  width={preset.barcodeWidth}
                  height={preset.barcodeHeight}
                  margin={preset.barcodeMargin}
                />
                {showSku ? <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-600">{product.sku}</p> : null}
                {showPrice && product.selling_price != null ? (
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(product.selling_price)}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={!product.sku}>
            <Printer className="mr-2 h-4 w-4" />
            Print {previewCopies} Barcode{previewCopies !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
