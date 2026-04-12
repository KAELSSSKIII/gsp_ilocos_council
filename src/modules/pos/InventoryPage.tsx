import { useEffect, useMemo, useState, useCallback, useDeferredValue, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PackagePlus, PackageMinus, Loader2, Printer, Boxes, AlertTriangle, PackageCheck, PhilippinePeso, FolderTree, Upload, FileDown } from "lucide-react";
import { formatCurrency, formatNumber } from "@/utils/format";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProductCategoriesBar } from "@/modules/pos/components/ProductCategoriesBar";
import { CategoriesTab } from "@/modules/pos/components/CategoriesTab";
import { PrintBarcodesDialog } from "@/modules/pos/components/PrintBarcodesDialog";
import { PrintBarcodesTab } from "@/modules/pos/components/PrintBarcodesTab";
import { CATEGORY_GROUPS } from "@/modules/pos/utils/categoryGroups";
import { InventoryReportPage } from "@/modules/reports/InventoryReportPage";
import { Plus, Tag } from "lucide-react";
import { parseProductCsv, downloadCsvTemplate, type CsvProductRow } from "@/modules/pos/utils/csvImport";


type ProductPayload = {
  id?: string;
  sku: string;
  name: string;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  reorder_level: number;
  category_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  size?: string | null;
  supplier_id?: string | null;
  last_restocked_at?: string | null;
  restock_interval_days?: number | null;
  is_active: boolean;
  is_rental?: boolean;
  rental_space_id?: string | null;
};

const defaultPayload: ProductPayload = {
  sku: "",
  name: "",
  selling_price: 0,
  cost_price: 0,
  stock_quantity: 0,
  reorder_level: 10,
  category_id: null,
  description: "",
  image_url: "",
  size: "",
  supplier_id: null,
  last_restocked_at: null,
  restock_interval_days: null,
  is_active: true,
};

type CategoryOption = {
  id: string;
  name: string;
};

type VendorOption = {
  id: string;
  name: string;
};

type ProductListRow = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category_id?: string | null;
  image_url?: string | null;
  size?: string | null;
  cost_price?: number | null;
  selling_price?: number | null;
  stock_quantity?: number | null;
  reorder_level?: number | null;
  is_active?: boolean;
  is_rental?: boolean;
  rental_space_id?: string | null;
};

type CategoryApiRow = {
  id: string;
  name?: string | null;
};

type StockAdjustmentRow = {
  id: string;
  adjustment: number;
  new_quantity: number;
  adjusted_by_name?: string | null;
  reason?: string | null;
  created_at: string;
};

const fallbackCategories: CategoryOption[] = [
  { id: "cat-uniforms", name: "Uniforms" },
  { id: "cat-shirts", name: "Shirts" },
  { id: "cat-badges", name: "Badges" },
  { id: "cat-accessories", name: "Accessories" },
];

const sortByName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

const sortCategories = (items: CategoryOption[]) => sortByName(items);
const sortVendors = (items: VendorOption[]) => sortByName(items);

const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, " ");

const fallbackVendors: VendorOption[] = [
  { id: "vendor-green-uniform", name: "Green Uniform Co." },
  { id: "vendor-scout-hub", name: "Scout Accessories Hub" },
  { id: "vendor-outdoor", name: "Outdoor Outfitters" },
];

const UNASSIGNED_VALUE = "none";

const formatDateTimeLocal = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return iso;
};

