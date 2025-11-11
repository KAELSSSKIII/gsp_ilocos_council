import { useEffect, useMemo, useState, useCallback } from "react";
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
import { PackagePlus, PackageMinus, UploadCloud, Truck, AlertTriangle, Loader2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/utils/format";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { demoProducts } from "@/utils/demo-data";
import { cn } from "@/lib/utils";
import { ProductCategoriesBar } from "@/modules/pos/components/ProductCategoriesBar";
import { Plus, Tag } from "lucide-react";

const PRODUCT_PLACEHOLDER_IMG = "https://placehold.co/120x90?text=Product";
const RENTAL_CATEGORY_NAMES = new Set(["Hall Rental", "Room Rental", "Hall & Room Rentals"]);

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

const fallbackCategories: CategoryOption[] = [
  { id: "cat-uniforms", name: "Uniforms" },
  { id: "cat-shirts", name: "Shirts" },
  { id: "cat-badges", name: "Badges" },
  { id: "cat-accessories", name: "Accessories" },
  { id: "rent-hall", name: "Hall Rental" },
  { id: "rent-room", name: "Room Rental" },
  { id: "rent-hall-room", name: "Hall & Room Rentals" },
];

const sortByName = <T extends { name: string }>(items: T[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

const sortCategories = (items: CategoryOption[]) => sortByName(items);
const sortVendors = (items: VendorOption[]) => sortByName(items);

const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, " ");

const isRentalCategoryName = (name: string | null | undefined) => {
  if (!name) return false;
  return /\brental\b/i.test(name);
};

const fallbackVendors: VendorOption[] = [
  { id: "vendor-green-uniform", name: "Green Uniform Co." },
  { id: "vendor-scout-hub", name: "Scout Accessories Hub" },
  { id: "vendor-outdoor", name: "Outdoor Outfitters" },
];

const UNASSIGNED_VALUE = "none";

const CATEGORY_GROUPS = [
  {
    key: "tops",
    label: "Tops",
    icon: "👕",
    names: [
      "BLOUSE SR/CDT.",
      "POLO SHIRT (Combi)",
      "BLACK ADULT POLO SHIRT",
      "MEN'S BLACK POLO",
      "FUN T-SHIRT",
      "RAGLAN SHIRT",
      "FUN SHIRT Raglan-Everyway",
      "FUN SHIRT Professionals - White",
      "Uniforms",
      "Shirts",
    ],
  },
  {
    key: "bottoms",
    label: "Bottoms",
    icon: "👖",
    names: [
      "JOGGING PANTS",
      "BERMUDA SHORTS (Sta&Jun)",
      "BERMUDA SHORT-Sen&Cad",
      "Green Pants-Wool",
      "Green Pants Wool (old price)",
      "PLAIN GREEN SKIRT",
    ],
  },
  {
    key: "outerwear",
    label: "Outerwear",
    icon: "🧥",
    names: ["ADULT JACKET", "VEST - WOOL", "VEST - WOOL EMBRO", "GSP TERNO (SET)"],
  },
  {
    key: "accessories",
    label: "Accessories",
    icon: "🎒",
    names: [
      "SCARF",
      "NYLON BELT",
      "SOCKS",
      "STRIPS",
      "SASH",
      "CAPS",
      "PINS",
      "FACE MASK",
      "Keychain-Gespie",
      "Goodwill Pouch",
      "Magic Carpet",
      "BADGES",
      "Accessories",
    ],
  },
  {
    key: "manuals",
    label: "Manuals / Books",
    icon: "📚",
    names: ["MANUAL (Old)", "MANUAL (New)", "HANDBOOK (Old)", "HANDBOOK (New)", "A Camping we go", "Songbook"],
  },
  {
    key: "dolls",
    label: "Dolls / Memorabilia",
    icon: "🎭",
    names: ["GESPIE Doll (big)", "Rag Doll Twinkler (S)", "TWINKLER"],
  },
  {
    key: "age",
    label: "Groups / Age Sets",
    icon: "⭐",
    names: ["STAR", "JUNIOR", "SENIOR", "CADET", "RTW GIRLS:", "CLOTH:", "T-SHIRTS:"],
  },
  {
    key: "rentals",
    label: "Hall & Room Rentals",
    icon: "🏛️",
    names: ["Hall Rental", "Room Rental", "Hall & Room Rentals"],
  },
];

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogContext, setCategoryDialogContext] = useState<"filter" | "product-form" | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductPayload | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>(() => sortCategories(fallbackCategories));
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [vendors, setVendors] = useState<VendorOption[]>(() => sortVendors(fallbackVendors));
  const [demoInventory, setDemoInventory] = useState<ProductPayload[]>(() =>
    demoProducts.map((product) => ({
      sku: product.sku,
      name: product.name,
      selling_price: product.selling_price,
      cost_price: product.cost_price,
      stock_quantity: product.stock_quantity,
      reorder_level: 10,
      category_id: fallbackCategories.find((category) => category.name === product.category)?.id ?? null,
      description: (product as Partial<{ description: string }>).description ?? "Demo data",
      image_url: (product as Partial<{ image_url: string }>).image_url ?? null,
      size: (product as Partial<{ size: string }>).size ?? null,
      supplier_id: fallbackVendors[0]?.id ?? null,
      last_restocked_at: null,
      restock_interval_days: null,
      is_active: true,
    }))
  );
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<ProductPayload | null>(null);
  const [adjustType, setAdjustType] = useState<"increase" | "decrease">("increase");
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState<string>("");

  const fetchProducts = async (): Promise<ProductPayload[]> => {
    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, description, category_id, image_url, size, cost_price, selling_price, stock_quantity, reorder_level, is_active")
      .order("name");

    if (error) {
      throw error;
    }

    return (data ?? []).map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description ?? "",
      category_id: product.category_id,
      image_url: (product as Partial<{ image_url: string }>).image_url ?? null,
      size: (product as Partial<{ size: string }>).size ?? null,
      cost_price: Number(product.cost_price ?? 0),
      selling_price: Number(product.selling_price ?? 0),
      stock_quantity: Number(product.stock_quantity ?? 0),
      reorder_level: Number(product.reorder_level ?? 0),
      is_active: Boolean(product.is_active),
      supplier_id: null,
      last_restocked_at: null,
      restock_interval_days: null,
    }));
  };
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

  const {
    data: productData = [],
    isLoading: loadingProducts,
    isError: productError,
    error: productErrorObject,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["products", "inventory"],
    queryFn: fetchProducts,
    enabled: isSupabaseConfigured,
    staleTime: 1000 * 30,
  });

  const fetchReferenceData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    try {
      const [{ data: categoryData, error: categoryError }, { data: vendorData, error: vendorError }] = await Promise.all([
        supabase.from("product_categories").select("id, name"),
        (supabase as unknown as any).from("vendors").select("id, name"),
      ]);

      if (!categoryError && categoryData) {
        const mappedCategories = (categoryData as Array<{ id: string; name: string | null }>).map((category) => ({
          id: category.id,
          name: category.name ?? "Untitled Category",
        }));
        setCategories(sortCategories(mappedCategories));
      }

      if (!vendorError && vendorData) {
        const mappedVendors = (vendorData as Array<{ id: string; name: string | null }>).map((vendor) => ({
          id: vendor.id,
          name: vendor.name ?? "Untitled Vendor",
        }));
        setVendors(sortVendors(mappedVendors));
      }
    } catch (error) {
      console.warn("Failed to load reference data", error);
    }
  }, [isSupabaseConfigured]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      fetchReferenceData();
    } else {
      setCategories(sortCategories(fallbackCategories));
      setVendors(sortVendors(fallbackVendors));
    }
  }, [isSupabaseConfigured, fetchReferenceData]);

  const products = useMemo(() => {
    if (!isSupabaseConfigured) {
      return demoInventory;
    }
    return productData;
  }, [demoInventory, isSupabaseConfigured, productData]);

  useEffect(() => {
    if (activeCategory !== "all" && !categories.some((category) => category.id === activeCategory)) {
      setActiveCategory("all");
    }
  }, [activeCategory, categories]);

  useEffect(() => {
    if (productError && productErrorObject) {
      toast.error(`Failed to load products: ${productErrorObject.message}`);
    }
  }, [productError, productErrorObject]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => {
      map.set(category.id, category.name);
    });
    return map;
  }, [categories]);

  const vendorLookup = useMemo(() => {
    const map = new Map<string, string>();
    vendors.forEach((vendor) => {
      map.set(vendor.id, vendor.name);
    });
    return map;
  }, [vendors]);
  const rentalCategoryIds = useMemo(() => {
    return new Set(
      categories.filter((category) => isRentalCategoryName(category.name)).map((category) => category.id)
    );
  }, [categories]);

  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query);
      const matchesCategory =
        activeCategory === "all"
          ? true
          : activeCategory === "unassigned"
            ? !product.category_id
            : product.category_id === activeCategory;

      return matchesQuery && matchesCategory;
    });
  }, [search, products, activeCategory]);

  const filteredProductTotals = useMemo(() => {
    const totalItems = filteredProducts.length;
    const totalQuantity = filteredProducts.reduce((acc, product) => acc + Number(product.stock_quantity ?? 0), 0);
    return {
      totalItems,
      totalQuantity,
    };
  }, [filteredProducts]);

  const lowStockNonRental = useMemo(
    () =>
      filteredProducts.filter((product) => {
        const isRental = product.category_id ? rentalCategoryIds.has(product.category_id) : false;
        return !isRental && product.stock_quantity <= product.reorder_level;
      }),
    [filteredProducts, rentalCategoryIds]
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
        icon: "🗂️",
        names: [],
        categories: [...ungrouped].sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    return groups;
  }, [categories]);

  const hasUnassignedCategory = useMemo(() => products.some((product) => !product.category_id), [products]);
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
      let created: CategoryOption;

      if (!isSupabaseConfigured) {
        created = { id: `demo-category-${Date.now()}`, name: normalized };
        addCategoryToState(created);
        toast.success("Category created (demo mode)");
      } else {
        const { data, error } = await supabase
          .from("product_categories")
          .insert({ name: normalized })
          .select("id, name")
          .single();

        if (error) throw error;

        created = {
          id: data?.id ?? `category-${Date.now()}`,
          name: data?.name ?? normalized,
        };

        addCategoryToState(created);
        toast.success("Category created");
        await fetchReferenceData();
      }

      if (categoryDialogContext === "filter") {
        setActiveCategory(created.id);
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
    fetchReferenceData,
    isSupabaseConfigured,
    newCategoryName,
  ]);

  const openAdjustDialog = (product: ProductPayload) => {
    setAdjustingProduct(product);
    setAdjustType("increase");
    setAdjustQuantity(1);
    setAdjustReason("");
    setAdjustDialogOpen(true);
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

    if (!isSupabaseConfigured) {
      setDemoInventory((previous) => {
        const exists = previous.find((item) => item.sku === editingProduct.sku);
        if (exists) {
          return previous.map((item) => (item.sku === editingProduct.sku ? editingProduct : item));
        }
        return [...previous, editingProduct];
      });
      toast.success("Product saved (demo mode)");
      closeDialog();
      return;
    }

    try {
      if (editingProduct.id) {
        const { error } = await supabase
          .from("products")
          .update({
            sku: editingProduct.sku,
            name: editingProduct.name,
            selling_price: editingProduct.selling_price,
            cost_price: editingProduct.cost_price,
            stock_quantity: editingProduct.stock_quantity,
            reorder_level: editingProduct.reorder_level,
            description: editingProduct.description,
            category_id: editingProduct.category_id,
            image_url: editingProduct.image_url,
            size: editingProduct.size,
            supplier_id: editingProduct.supplier_id,
            last_restocked_at: editingProduct.last_restocked_at
              ? new Date(editingProduct.last_restocked_at).toISOString()
              : null,
            restock_interval_days: editingProduct.restock_interval_days,
            is_active: editingProduct.is_active,
          })
          .eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({
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
          supplier_id: editingProduct.supplier_id || null,
          last_restocked_at: editingProduct.last_restocked_at
            ? new Date(editingProduct.last_restocked_at).toISOString()
            : null,
          restock_interval_days: editingProduct.restock_interval_days,
          is_active: editingProduct.is_active,
        });
        if (error) throw error;
      }

      await refetchProducts();

      toast.success("Product saved");
      closeDialog();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : null;
      toast.error(message ? `Failed to save product: ${message}` : "Failed to save product");
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

    if (!isSupabaseConfigured) {
      setDemoInventory((previous) =>
        previous.map((item) =>
          item.sku === adjustingProduct.sku ? { ...item, stock_quantity: nextStock } : item
        )
      );
      toast.success("Stock adjusted (demo mode)");
      closeAdjustDialog();
      return;
    }

    try {
      if (!adjustingProduct.id) {
        throw new Error("Missing product identifier");
      }

      const { error } = await supabase
        .from("products")
        .update({
          stock_quantity: nextStock,
          last_restocked_at: adjustType === "increase" ? new Date().toISOString() : adjustingProduct.last_restocked_at,
        })
        .eq("id", adjustingProduct.id);

      if (error) throw error;

      await refetchProducts();
      toast.success("Stock updated successfully");
      closeAdjustDialog();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to adjust stock";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Products & Inventory</h1>
          <p className="text-muted-foreground">
            Manage Girl Scout uniforms, badges, accessories, and camping gear across branches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={openCreateDialog} className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4" /> Add Product
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4" /> Bulk Import
          </Button>
        </div>
      </div>

      <ProductCategoriesBar
        activeCategory={activeCategory}
        activeCategoryLabel={activeCategoryLabel}
        groupedCategories={groupedCategories}
        hasUnassignedCategory={hasUnassignedCategory}
        setActiveCategory={setActiveCategory}
        onCreateCategory={() => handleOpenCategoryDialog("filter")}
        createCategoryDisabled={creatingCategory}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="space-y-3">
            <CardTitle className="text-card-foreground">Inventory Catalogue</CardTitle>
            <CardDescription>Track stock levels, reorder points, and supplier assignments.</CardDescription>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <Badge variant="secondary" className="rounded-full">
                Items: {filteredProductTotals.totalItems.toLocaleString()}
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                Total Quantity: {filteredProductTotals.totalQuantity.toLocaleString()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search products by name or SKU"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Reorder</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingProducts && isSupabaseConfigured ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center align-middle text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading live inventory…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : productError && isSupabaseConfigured ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center align-middle text-destructive">
                      Failed to load inventory. Please retry.
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center align-middle text-muted-foreground">
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
                  const isRental = product.category_id
                    ? rentalCategoryIds.has(product.category_id)
                    : false;
                  return (
                    <TableRow key={product.id ?? product.sku}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={product.image_url || PRODUCT_PLACEHOLDER_IMG}
                            alt={product.name}
                            className="h-12 w-12 rounded-md object-cover"
                            loading="lazy"
                          />
                          <div>
                            <div className="font-medium text-card-foreground">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.category_id ? categoryLookup.get(product.category_id) ?? "Uncategorised" : "Uncategorised"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.sku}</TableCell>
                      <TableCell>
                        {isRental ? (
                          <Badge variant={product.is_active ? "secondary" : "destructive"}>
                            {product.is_active ? "Available" : "Unavailable"}
                          </Badge>
                        ) : (
                          <Badge
                            variant={product.stock_quantity <= product.reorder_level ? "destructive" : "secondary"}
                          >
                            {product.stock_quantity}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatNumber(product.reorder_level)}</TableCell>
                      <TableCell>{formatCurrency(product.cost_price)}</TableCell>
                      <TableCell>{formatCurrency(product.selling_price)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(product)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openAdjustDialog(product)}>
                          Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <PackageMinus className="h-5 w-5" /> Stock Alerts
              </CardTitle>
              <CardDescription>Quick view of items nearing their reorder threshold.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {lowStockNonRental.length === 0 ? (
                <p className="text-sm text-muted-foreground">All stocks above reorder levels.</p>
              ) : (
                lowStockNonRental.map((product) => (
                  <div key={product.sku} className="rounded border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-card-foreground">{product.name}</span>
                      <Badge variant="destructive">{product.stock_quantity} left</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supplier: {product.supplier_id ? vendorLookup.get(product.supplier_id) ?? "Unassigned" : "Unassigned"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Truck className="h-5 w-5" /> Supplier Overview
              </CardTitle>
              <CardDescription>Track supplier assignments and restock cadence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-card-foreground">Green Uniform Co.</span>
                  <Badge variant="secondary">Primary</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Lead time: 7 days • Last delivery: Jan 10 • Next restock: Jan 24
                </p>
              </div>
              <div className="rounded border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-card-foreground">Scout Accessories Hub</span>
                  <Badge variant="outline">Secondary</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Lead time: 5 days • Last delivery: Jan 8 • Next restock: Jan 22
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <AlertTriangle className="h-5 w-5" /> Inventory Tasks
              </CardTitle>
              <CardDescription>Organise counts, transfers, and adjustment workflows.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="counts" className="space-y-3">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="counts">Cycle Counts</TabsTrigger>
                  <TabsTrigger value="transfers">Transfers</TabsTrigger>
                  <TabsTrigger value="returns">Returns</TabsTrigger>
                </TabsList>
                <TabsContent value="counts" className="text-sm text-muted-foreground">
                  Schedule warehouse counts, assign staff, and reconcile variances.
                </TabsContent>
                <TabsContent value="transfers" className="text-sm text-muted-foreground">
                  Move inventory between branches; automatic journal entries will be posted in accounting.
                </TabsContent>
                <TabsContent value="returns" className="text-sm text-muted-foreground">
                  Record damaged, donated, or returned items with audit trails.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

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
            Use names like &ldquo;Camping Gear&rdquo; or &ldquo;Hall Rental&rdquo; for quick recognition.
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
    </div>
  );
}



