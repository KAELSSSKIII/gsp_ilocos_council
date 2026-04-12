import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { readBusinessSettings } from "@/utils/businessSettings";
import { formatCurrencyForPdf } from "@/utils/format";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Tag, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useRentalAvailability } from "@/modules/pos/hooks/useRentalAvailability";
import { cn } from "@/lib/utils";

type InventoryRow = {
  id: string;
  categoryId: string | null;
  name: string;
  category: string;
  stock: number;
  price: number;
};

type CategoryOption = {
  id: string;
  label: string;
};

type InventoryResponse = {
  rows: InventoryRow[];
  total: number;
};

type InventoryApiRow = {
  id: string;
  category_id?: string | null;
  category_name?: string | null;
  name: string;
  size?: string | null;
  stock_quantity?: number | null;
  selling_price?: number | null;
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

const mapInventoryRows = (
  products: InventoryApiRow[],
  rentalSpaceNames: Map<string | null | undefined, string>
): InventoryRow[] =>
  (products ?? []).map((row) => {
    const categoryName = formatInventoryCategory(row.category_name ?? "Uncategorised");
    const displayName = rentalSpaceNames.get(row.id) ?? formatInventoryName(row.name, categoryName, row.size);
    return {
      id: row.id,
      categoryId: row.category_id ?? null,
      category: rentalSpaceNames.has(row.id) ? "Rentals" : categoryName,
      name: displayName,
      stock: Number(row.stock_quantity ?? 0),
      price: Number(row.selling_price ?? 0),
    };
  });

const fetchInventoryRows = async ({
  selectedCategory,
  search,
  page,
  pageSize,
  rentalSpaceNames,
}: {
  selectedCategory: string;
  search: string;
  page: number;
  pageSize: number;
  rentalSpaceNames: Map<string | null | undefined, string>;
}): Promise<InventoryResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });

  if (selectedCategory !== "all") {
    params.set("category_id", selectedCategory);
  }

  if (search.trim()) {
    params.set("search", search.trim());
  }

  const { products, total } = await api.get<{ products: InventoryApiRow[]; total: number }>(`/products/all?${params.toString()}`);

  return {
    rows: mapInventoryRows(products ?? [], rentalSpaceNames),
    total: total ?? 0,
  };
};

