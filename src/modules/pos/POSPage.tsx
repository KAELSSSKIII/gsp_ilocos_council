import { useEffect, useMemo, useState, useCallback, FormEvent, useRef, useDeferredValue } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { ScanBarcode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { usePOSStore } from "@/store/posStore";
import { POSHeader } from "@/modules/pos/components/POSHeader";
import { ProductGrid } from "@/modules/pos/components/ProductGrid";
import { ProductRow, CategoryRow } from "@/modules/pos/types";
import { useCartSync } from "@/modules/pos/hooks/useCartSync";
import { useRentalAvailability } from "@/modules/pos/hooks/useRentalAvailability";
import { RentalPickerSheet } from "@/modules/pos/components/RentalPickerSheet";

type CartItemRow = {
  product_id: string;
  sku: string;
  name: string;
  selling_price: number;
  cost_price?: number | null;
  quantity: number;
  stock_quantity?: number | null;
  category_id?: string | null;
  category_name?: string | null;
  is_rental?: boolean;
  rental_space_id?: string | null;
};

type ProductApiRow = ProductRow & {
  category_name?: string | null;
};

const POS_PAGE_SIZE = 24;

export function POSPage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotal, setProductsTotal] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsLoadError, setProductsLoadError] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showRentalPicker, setShowRentalPicker] = useState(false);
  const [recentlyAddedProductId, setRecentlyAddedProductId] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const cart = usePOSStore((state) => state.cart);
  const addItem = usePOSStore((state) => state.addItem);
  const setCart = usePOSStore((state) => state.setCart);
  const { spaces: rentalSpaces, bookingsBySpace } = useRentalAvailability();

  useCartSync(cart);

  useEffect(() => {
    if (cart.length > 0) return;
    const restore = async () => {
      try {
        const { items } = await api.get<{ cart: unknown; items: CartItemRow[] }>("/carts/active");
        if (!items || items.length === 0) return;
        setCart(
          items.map((item) => ({
            id: item.product_id,
            sku: item.sku,
            name: item.name,
            price: item.selling_price,
            cost: item.cost_price ?? undefined,
            quantity: item.quantity,
            maxQuantity: item.stock_quantity ?? item.quantity,
            categoryId: item.category_id ?? null,
            categoryName: item.category_name ?? null,
            isRental: Boolean(item.is_rental),
            rentalSpaceId: item.rental_space_id ?? null,
          }))
        );
      } catch {
        // Cart restore is best effort only.
      }
    };
    void restore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categoriesData = await api.get<{ categories: CategoryRow[] }>("/products/categories?exclude_rental=true");
        setCategories(categoriesData.categories ?? []);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load product categories");
      }
    };
    void loadCategories();
  }, []);

  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true);
      setProductsLoadError(null);
      try {
        const params = new URLSearchParams({
          page: String(productsPage),
          page_size: String(POS_PAGE_SIZE),
        });
        const trimmedSearch = deferredSearch.trim();
        if (trimmedSearch) params.set("search", trimmedSearch);
        if (selectedCategory !== "all") params.set("category_id", selectedCategory);

        const response = await api.get<{ products: ProductApiRow[]; total: number }>(`/products?${params.toString()}`);
        setProducts(response.products ?? []);
        setProductsTotal(response.total ?? 0);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Failed to load products";
        setProductsLoadError(message);
        toast.error(message);
      } finally {
        setLoadingProducts(false);
      }
    };
    void loadProducts();
  }, [deferredSearch, productsPage, selectedCategory]);

  useEffect(() => {
    setProductsPage(1);
  }, [deferredSearch, selectedCategory]);

  const handleAddToCart = useCallback(
    (product: ProductRow) => {
      if (!product.is_active) {
        toast.warning(`${product.name} is inactive and cannot be sold.`);
        return;
      }

      const categoryName = product.category_id
        ? categories.find((category) => category.id === product.category_id)?.name ?? null
        : null;

      addItem({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.selling_price,
        cost: product.cost_price ?? undefined,
        quantity: 1,
        maxQuantity: product.is_rental ? 1 : product.stock_quantity,
        categoryId: product.category_id ?? null,
        categoryName,
        isRental: Boolean(product.is_rental),
        rentalSpaceId: product.rental_space_id ?? null,
      });

      if (
        !product.is_rental &&
        product.reorder_level != null &&
        product.stock_quantity > 0 &&
        product.stock_quantity <= product.reorder_level
      ) {
        toast.warning(`Low stock: only ${product.stock_quantity} unit${product.stock_quantity !== 1 ? "s" : ""} remaining for ${product.name}.`);
      } else {
        toast.success(`${product.name} added to cart`);
      }
      setRecentlyAddedProductId(product.id);
    },
    [addItem, categories]
  );

  useEffect(() => {
    if (!recentlyAddedProductId) return;
    const timeout = setTimeout(() => setRecentlyAddedProductId(null), 1200);
    return () => clearTimeout(timeout);
  }, [recentlyAddedProductId]);

  useEffect(() => {
    scanInputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "/") {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        scanInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const findProductByCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return null;

      const exactLocal = products.find(
        (item) => item.sku.toLowerCase() === code.toLowerCase() || item.id.toLowerCase() === code.toLowerCase()
      );
      if (exactLocal) return exactLocal;

      const params = new URLSearchParams({
        search: code,
        page: "1",
        page_size: "10",
      });
      const response = await api.get<{ products: ProductApiRow[] }>(`/products?${params.toString()}`);
      return (
        response.products?.find(
          (item) => item.sku.toLowerCase() === code.toLowerCase() || item.id.toLowerCase() === code.toLowerCase()
        ) ?? null
      );
    },
    [products]
  );

  const processBarcode = useCallback(
    async (raw: string) => {
      const product = await findProductByCode(raw);
      if (!product) {
        toast.error(`Product not found: ${raw.trim()}`);
        return;
      }
      if (!product.is_active) {
        toast.warning(`${product.name} is inactive and cannot be sold.`);
        return;
      }
      handleAddToCart(product);
      setShowManualEntry(false);
    },
    [findProductByCode, handleAddToCart]
  );

  const handleScanSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scanValue.trim()) return;
    await processBarcode(scanValue);
    setScanValue("");
  };

  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;
    const SCANNER_SPEED_MS = 50;
    const SCANNER_MIN_LEN = 3;

    const handleGlobalKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active === scanInputRef.current) return;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const gap = now - lastKeyTime;
      if (gap > 500) buffer = "";
      lastKeyTime = now;

      if (e.key === "Enter" || e.key === "Tab") {
        const code = buffer.trim();
        buffer = "";
        if (code.length >= SCANNER_MIN_LEN) {
          e.preventDefault();
          void processBarcode(code);
        }
        return;
      }

      if (e.key.length === 1) {
        if (buffer.length === 0 || gap <= SCANNER_SPEED_MS) {
          buffer += e.key;
        } else {
          buffer = e.key;
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [processBarcode]);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPages = Math.max(1, Math.ceil(productsTotal / POS_PAGE_SIZE));
  const statusText = useMemo(() => {
    if (loadingProducts) return "Loading products...";
    if (!productsTotal) return "No matching products";
    return `Showing ${products.length} of ${productsTotal} products`;
  }, [loadingProducts, products.length, productsTotal]);

  return (
    <div className="pb-24">
      <POSHeader cartCount={cartItemCount} />

      <div className="pos-container mx-auto mt-4 w-full space-y-5 px-4 pb-16 pt-2 sm:px-6 lg:px-8">
        <section>
          <Card className="border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 shadow-sm">
            <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-emerald-900">Rental Booking</h2>
                <p className="text-sm text-emerald-800/80">
                  Book halls and rooms through the rental flow instead of merchandise categories.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate("/rental-calendar")}>
                  View Calendar
                </Button>
                <Button onClick={() => setShowRentalPicker(true)}>
                  Open Rentals
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <Card className="w-full border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <ScanBarcode className="h-5 w-5 text-primary" />
                Barcode / SKU Scan
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground sm:text-sm">
                Scan or key in a SKU to add items instantly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                onSubmit={(event) => void handleScanSubmit(event)}
              >
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="pos-scan-input">Scan or type SKU</Label>
                  <Input
                    id="pos-scan-input"
                    ref={scanInputRef}
                    placeholder="Scan or type SKU here"
                    aria-describedby="pos-scan-help"
                    value={scanValue}
                    onChange={(event) => setScanValue(event.target.value)}
                    className="h-12 flex-1 text-base"
                  />
                  <p id="pos-scan-help" className="text-xs text-muted-foreground">
                    Press `Enter` after typing, or use a barcode scanner to add the exact item immediately.
                  </p>
                </div>
                <div className="sm:pt-7">
                  <Button type="submit" className="h-12 w-full min-w-[150px] text-base font-semibold sm:w-auto">
                    Add Item
                  </Button>
                </div>
              </form>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="pos-product-search">Search products</Label>
                  <Input
                    id="pos-product-search"
                    placeholder="Search products by name or SKU"
                    aria-describedby="pos-product-search-help"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-10 text-sm"
                  />
                  <p id="pos-product-search-help" className="text-xs text-muted-foreground">
                    Results update from the server and respect the selected category.
                  </p>
                </div>
                <div className="sm:pt-7">
                  <Button variant="outline" className="h-10 w-full px-4 sm:w-auto" onClick={() => setShowManualEntry(true)}>
                    Manual Entry
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{statusText}</span>
                {loadingProducts ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Refreshing
                  </span>
                ) : null}
              </div>
              {productsLoadError ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  Unable to refresh products right now. Showing the latest loaded results.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <ProductGrid
          products={products}
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onAddToCart={handleAddToCart}
          recentlyAddedProductId={recentlyAddedProductId}
        />

        {productsTotal > POS_PAGE_SIZE ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              Page {productsPage} of {totalPages}
            </span>
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
      </div>

      <Sheet open={showManualEntry} onOpenChange={setShowManualEntry}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Manual Item Entry</SheetTitle>
          </SheetHeader>
          <form className="mt-4 space-y-4" onSubmit={(event) => void handleScanSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="manual-sku">SKU or Item Name</Label>
              <Input
                id="manual-sku"
                placeholder="GS-VEST-S or Girl Scout Vest"
                aria-describedby="manual-sku-help"
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
              />
              <p id="manual-sku-help" className="text-xs text-muted-foreground">
                Use the exact SKU for the fastest match. Name search works best for a few keywords.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Add to Cart
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <RentalPickerSheet
        open={showRentalPicker}
        onOpenChange={setShowRentalPicker}
        spaces={rentalSpaces}
        bookingsBySpace={bookingsBySpace}
        onAddRental={(space, rentalDate) => {
          addItem({
            id: space.product_id!,
            sku: `RENT-${space.id}`,
            name: space.name,
            price: Number(space.base_rate),
            cost: 0,
            quantity: 1,
            maxQuantity: 1,
            categoryId: space.product_category_id ?? null,
            categoryName: null,
            isRental: true,
            rentalSpaceId: space.id,
            rentalDate,
          });
          toast.success(`${space.name} added to cart`);
          setShowRentalPicker(false);
        }}
      />
    </div>
  );
}