export function InventoryPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [inventoryView, setInventoryView] = useState<"products" | "stock">("stock");
  const [stockStatusFilter, setStockStatusFilter] = useState<"all" | "low" | "out" | "healthy">("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<"all" | "products" | "rentals">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogContext, setCategoryDialogContext] = useState<"filter" | "product-form" | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductPayload | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>(() => sortCategories(fallbackCategories));
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [vendors] = useState<VendorOption[]>(() => sortVendors(fallbackVendors));
  const [products, setProducts] = useState<ProductPayload[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsPage, setProductsPage] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<ProductPayload | null>(null);
  const [adjustType, setAdjustType] = useState<"increase" | "decrease">("increase");
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState<string>("");
  const [adjustHistory, setAdjustHistory] = useState<StockAdjustmentRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [printProduct, setPrintProduct] = useState<ProductPayload | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvPreviewRows, setCsvPreviewRows] = useState<CsvProductRow[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [csvImportProgress, setCsvImportProgress] = useState<{ done: number; total: number } | null>(null);

  const [newCategoryName, setNewCategoryName] = useState<string>("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const addCategoryToState = useCallback((category: CategoryOption) => {
    setCategories((previous) => {
      const exists = previous.some((item) => item.id === category.id);
      const next = exists
        ? previous.map((item) => (item.id === category.id ? category : item))
        : [...previous, category];
      return sortCategories(next);
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoadingProducts(true);
    setProductError(false);
    try {
      const params = new URLSearchParams({
        page: String(productsPage),
        page_size: "25",
      });
      if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
      if (activeCategory === "unassigned") {
        params.set("unassigned", "true");
      } else if (activeCategory !== "all") {
        params.set("category_id", activeCategory);
      }

      const [productsResponse, { categories: rawCategories }] = await Promise.all([
        api.get<{ products: ProductListRow[]; total: number }>(`/products/all?${params.toString()}`),
        api.get<{ categories: CategoryApiRow[] }>("/products/categories"),
      ]);
      setProducts(
        (productsResponse.products ?? []).map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          description: p.description ?? "",
          category_id: p.category_id ?? null,
          image_url: p.image_url ?? null,
          size: p.size ?? null,
          cost_price: Number(p.cost_price ?? 0),
          selling_price: Number(p.selling_price ?? 0),
          stock_quantity: Number(p.stock_quantity ?? 0),
          reorder_level: Number(p.reorder_level ?? 0),
          is_active: Boolean(p.is_active),
          is_rental: Boolean(p.is_rental),
          rental_space_id: p.rental_space_id ?? null,
          supplier_id: null,
          last_restocked_at: null,
          restock_interval_days: null,
        }))
      );
      setProductsTotal(productsResponse.total ?? 0);
      setCategories(sortCategories((rawCategories ?? []).map((c) => ({ id: c.id, name: c.name ?? "Untitled Category" }))));
    } catch (err) {
      console.error(err);
      setProductError(true);
      toast.error("Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  }, [activeCategory, deferredSearch, productsPage]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setProductsPage(1);
  }, [activeCategory, deferredSearch]);

  useEffect(() => {
    if (activeCategory !== "all" && !categories.some((category) => category.id === activeCategory)) {
      setActiveCategory("all");
    }
  }, [activeCategory, categories]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => {
      map.set(category.id, category.name);
    });
    return map;
  }, [categories]);

  const isRentalProduct = useCallback(
    (product: ProductPayload) => Boolean(product.is_rental || product.rental_space_id),
    []
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const isRental = isRentalProduct(product);
      const stock = Number(product.stock_quantity ?? 0);
      const reorder = Number(product.reorder_level ?? 0);
      const status =
        stock <= 0 ? "out" : stock <= reorder ? "low" : "healthy";

      const matchesType =
        itemTypeFilter === "all" ||
        (itemTypeFilter === "products" && !isRental) ||
        (itemTypeFilter === "rentals" && isRental);

      const matchesStatus =
        stockStatusFilter === "all" ||
        status === stockStatusFilter;

      return matchesType && matchesStatus;
    });
  }, [isRentalProduct, itemTypeFilter, products, stockStatusFilter]);

  const filteredProductTotals = useMemo(() => {
    const totalItems = filteredProducts.length;
    const totalQuantity = filteredProducts.reduce((acc, product) => acc + Number(product.stock_quantity ?? 0), 0);
    const totalValue = filteredProducts.reduce(
      (acc, product) => acc + Number(product.stock_quantity ?? 0) * Number(product.selling_price ?? 0),
      0
    );
    return {
      totalItems,
      totalQuantity,
      totalValue,
    };
  }, [filteredProducts]);

  const lowStockNonRental = useMemo(
    () =>
      filteredProducts.filter((product) => {
        const isRental = isRentalProduct(product);
        return !isRental && product.stock_quantity <= product.reorder_level;
      }),
    [filteredProducts, isRentalProduct]
  );

  const groupedCategories = useMemo(() => {
    const categoryByName = new Map(categories.map((category) => [category.name, category]));
    const assignedNames = new Set<string>();

    const groups = CATEGORY_GROUPS.map((group) => {
      const items = group.names
        .map((name) => {
          const match = categoryByName.get(name);
          if (match) {
            assignedNames.add(name);
          }
          return match;
        })
        .filter(Boolean)
        .sort((a, b) => a!.name.localeCompare(b!.name)) as CategoryOption[];

      return {
        ...group,
        categories: items,
      };
    }).filter((group) => group.categories.length > 0);

    const ungrouped = categories.filter((category) => !assignedNames.has(category.name));

    if (ungrouped.length > 0) {
      groups.push({
        key: "other",
        label: "Other Categories",
        icon: FolderTree,
        names: [],
        categories: [...ungrouped].sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    return groups;
  }, [categories]);

  const hasUnassignedCategory = useMemo(
    () => activeCategory === "unassigned" || products.some((product) => !product.category_id),
    [activeCategory, products]
  );
  const totalPages = Math.max(1, Math.ceil(productsTotal / 25));
  const outOfStockCount = useMemo(
    () => products.filter((product) => !isRentalProduct(product) && Number(product.stock_quantity ?? 0) <= 0).length,
    [isRentalProduct, products]
  );
  const healthyStockCount = useMemo(
    () =>
      products.filter((product) => {
        const isRental = isRentalProduct(product);
        if (isRental) return false;
        const stock = Number(product.stock_quantity ?? 0);
        const reorder = Number(product.reorder_level ?? 0);
        return stock > reorder;
      }).length,
    [isRentalProduct, products]
  );
  const activeCategoryLabel =
    activeCategory === "all"
      ? "All products"
      : activeCategory === "unassigned"
        ? "Unassigned products"
        : categoryLookup.get(activeCategory) ?? "Selected category";

  const openCreateDialog = () => {
    setEditingProduct({ ...defaultPayload });
    setDialogOpen(true);
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseProductCsv(ev.target?.result as string);
        setCsvPreviewRows(rows);
        setShowCsvPreview(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to parse CSV.");
      }
    };
    reader.readAsText(file);
  };

  const handleImportAll = async () => {
    setCsvImportProgress({ done: 0, total: csvPreviewRows.length });
    let succeeded = 0;
    for (const row of csvPreviewRows) {
      try {
        // Resolve category by name (case-insensitive) or leave null
        const matchedCategory = categories.find(
          (c) => c.name.toLowerCase() === row.category.toLowerCase()
        );
        await api.post("/products", {
          sku: row.sku,
          name: row.name,
          selling_price: row.selling_price,
          cost_price: row.cost_price,
          stock_quantity: row.stock_quantity,
          reorder_level: row.reorder_level,
          category_id: matchedCategory?.id ?? null,
          description: row.description || null,
          size: row.size || null,
          is_active: true,
        });
        succeeded++;
        setCsvImportProgress((prev) => prev ? { ...prev, done: succeeded } : null);
      } catch {
        // continue on per-row error
      }
    }
    setCsvImportProgress(null);
    setShowCsvPreview(false);
    setCsvPreviewRows([]);
    await loadData();
    toast.success(`Imported ${succeeded} of ${csvPreviewRows.length} product${csvPreviewRows.length !== 1 ? "s" : ""}.`);
  };

  const openEditDialog = (product: ProductPayload) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingProduct(null);
  };

  const handleOpenCategoryDialog = useCallback((context: "filter" | "product-form") => {
    setCategoryDialogContext(context);
    setNewCategoryName("");
    setCreatingCategory(false);
    setCategoryDialogOpen(true);
  }, []);

  const closeCategoryDialog = useCallback(() => {
    setCategoryDialogOpen(false);
    setCategoryDialogContext(null);
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
      const { category } = await api.post<{ category: { id: string; name: string } }>(
        "/products/categories",
        { name: normalized }
      );

      const created: CategoryOption = { id: category.id, name: category.name };
      addCategoryToState(created);
      toast.success("Category created");
      await loadData();

      if (categoryDialogContext === "filter") {
        setActiveCategory(created.id);
        setProductsPage(1);
      } else if (categoryDialogContext === "product-form") {
        setEditingProduct((previous) => (previous ? { ...previous, category_id: created.id } : previous));
      }

      closeCategoryDialog();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to create category.";
      toast.error(message);
    } finally {
      setCreatingCategory(false);
    }
  }, [
    addCategoryToState,
    categoryDialogContext,
    closeCategoryDialog,
    loadData,
    newCategoryName,
  ]);

  const openAdjustDialog = async (product: ProductPayload) => {
    setAdjustingProduct(product);
    setAdjustType("increase");
    setAdjustQuantity(1);
    setAdjustReason("");
    setAdjustHistory([]);
    setAdjustDialogOpen(true);
    if (product.id) {
      setLoadingHistory(true);
      try {
        const { adjustments } = await api.get<{ adjustments: StockAdjustmentRow[] }>(`/products/${product.id}/adjustments`);
        setAdjustHistory(adjustments ?? []);
      } catch {
        // history is non-critical; silently ignore
      } finally {
        setLoadingHistory(false);
      }
    }
  };

  const closeAdjustDialog = () => {
    setAdjustDialogOpen(false);
    setAdjustingProduct(null);
  };

  const saveProduct = async () => {
    if (!editingProduct) return;

    if (!editingProduct.name || !editingProduct.sku) {
      toast.error("Product name and SKU are required");
      return;
    }

    const payload = {
      sku: editingProduct.sku,
      name: editingProduct.name,
      selling_price: editingProduct.selling_price,
      cost_price: editingProduct.cost_price,
      stock_quantity: editingProduct.stock_quantity,
      reorder_level: editingProduct.reorder_level,
      description: editingProduct.description,
      category_id: editingProduct.category_id || null,
      image_url: editingProduct.image_url || null,
      size: editingProduct.size || null,
      last_restocked_at: editingProduct.last_restocked_at
        ? new Date(editingProduct.last_restocked_at).toISOString()
        : null,
      restock_interval_days: editingProduct.restock_interval_days,
      is_active: editingProduct.is_active,
    };

    try {
      if (editingProduct.id) {
        await api.patch<{ product: ProductPayload }>(`/products/${editingProduct.id}`, payload);
      } else {
        await api.post<{ product: ProductPayload }>("/products", payload);
      }

      await loadData();

      toast.success("Product saved");
      closeDialog();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("SKU already exists")) {
        toast.error("SKU already in use. Choose a different SKU.");
      } else {
        toast.error(message || "Failed to save product.");
      }
    }
  };

  const handleStockAdjustment = async () => {
    if (!adjustingProduct) return;
    if (!Number.isFinite(adjustQuantity) || adjustQuantity <= 0) {
      toast.error("Enter a quantity greater than zero");
      return;
    }

    const quantityDelta = adjustType === "increase" ? adjustQuantity : -Math.min(adjustQuantity, adjustingProduct.stock_quantity);
    const nextStock = Math.max(0, adjustingProduct.stock_quantity + quantityDelta);

    try {
      if (!adjustingProduct.id) {
        throw new Error("Missing product identifier");
      }

      await api.patch(`/products/${adjustingProduct.id}`, {
        stock_quantity: nextStock,
        last_restocked_at: adjustType === "increase" ? new Date().toISOString() : adjustingProduct.last_restocked_at,
        adjust_reason: adjustReason.trim() || null,
      });

      await loadData();
      toast.success("Stock updated successfully");
      // Refresh history so it's visible before closing
      if (adjustingProduct?.id) {
        try {
          const { adjustments } = await api.get<{ adjustments: StockAdjustmentRow[] }>(`/products/${adjustingProduct.id}/adjustments`);
          setAdjustHistory(adjustments ?? []);
        } catch { /* non-critical */ }
      }
      closeAdjustDialog();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to adjust stock";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Products & Inventory</h1>
        <p className="text-muted-foreground">
          Manage Girl Scout uniforms, badges, accessories, and camping gear across branches.
        </p>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="report">Inventory Report</TabsTrigger>
          <TabsTrigger value="print">Print Barcodes</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4 pt-4">
          <div className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
            <Card className="border-border bg-card/90">
              <CardHeader className="space-y-2">
                <CardDescription className="text-xs uppercase tracking-[0.2em] text-primary/60">
                  Inventory Workspace
                </CardDescription>
                <CardTitle className="text-2xl text-card-foreground">Products and stock, separated by action</CardTitle>
                <CardDescription>
                  Use the stock view for replenishment and quantity checks, then switch to product view for pricing, setup, and edits.
                </CardDescription>
              </CardHeader>
            </Card>
            <div className="flex items-start justify-end gap-2">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvFile}
              />
              <Button variant="outline" onClick={downloadCsvTemplate} className="flex items-center gap-2">
                <FileDown className="h-4 w-4" /> Template
              </Button>
              <Button variant="outline" onClick={() => csvInputRef.current?.click()} className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Button onClick={openCreateDialog} className="flex items-center gap-2">
                <PackagePlus className="h-4 w-4" /> Add Product
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Total SKUs</p>
                  <p className="mt-2 text-3xl font-semibold text-card-foreground">{productsTotal.toLocaleString()}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Boxes className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Low Stock</p>
                  <p className="mt-2 text-3xl font-semibold text-destructive">{lowStockNonRental.length.toLocaleString()}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Healthy Stock</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-700">{healthyStockCount.toLocaleString()}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <PackageCheck className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Stock Value</p>
                  <p className="mt-2 text-3xl font-semibold text-card-foreground">{formatCurrency(filteredProductTotals.totalValue)}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20 text-primary">
                  <PhilippinePeso className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          <ProductCategoriesBar
            activeCategory={activeCategory}
            activeCategoryLabel={activeCategoryLabel}
            groupedCategories={groupedCategories}
            hasUnassignedCategory={hasUnassignedCategory}
            setActiveCategory={(value) => {
              setActiveCategory(value);
              setProductsPage(1);
            }}
            onCreateCategory={() => handleOpenCategoryDialog("filter")}
            createCategoryDisabled={creatingCategory}
          />

          {lowStockNonRental.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <PackageMinus className="h-4 w-4 shrink-0" />
              <span>
                <strong>{lowStockNonRental.length}</strong>{" "}
                item{lowStockNonRental.length !== 1 ? "s" : ""} at or below reorder level:{" "}
                {lowStockNonRental.slice(0, 3).map((p) => p.name).join(", ")}
                {lowStockNonRental.length > 3 && ` +${lowStockNonRental.length - 3} more`}
              </span>
            </div>
          )}

        <Card className="border-border">
          <CardHeader className="space-y-3">
            <CardTitle className="text-card-foreground">Inventory Catalogue</CardTitle>
            <CardDescription>
              {inventoryView === "stock"
                ? "Focus on quantity, reorder status, and quick stock actions."
                : "Focus on product setup, pricing, and catalog details."}
            </CardDescription>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <Badge variant="secondary" className="rounded-full">
                Items: {filteredProductTotals.totalItems.toLocaleString()}
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                Total Quantity: {filteredProductTotals.totalQuantity.toLocaleString()}
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                Out of Stock: {outOfStockCount.toLocaleString()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={inventoryView} onValueChange={(value) => setInventoryView(value as "products" | "stock")} className="w-full lg:w-auto">
                <TabsList className="grid w-full grid-cols-2 lg:w-[260px]">
                  <TabsTrigger value="stock">Stock View</TabsTrigger>
                  <TabsTrigger value="products">Product View</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder={inventoryView === "stock" ? "Search stock by product or SKU" : "Search products by name or SKU"}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setProductsPage(1);
                  }}
                  className="sm:w-[260px]"
                />
                <Select value={itemTypeFilter} onValueChange={(value: "all" | "products" | "rentals") => setItemTypeFilter(value)}>
                  <SelectTrigger className="sm:w-[170px]">
                    <SelectValue placeholder="Item type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="products">Products Only</SelectItem>
                    <SelectItem value="rentals">Rentals Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={stockStatusFilter} onValueChange={(value: "all" | "low" | "out" | "healthy") => setStockStatusFilter(value)}>
                  <SelectTrigger className="sm:w-[170px]">
                    <SelectValue placeholder="Stock status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="low">Low Stock</SelectItem>
                    <SelectItem value="out">Out of Stock</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Reorder</TableHead>
                  {inventoryView === "products" ? <TableHead>Cost</TableHead> : null}
                  <TableHead>Price</TableHead>
                  <TableHead>Stock Value</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingProducts ? (
                  <TableRow>
                    <TableCell colSpan={inventoryView === "products" ? 10 : 9} className="h-32 text-center align-middle text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading live inventory…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : productError ? (
                  <TableRow>
                    <TableCell colSpan={inventoryView === "products" ? 10 : 9} className="h-32 text-center align-middle text-destructive">
                      Failed to load inventory. Please retry.
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={inventoryView === "products" ? 10 : 9} className="h-32 text-center align-middle text-muted-foreground">
                      No products found
                      {search ? ` matching “${search}”` : ""}
                      {activeCategory !== "all"
                        ? ` in ${activeCategoryLabel.toLowerCase()}`
                        : ""}
                      .
                    </TableCell>
                  </TableRow>
                ) : (
                filteredProducts.map((product) => {
                  const isRental = isRentalProduct(product);
                  const stock = Number(product.stock_quantity ?? 0);
                  const reorder = Number(product.reorder_level ?? 0);
                  const stockValue = stock * Number(product.selling_price ?? 0);
                  const statusLabel = isRental
                    ? product.is_active
                      ? "Available"
                      : "Unavailable"
                    : stock <= 0
                      ? "Out of Stock"
                      : stock <= reorder
                        ? "Low Stock"
                        : "Healthy";
                  const statusVariant = isRental
                    ? product.is_active
                      ? "secondary"
                      : "destructive"
                    : stock <= 0
                      ? "destructive"
                      : stock <= reorder
                        ? "outline"
                        : "secondary";
                  return (
                    <TableRow key={product.id ?? product.sku}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-card-foreground">{product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {product.category_id ? categoryLookup.get(product.category_id) ?? "Uncategorised" : "Uncategorised"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.sku}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{isRental ? "Rental" : "Product"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant}>
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isRental ? (
                          <Badge variant={product.is_active ? "secondary" : "destructive"}>
                            {product.is_active ? "Available" : "Unavailable"}
                          </Badge>
                        ) : (
                          <Badge
                            variant={stock <= reorder ? "destructive" : "secondary"}
                          >
                            {stock}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatNumber(product.reorder_level)}</TableCell>
                      {inventoryView === "products" ? <TableCell>{formatCurrency(product.cost_price)}</TableCell> : null}
                      <TableCell>{formatCurrency(product.selling_price)}</TableCell>
                      <TableCell>{formatCurrency(stockValue)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(product)}>
                          Edit
                        </Button>
                        {!isRental ? (
                          <Button variant="ghost" size="sm" onClick={() => openAdjustDialog(product)}>
                            Adjust
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setPrintProduct(product)}>
                          <Printer className="h-4 w-4 mr-1" /> Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
                )}
              </TableBody>
            </Table>
            {productsTotal > 25 ? (
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {productsPage} of {totalPages} · {productsTotal} product{productsTotal === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={productsPage <= 1 || loadingProducts}
                    onClick={() => setProductsPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={productsPage >= totalPages || loadingProducts}
                    onClick={() => setProductsPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <CategoriesTab categories={categories} products={products} onRefresh={loadData} />
        </TabsContent>

        <TabsContent value="report" className="pt-4">
          <InventoryReportPage embedded />
        </TabsContent>

        <TabsContent value="print">
          <PrintBarcodesTab products={products} categories={categories} />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct?.id ? "Edit Product" : "Add Product · Detailed"}</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="product-name">Product Name</Label>
                  <Input
                    id="product-name"
                    value={editingProduct.name}
                    onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="product-sku">SKU</Label>
                  <Input
                    id="product-sku"
                    value={editingProduct.sku}
                    onChange={(event) => setEditingProduct({ ...editingProduct, sku: event.target.value })}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="product-price">Selling Price</Label>
                    <Input
                      id="product-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editingProduct.selling_price}
                      onChange={(event) =>
                        setEditingProduct({ ...editingProduct, selling_price: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product-cost">Cost</Label>
                    <Input
                      id="product-cost"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editingProduct.cost_price}
                      onChange={(event) =>
                        setEditingProduct({ ...editingProduct, cost_price: Number(event.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="product-stock">On-hand Stock</Label>
                    <Input
                      id="product-stock"
                      type="number"
                      min={0}
                      value={editingProduct.stock_quantity}
                      onChange={(event) =>
                        setEditingProduct({ ...editingProduct, stock_quantity: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product-reorder">Reorder Level</Label>
                    <Input
                      id="product-reorder"
                      type="number"
                      min={0}
                      value={editingProduct.reorder_level}
                      onChange={(event) =>
                        setEditingProduct({ ...editingProduct, reorder_level: Number(event.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="product-description">Description</Label>
                  <Textarea
                    id="product-description"
                    className="min-h-[96px]"
                    value={editingProduct.description ?? ""}
                    onChange={(event) => setEditingProduct({ ...editingProduct, description: event.target.value })}
                    placeholder="Add product details, materials, or usage notes"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Category</Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={editingProduct.category_id ?? UNASSIGNED_VALUE}
                        onValueChange={(value) =>
                          setEditingProduct({
                            ...editingProduct,
                            category_id: value === UNASSIGNED_VALUE ? null : value,
                          })
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => handleOpenCategoryDialog("product-form")}
                        disabled={creatingCategory}
                      >
                        <span className="sr-only">Add category</span>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Supplier</Label>
                    <Select
                      value={editingProduct.supplier_id ?? UNASSIGNED_VALUE}
                      onValueChange={(value) =>
                        setEditingProduct({
                          ...editingProduct,
                          supplier_id: value === UNASSIGNED_VALUE ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="product-image">Image URL</Label>
                    <Input
                      id="product-image"
                      placeholder="https://"
                      value={editingProduct.image_url ?? ""}
                      onChange={(event) =>
                        setEditingProduct({
                          ...editingProduct,
                          image_url: event.target.value ? event.target.value : null,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product-size">Size</Label>
                    <Input
                      id="product-size"
                      placeholder="e.g. XS, M, One Size"
                      value={editingProduct.size ?? ""}
                      onChange={(event) =>
                        setEditingProduct({
                          ...editingProduct,
                          size: event.target.value ? event.target.value : null,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="product-restock-date">Last Restocked</Label>
                    <Input
                      id="product-restock-date"
                      type="datetime-local"
                      value={formatDateTimeLocal(editingProduct.last_restocked_at)}
                      onChange={(event) =>
                        setEditingProduct({
                          ...editingProduct,
                          last_restocked_at: event.target.value
                            ? new Date(event.target.value).toISOString()
                            : null,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product-restock-interval">Restock Interval (days)</Label>
                    <Input
                      id="product-restock-interval"
                      type="number"
                      min={0}
                      value={editingProduct.restock_interval_days ?? ""}
                      onChange={(event) =>
                        setEditingProduct({
                          ...editingProduct,
                          restock_interval_days: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded border border-border p-3">
                  <div>
                    <Label className="text-sm font-medium">Active</Label>
                    <p className="text-xs text-muted-foreground">Inactive products will be hidden from POS.</p>
                  </div>
                  <Switch
                    checked={editingProduct.is_active}
                    onCheckedChange={(checked) => setEditingProduct({ ...editingProduct, is_active: checked })}
                  />
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeDialog} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveProduct} className="w-full sm:w-auto">
              Save Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    <Dialog open={categoryDialogOpen} onOpenChange={handleCategoryDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Product Category</DialogTitle>
          <DialogDescription>Group similar products to keep the catalog organised.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800">
            <Tag className="h-4 w-4 text-emerald-600" />
            Use names like &ldquo;Camping Gear&rdquo; or &ldquo;Scout Essentials&rdquo; for quick recognition.
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-category-name">Category name</Label>
            <Input
              id="new-category-name"
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

      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            {adjustingProduct && (
              <p className="text-sm text-muted-foreground">
                {adjustingProduct.name} • Current: {formatNumber(adjustingProduct.stock_quantity)} units
              </p>
            )}
          </DialogHeader>
          {adjustingProduct && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="adjust-type">Adjustment Type</Label>
                <Select value={adjustType} onValueChange={(value: "increase" | "decrease") => setAdjustType(value)}>
                  <SelectTrigger id="adjust-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">Increase Stock</SelectItem>
                    <SelectItem value="decrease">Decrease Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adjust-quantity">Quantity</Label>
                <Input
                  id="adjust-quantity"
                  type="number"
                  min={1}
                  value={adjustQuantity}
                  onChange={(event) => setAdjustQuantity(Number(event.target.value))}
                />
                {adjustType === "decrease" && (
                  <p className="text-xs text-muted-foreground">
                    Cannot remove more than on-hand stock. Remaining stock will not go below zero.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adjust-reason">Reason (optional)</Label>
                <Textarea
                  id="adjust-reason"
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  placeholder="Damaged items, cycle count variance, etc."
                  className="min-h-[88px]"
                />
              </div>

              {/* Recent Adjustment History */}
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Adjustments
                </p>
                {loadingHistory ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : adjustHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No history yet.</p>
                ) : (
                  <ScrollArea className="h-40 rounded border border-border/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/40">
                          <th className="px-2 py-1 text-left font-medium text-muted-foreground">Date</th>
                          <th className="px-2 py-1 text-right font-medium text-muted-foreground">Change</th>
                          <th className="px-2 py-1 text-right font-medium text-muted-foreground">New Qty</th>
                          <th className="px-2 py-1 text-left font-medium text-muted-foreground">By</th>
                          <th className="px-2 py-1 text-left font-medium text-muted-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjustHistory.slice(0, 10).map((row) => (
                          <tr key={row.id} className="border-b border-border/30 last:border-0">
                            <td className="px-2 py-1 text-muted-foreground">
                              {new Date(row.created_at).toLocaleDateString()}
                            </td>
                            <td className={cn(
                              "px-2 py-1 text-right font-semibold",
                              row.adjustment > 0 ? "text-emerald-600" : "text-destructive"
                            )}>
                              {row.adjustment > 0 ? `+${row.adjustment}` : row.adjustment}
                            </td>
                            <td className="px-2 py-1 text-right">{row.new_quantity}</td>
                            <td className="px-2 py-1 text-muted-foreground">{row.adjusted_by_name ?? "—"}</td>
                            <td className="px-2 py-1 text-muted-foreground">{row.reason ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeAdjustDialog} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleStockAdjustment} className="w-full sm:w-auto">
              Update Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintBarcodesDialog
        product={printProduct}
        open={!!printProduct}
        onOpenChange={(open) => { if (!open) setPrintProduct(null); }}
      />

      {/* CSV Import Preview Dialog */}
      <Dialog open={showCsvPreview} onOpenChange={(open) => { if (!open && !csvImportProgress) { setShowCsvPreview(false); setCsvPreviewRows([]); } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import Products from CSV</DialogTitle>
            <DialogDescription>
              {csvPreviewRows.length} row{csvPreviewRows.length !== 1 ? "s" : ""} parsed. Review before importing.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Reorder</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvPreviewRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell className="text-sm">{row.name}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(row.selling_price)}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(row.cost_price)}</TableCell>
                    <TableCell className="text-sm">{row.stock_quantity}</TableCell>
                    <TableCell className="text-sm">{row.reorder_level}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.category || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.size || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter className="items-center gap-3">
            {csvImportProgress && (
              <span className="mr-auto text-sm text-muted-foreground">
                Importing {csvImportProgress.done} / {csvImportProgress.total}…
              </span>
            )}
            <Button variant="outline" disabled={!!csvImportProgress} onClick={() => { setShowCsvPreview(false); setCsvPreviewRows([]); }}>
              Cancel
            </Button>
            <Button onClick={handleImportAll} disabled={!!csvImportProgress}>
              {csvImportProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}






