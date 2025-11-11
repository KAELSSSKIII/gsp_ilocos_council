import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { demoProducts } from "@/utils/demo-data";
import { useRentalAvailability } from "@/modules/pos/hooks/useRentalAvailability";
import { cn } from "@/lib/utils";

type InventoryRow = {
  id: string;
  name: string;
  category: string;
  stock: number;
  price: number;
};

const fallbackCategories = [
  "Uniforms",
  "Accessories",
  "Merit Badges",
  "Hall Rental",
  "Room Rental",
  "Hall & Room Rentals",
];

const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, " ");

const formatInventoryName = (name: string, _category: string, size?: string | null) => {
  if (size && size.trim().length > 0) {
    return size;
  }
  return name;
};

const CATEGORY_NAME_REPLACEMENTS: Record<string, string> = {
  "BERMUDA SHORT-Senior & Cadet": "BERMUDA SHORT-Sen&Cad",
  "BERMUDA SHORTS (Star & Junior)": "BERMUDA SHORTS (Sta&Jun)",
  "BERMUDA SHORTS (Star & Junio)": "BERMUDA SHORTS (Sta&Jun)",
};

const formatInventoryCategory = (category: string): string => {
  const trimmed = category?.trim?.() ?? "";
  if (!trimmed) return "Uncategorised";
  return CATEGORY_NAME_REPLACEMENTS[trimmed] ?? trimmed;
};

const mapDemoProducts = (): InventoryRow[] =>
  demoProducts.map((product) => ({
    id: product.id,
    name: product.name,
    category: formatInventoryCategory(product.category ?? "Other"),
    stock: product.stock_quantity ?? 0,
    price: product.selling_price ?? 0,
  }));

const fetchInventoryRows = async (): Promise<InventoryRow[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,size,selling_price,stock_quantity,category:product_categories(name)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const categoryName = formatInventoryCategory(row.category?.name ?? "Uncategorised");
    return {
      id: row.id,
      category: categoryName,
      name: formatInventoryName(row.name, categoryName, row.size),
      stock: Number(row.stock_quantity ?? 0),
      price: Number(row.selling_price ?? 0),
    };
  });
};