export function InventoryReportPage({ embedded = false }: { embedded?: boolean }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createdCategoryNames, setCreatedCategoryNames] = useState<string[]>([]);
  const pageSize = 50;

  const addCategoryName = useCallback((name: string) => {
    setCreatedCategoryNames((previous) => {
      const next = new Set(previous);
      next.add(name);
      return Array.from(next).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    });
  }, []);

  const { spaces: rentalSpaces } = useRentalAvailability();
  const rentalSpaceNames = useMemo(
    () => new Map(rentalSpaces.map((space) => [space.product_id, space.name])),
    [rentalSpaces]
  );

  const { data: categoryData } = useQuery({
    queryKey: ["inventory-report-categories"],
    queryFn: () => api.get<{ categories: { id: string; name: string }[] }>("/products/categories"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: inventoryData, isLoading, refetch: refetchInventoryRows } = useQuery({
    queryKey: ["inventory-report", selectedCategory, search, page, rentalSpaces.length],
    queryFn: () =>
      fetchInventoryRows({
        selectedCategory,
        search,
        page,
        pageSize,
        rentalSpaceNames,
      }),
  });

  const rows = useMemo(() => inventoryData?.rows ?? [], [inventoryData?.rows]);
  const inventoryTotal = inventoryData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(inventoryTotal / pageSize));

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
      const { category } = await api.post<{ category: { id: string; name: string } }>("/products/categories", {
        name: normalized,
      });

      addCategoryName(category?.name ?? normalized);
      toast.success("Category created");
      await refetchInventoryRows();
      setSelectedCategory(category?.id ?? "all");
      setPage(1);
      closeCategoryDialog();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to create category.";
      toast.error(message);
    } finally {
      setCreatingCategory(false);
    }
  }, [addCategoryName, closeCategoryDialog, newCategoryName, refetchInventoryRows]);

  const categories = useMemo<CategoryOption[]>(() => {
    const source =
      categoryData?.categories?.map((category) => ({
        id: category.id,
        label: category.name,
      })) ?? fallbackCategories.map((name) => ({ id: name, label: name }));

    const combined = new Map(source.map((category) => [category.id, category.label]));
    createdCategoryNames.forEach((name) => combined.set(name, name));

    return [
      { id: "all", label: "All Categories" },
      ...Array.from(combined.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    ];
  }, [categoryData?.categories, createdCategoryNames]);

  const totals = useMemo(() => {
    const totalQuantity = rows.reduce((acc, row) => acc + row.stock, 0);
    const totalValue = rows.reduce((acc, row) => acc + row.stock * row.price, 0);
    return { totalQuantity, totalValue };
  }, [rows]);

  const fetchAllFilteredRows = useCallback(async () => {
    const result = await fetchInventoryRows({
      selectedCategory,
      search,
      page: 1,
      pageSize: 5000,
      rentalSpaceNames,
    });
    return result.rows;
  }, [rentalSpaceNames, search, selectedCategory]);

  const generatePDF = async () => {
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const exportRows = await fetchAllFilteredRows();
      const exportTotals = {
        totalQuantity: exportRows.reduce((acc, row) => acc + row.stock, 0),
        totalValue: exportRows.reduce((acc, row) => acc + row.stock * row.price, 0),
      };

      const biz = readBusinessSettings();
      const doc = new jsPDF({ orientation: "landscape" });
      const generatedAt = format(new Date(), "MMMM d, yyyy h:mm a");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`${biz.orgName} — ${biz.councilName}`, 14, 16);
      doc.setFontSize(12);
      doc.text("Inventory Report", 14, 24);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${generatedAt}`, 14, 35);

      const selectedCategoryLabel =
        selectedCategory === "all"
          ? "All Categories"
          : categories.find((category) => category.id === selectedCategory)?.label ?? "Selected Category";

      if (selectedCategory !== "all") {
        doc.text(`Category: ${selectedCategoryLabel}`, 14, 42);
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

      exportRows.forEach((row) => {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 30;
          drawHeader();
        }
        drawRow(row);
      });

      if (!exportRows.length) {
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
      doc.text(`Items: ${exportRows.length.toLocaleString()}`, 14, summaryY);
      doc.text(`Total Qty: ${exportTotals.totalQuantity.toLocaleString()}`, 80, summaryY);
      doc.text(`Total Value: ${formatCurrencyForPdf(exportTotals.totalValue)}`, 180, summaryY);

      doc.save(`inventory-report-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      toast.error("Failed to export PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  };

  const generateExcel = async () => {
    setExportingExcel(true);
    try {
      const exportRows = await fetchAllFilteredRows();
      const exportTotals = {
        totalQuantity: exportRows.reduce((acc, row) => acc + row.stock, 0),
        totalValue: exportRows.reduce((acc, row) => acc + row.stock * row.price, 0),
      };

      const wb = XLSX.utils.book_new();
      const headers = ["Item Name", "Category", "Stock", "Unit Price (PHP)", "Total Value (PHP)"];
      const dataRows = exportRows.map((row) => [
        row.name,
        row.category,
        row.stock,
        row.price,
        row.stock * row.price,
      ]);
      const summaryRows = [
        [],
        ["Summary"],
        ["Items", exportRows.length],
        ["Total Qty", exportTotals.totalQuantity],
        ["Total Value (PHP)", exportTotals.totalValue],
      ];

      const ws = XLSX.utils.aoa_to_sheet([
        [`${readBusinessSettings().orgName} — ${readBusinessSettings().councilName}`],
        ["Inventory Report"],
        [`Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")}`],
        selectedCategory !== "all"
          ? [`Category: ${categories.find((category) => category.id === selectedCategory)?.label ?? selectedCategory}`]
          : [],
        [],
        headers,
        ...dataRows,
        ...summaryRows,
      ]);

      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
      XLSX.writeFile(wb, `inventory-report-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      toast.error("Failed to export Excel. Please try again.");
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className={embedded ? "" : "pb-24"}>
      <div className={cn("w-full space-y-6", embedded && "min-w-0")}>
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          {!embedded && (
            <div>
              <h1 className="text-2xl font-semibold text-emerald-900">Inventory Report</h1>
              <p className="text-sm text-emerald-800/80">Stay on top of stock levels and valuation across categories.</p>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Select
                value={selectedCategory}
                onValueChange={(value) => {
                  setSelectedCategory(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-xl border-emerald-200 bg-white text-emerald-700 shadow-sm sm:w-56">
                  <SelectValue placeholder="Filter category" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-emerald-200 shadow-lg">
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
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
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border-emerald-200 bg-white text-sm shadow-sm sm:w-56"
            />
            <Button onClick={() => void generatePDF()} disabled={exportingPdf || exportingExcel} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm shadow hover:bg-emerald-700">
              {exportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {exportingPdf ? "Exporting..." : "Export PDF"}
            </Button>
            <Button onClick={() => void generateExcel()} disabled={exportingPdf || exportingExcel} variant="outline" className="h-10 rounded-xl border-emerald-300 px-4 text-sm shadow hover:bg-emerald-50">
              {exportingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              {exportingExcel ? "Exporting..." : "Export Excel"}
            </Button>
          </div>
        </div>

        <Card className="rounded-2xl border border-emerald-200/70 bg-white shadow-lg">
          <CardHeader className="flex flex-col gap-1 border-b border-emerald-100 pb-4">
            <CardTitle className="text-lg font-semibold text-emerald-900">Inventory Snapshot</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-700 sm:text-sm">
              <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">
                Items: {rows.length}
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">
                Total Qty: {totals.totalQuantity.toLocaleString()}
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">
                Total Value: PHP {totals.totalValue.toFixed(2)}
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
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-emerald-50/70">
                      <td className="px-4 py-3">{row.name}</td>
                      <td className="px-4 py-3">{row.category}</td>
                      <td className="px-4 py-3 text-right">{row.stock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">PHP {row.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">PHP {(row.stock * row.price).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!rows.length && !isLoading ? (
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
                Loading inventory...
              </div>
            ) : null}
            {inventoryTotal > pageSize ? (
              <div className="flex items-center justify-between border-t border-emerald-100 px-4 py-3 text-sm text-emerald-700">
                <span>
                  Page {page} of {totalPages} · {inventoryTotal} item{inventoryTotal === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Next
                  </Button>
                </div>
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
