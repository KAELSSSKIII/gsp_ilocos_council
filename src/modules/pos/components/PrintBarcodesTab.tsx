import { useCallback, useEffect, useMemo, useState } from "react";
import Barcode from "react-barcode";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  BARCODE_PRINT_PRESETS,
  BarcodePrintPresetId,
  getBarcodePrintPreset,
  openBarcodePrintWindow,
} from "@/modules/pos/utils/barcodePrint";
import { formatCurrency, formatNumber } from "@/utils/format";

type CategoryOption = {
  id: string;
  name: string;
};

type ProductPayload = {
  id?: string;
  sku: string;
  name: string;
  stock_quantity: number;
  category_id?: string | null;
  size?: string | null;
  is_active: boolean;
  is_rental?: boolean;
  rental_space_id?: string | null;
  selling_price?: number | null;
};

type Props = {
  products: ProductPayload[];
  categories: CategoryOption[];
};

const isRentalProduct = (product: ProductPayload) => Boolean(product.is_rental || product.rental_space_id);

export function PrintBarcodesTab({ products, categories }: Props) {
  const [filterCategory, setFilterCategory] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [presetId, setPresetId] = useState<BarcodePrintPresetId>("retail");
  const [showName, setShowName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  const printableProducts = useMemo(
    () => products.filter((product) => product.is_active && product.sku?.trim() && !isRentalProduct(product)),
    [products]
  );

  const visibleProducts = useMemo(() => {
    if (filterCategory === "all") return printableProducts;
    return printableProducts.filter((product) => product.category_id === filterCategory);
  }, [filterCategory, printableProducts]);

  useEffect(() => {
    const nextChecked = new Set<string>();
    const nextQuantities: Record<string, number> = {};

    visibleProducts.forEach((product) => {
      if (product.id) {
        nextChecked.add(product.id);
        nextQuantities[product.id] = Math.max(1, product.stock_quantity);
      }
    });

    setChecked(nextChecked);
    setQuantities(nextQuantities);
  }, [filterCategory, visibleProducts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkedProducts = useMemo(
    () =>
      visibleProducts
        .filter((product) => product.id && checked.has(product.id))
        .map((product) => ({ product, qty: quantities[product.id!] ?? 1 })),
    [checked, quantities, visibleProducts]
  );

  const totalLabels = checkedProducts.reduce((sum, { qty }) => sum + qty, 0);

  const availableCategories = useMemo(() => {
    const ids = new Set(printableProducts.map((product) => product.category_id).filter(Boolean));
    return categories.filter((category) => ids.has(category.id));
  }, [categories, printableProducts]);

  const previewProduct = checkedProducts[0]?.product ?? visibleProducts[0] ?? null;
  const preset = getBarcodePrintPreset(presetId);

  const toggleCheck = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const checkAll = useCallback(() => {
    setChecked(new Set(visibleProducts.map((product) => product.id!).filter(Boolean)));
  }, [visibleProducts]);

  const uncheckAll = useCallback(() => setChecked(new Set()), []);

  const resetQty = useCallback(() => {
    const next: Record<string, number> = {};
    visibleProducts.forEach((product) => {
      if (product.id) next[product.id] = Math.max(1, product.stock_quantity);
    });
    setQuantities((current) => ({ ...current, ...next }));
  }, [visibleProducts]);

  const setQty = (id: string, value: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(1, Math.min(9999, Math.floor(value || 1))),
    }));
  };

  const handlePrint = useCallback(() => {
    if (!checkedProducts.length) {
      toast.error("Select at least one product to print.");
      return;
    }

    const result = openBarcodePrintWindow(
      checkedProducts.map(({ product, qty }) => ({
        product: {
          sku: product.sku,
          name: product.name,
          size: product.size,
          selling_price: product.selling_price ?? null,
        },
        qty,
      })),
      { presetId, showName, showSku, showPrice },
      "Product Barcodes"
    );

    if (!result.ok) {
      toast.error(result.reason);
    }
  }, [checkedProducts, presetId, showName, showSku, showPrice]);

  return (
    <div className="space-y-5 pt-4">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4 rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-10 w-56">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={presetId} onValueChange={(value) => setPresetId(value as BarcodePrintPresetId)}>
              <SelectTrigger className="h-10 w-52">
                <SelectValue placeholder="Label preset" />
              </SelectTrigger>
              <SelectContent>
                {BARCODE_PRINT_PRESETS.map((presetOption) => (
                  <SelectItem key={presetOption.id} value={presetOption.id}>
                    {presetOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={checkAll}>
                Check All
              </Button>
              <Button variant="outline" size="sm" onClick={uncheckAll}>
                Uncheck All
              </Button>
              <Button variant="outline" size="sm" onClick={resetQty}>
                Reset Qty
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
              <Label htmlFor="bulk-show-name" className="text-sm">Show name</Label>
              <Checkbox id="bulk-show-name" checked={showName} onCheckedChange={(checked) => setShowName(Boolean(checked))} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
              <Label htmlFor="bulk-show-sku" className="text-sm">Show SKU</Label>
              <Checkbox id="bulk-show-sku" checked={showSku} onCheckedChange={(checked) => setShowSku(Boolean(checked))} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
              <Label htmlFor="bulk-show-price" className="text-sm">Show price</Label>
              <Checkbox id="bulk-show-price" checked={showPrice} onCheckedChange={(checked) => setShowPrice(Boolean(checked))} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Batch summary</p>
              <p className="text-xs text-muted-foreground">{preset.description}</p>
            </div>
            <div className="flex items-center gap-3">
              {checkedProducts.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {checkedProducts.length} product{checkedProducts.length !== 1 ? "s" : ""} · {totalLabels.toLocaleString()} labels
                </span>
              )}
              <Button onClick={handlePrint} disabled={checkedProducts.length === 0} className="flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Print Batch
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Sample Preview</p>
              <p className="text-xs text-muted-foreground">Uses the first selected product as the sample.</p>
            </div>
            <Badge variant="secondary">{preset.label}</Badge>
          </div>

          {previewProduct ? (
            <div className="mt-4 rounded-[1.5rem] border border-dashed border-border bg-slate-50 p-4">
              <div
                className="mx-auto flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-4 text-center"
                style={{
                  width: preset.id === "compact" ? "12rem" : preset.id === "retail" ? "14rem" : "17rem",
                  minHeight: preset.id === "compact" ? "7rem" : preset.id === "retail" ? "8.5rem" : "10rem",
                }}
              >
                {showName ? (
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                    {previewProduct.size ? `${previewProduct.name} (${previewProduct.size})` : previewProduct.name}
                  </p>
                ) : null}
                <Barcode
                  value={previewProduct.sku}
                  format="CODE128"
                  displayValue={false}
                  lineColor="#000000"
                  width={preset.barcodeWidth}
                  height={preset.barcodeHeight}
                  margin={preset.barcodeMargin}
                />
                {showSku ? (
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-600">{previewProduct.sku}</p>
                ) : null}
                {showPrice && previewProduct.selling_price != null ? (
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(previewProduct.selling_price)}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Select a printable product to see a sample label.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={visibleProducts.length > 0 && visibleProducts.every((product) => product.id && checked.has(product.id))}
                  onCheckedChange={(value) => (value ? checkAll() : uncheckAll())}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="w-[160px]">SKU</TableHead>
              <TableHead className="w-[110px] text-center">Stock</TableHead>
              <TableHead className="w-[130px] text-center">Price</TableHead>
              <TableHead className="w-[150px] text-center">Copies</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No printable products in this category.
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((product) => {
                const id = product.id!;
                const isChecked = checked.has(id);
                const qty = quantities[id] ?? Math.max(1, product.stock_quantity);
                const displayName = product.size ? `${product.name} (${product.size})` : product.name;

                return (
                  <TableRow key={id} className={isChecked ? "" : "opacity-50"} onClick={() => toggleCheck(id)}>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleCheck(id)}
                        aria-label={`Select ${product.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{displayName}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{product.sku}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{formatNumber(product.stock_quantity)}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {product.selling_price != null ? formatCurrency(product.selling_price) : "--"}
                    </TableCell>
                    <TableCell className="text-center" onClick={(event) => event.stopPropagation()}>
                      <Input
                        type="number"
                        min={1}
                        max={9999}
                        step={1}
                        value={qty}
                        onChange={(event) => setQty(id, Number(event.target.value))}
                        className="mx-auto h-8 w-20 text-center"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {printableProducts.length === 0 && products.length > 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No products with SKUs found. Add SKUs to products to enable barcode printing.
        </p>
      )}
    </div>
  );
}