export function InventoryReportPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createdCategoryNames, setCreatedCategoryNames] = useState<string[]>([]);
  const addCategoryName = useCallback((name: string) => {
    setCreatedCategoryNames((previous) => {
      const next = new Set(previous);
      next.add(name);
      return Array.from(next).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    });
  }, []);
  const { spaces: rentalSpaces } = useRentalAvailability();

  const { data: inventoryRows = [], isLoading, refetch: refetchInventoryRows } = useQuery({
    queryKey: ["inventory-report"],
    enabled: isSupabaseConfigured,
    queryFn: fetchInventoryRows,
  });

  const openCategoryDialog = useCallback(() => {
    setNewCategoryName("");
    setCreatingCategory(false);
    setCategoryDialogOpen(true);
  }, []);

  const closeCategoryDialog = useCallback(() => {
    setCategoryDialogOpen(false);
    setNewCategoryName("");
    setCreatingCategory(false);
  }, []);

  const handleCategoryDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeCategoryDialog();
      }
    },
    [closeCategoryDialog]
  );

  const handleCreateCategory = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error("Enter a category name.");
      return;
    }

    const normalized = normalizeCategoryName(trimmed);

    if (normalized.length < 2) {
      toast.error("Category name must be at least 2 characters.");
      return;
    }

    setCreatingCategory(true);
    try {
      let createdName = normalized;

      if (!isSupabaseConfigured) {
        addCategoryName(createdName);
        toast.success("Category created (demo mode)");
      } else {
        const { data, error } = await supabase
          .from("product_categories")
          .insert({ name: normalized })
          .select("name")
          .single();

        if (error) throw error;

        createdName = data?.name ?? normalized;
        addCategoryName(createdName);
        toast.success("Category created");
        await refetchInventoryRows();
      }

      setSelectedCategory(createdName);
      closeCategoryDialog();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to create category.";
      toast.error(message);
    } finally {
      setCreatingCategory(false);
    }
  }, [
    addCategoryName,
    closeCategoryDialog,
    isSupabaseConfigured,
    newCategoryName,
    refetchInventoryRows,
  ]);

  const rows = useMemo(() => {
    if (isSupabaseConfigured) {
      return inventoryRows;
    }
    const mapped = mapDemoProducts();
    const rentalSpaceNames = new Map(rentalSpaces.map((space) => [space.product_id, space.name]));
    return mapped.map((row) =>
      rentalSpaceNames.has(row.id)
        ? { ...row, name: rentalSpaceNames.get(row.id) ?? row.name, category: "Rentals" }
        : row
    );
  }, [inventoryRows, rentalSpaces]);

  const categories = useMemo(() => {
    const source = rows.length ? rows.map((row) => row.category) : fallbackCategories;
    const combined = new Set(source);
    createdCategoryNames.forEach((name) => combined.add(name));
    return [
      "all",
      ...Array.from(combined).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    ];
  }, [rows, createdCategoryNames]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => (selectedCategory === "all" ? true : row.category === selectedCategory))
      .filter((row) => (!query ? true : row.name.toLowerCase().includes(query)));
  }, [rows, selectedCategory, search]);

  const totals = useMemo(() => {
    const totalQuantity = filteredRows.reduce((acc, row) => acc + row.stock, 0);
    const totalValue = filteredRows.reduce((acc, row) => acc + row.stock * row.price, 0);
    return { totalQuantity, totalValue };
  }, [filteredRows]);

  const formatCurrencyForPdf = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      currencyDisplay: "code",
      minimumFractionDigits: 2,
    })
      .format(value)
      .replace(/\u00A0/g, " ");

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const generatedAt = format(new Date(), "MMMM d, yyyy h:mm a");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Girl Scout Business Suite", 14, 16);
    doc.setFontSize(14);
    doc.text("Inventory Report", 14, 26);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${generatedAt}`, 14, 35);
    if (selectedCategory !== "all") {
      doc.text(`Category: ${selectedCategory}`, 14, 42);
    }
    if (search.trim()) {
      doc.text(`Filtered by: ${search.trim()}`, 14, 49);
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const colX = [14, 95, 150, 190, 240];
    const headers = ["Item Name", "Category", "Stock", "Unit Price", "Total Value"];
    let y = 60;

    const drawHeader = () => {
      doc.setFillColor(16, 87, 60);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.rect(12, y - 6, pageWidth - 24, 10, "F");
      headers.forEach((header, index) => {
        const align = index >= 2 ? "right" : "left";
        doc.text(header, colX[index], y, { align });
      });
      doc.setTextColor(33, 33, 33);
      doc.setFont("helvetica", "normal");
      y += 6;
      doc.line(12, y, pageWidth - 12, y);
      y += 4;
    };

    const drawRow = (row: InventoryRow) => {
      doc.setFontSize(10);
      doc.text(row.name, colX[0], y);
      doc.text(row.category, colX[1], y);
      doc.text(row.stock.toLocaleString(), colX[2], y, { align: "right" });
      doc.text(formatCurrencyForPdf(row.price), colX[3], y, { align: "right" });
      doc.text(formatCurrencyForPdf(row.price * row.stock), colX[4], y, { align: "right" });
      y += 6;
    };

    drawHeader();

    filteredRows.forEach((row) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 30;
        drawHeader();
      }
      drawRow(row);
    });

    if (!filteredRows.length) {
      doc.text("No inventory items match your filters.", 14, y + 6);
    }

    if (y > pageHeight - 30) {
      doc.addPage();
      y = 30;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const summaryY = y + 14;
    doc.text(`Items: ${filteredRows.length.toLocaleString()}`, 14, summaryY);
    doc.text(`Total Qty: ${totals.totalQuantity.toLocaleString()}`, 80, summaryY);
    doc.text(`Total Value: ${formatCurrencyForPdf(totals.totalValue)}`, 180, summaryY);

    doc.save(`inventory-report-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
  };

  return (
    <div className="pb-24">
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-emerald-900">Inventory Report</h1>
            <p className="text-sm text-emerald-800/80">Stay on top of stock levels and valuation across categories.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-10 w-full rounded-xl border-emerald-200 bg-white text-emerald-700 shadow-sm sm:w-56">
                  <SelectValue placeholder="Filter category" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-emerald-200 shadow-lg">
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category === "all" ? "All Categories" : category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={openCategoryDialog}
                disabled={creatingCategory}
              >
                <span className="sr-only">Add category</span>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Input
              placeholder="Search items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-xl border-emerald-200 bg-white text-sm shadow-sm sm:w-56"
            />
            <Button onClick={generatePDF} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm shadow hover:bg-emerald-700">
              Generate PDF
            </Button>
          </div>
        </div>

        <Card className="rounded-2xl border border-emerald-200/70 bg-white shadow-lg">
          <CardHeader className="flex flex-col gap-1 border-b border-emerald-100 pb-4">
            <CardTitle className="text-lg font-semibold text-emerald-900">Inventory Snapshot</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-700 sm:text-sm">
              <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">
                Items: {filteredRows.length}
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">
                Total Qty: {totals.totalQuantity.toLocaleString()}
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">
                Total Value: ₱{totals.totalValue.toFixed(2)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[70vh]">
              <table className="min-w-full divide-y divide-emerald-100 text-left text-sm text-emerald-900">
                <thead className="bg-emerald-50 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  <tr>
                    <th className="px-4 py-3">Item Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Current Stock</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-emerald-50/70">
                      <td className="px-4 py-3">{row.name}</td>
                      <td className="px-4 py-3">{row.category}</td>
                      <td className="px-4 py-3 text-right">{row.stock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">₱{row.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₱{(row.stock * row.price).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!filteredRows.length && !isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-emerald-700">
                        No inventory items match your filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </ScrollArea>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-emerald-700">
                <span className="h-2 w-2 animate-ping rounded-full bg-emerald-500" />
                Loading inventory…
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={categoryDialogOpen} onOpenChange={handleCategoryDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Inventory Category</DialogTitle>
            <DialogDescription>Add a new grouping for products and rentals.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800">
              <Tag className="h-4 w-4 text-emerald-600" />
              Categories help segment inventory across reports and the POS.
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inventory-new-category">Category name</Label>
              <Input
                id="inventory-new-category"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="e.g. Camping Gear"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeCategoryDialog} disabled={creatingCategory}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateCategory} disabled={creatingCategory}>
              {creatingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


