import { useEffect, useMemo, useState, useCallback, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { usePOSStore } from "@/store/posStore";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { demoProducts } from "@/utils/demo-data";
import { POSHeader } from "@/modules/pos/components/POSHeader";
import { ProductGrid } from "@/modules/pos/components/ProductGrid";
import { ProductRow, CategoryRow } from "@/modules/pos/types";
import { useCartSync } from "@/modules/pos/hooks/useCartSync";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const escapeHtml = (value: string | null | undefined) =>
  (value ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function POSPage() {
  const navigate = useNavigate();
  const profile = useSessionStore(selectProfile);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [recentlyAddedProductId, setRecentlyAddedProductId] =
    useState<string | null>(null);

  const cart = usePOSStore((state) => state.cart);
  const heldCartsLocal = usePOSStore((state) => state.heldCarts);
  const addItem = usePOSStore((state) => state.addItem);
  const setCart = usePOSStore((state) => state.setCart);

  useCartSync(cart);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const fallbackCategoryMap: Record<string, string> = {
        "Uniforms": "uniforms",
        "Accessories": "accessories",
        "Merit Badges": "badges",
        "Hall Rental": "rent-hall",
        "Room Rental": "rent-room",
        "Hall & Room Rentals": "rent-hall-room",
      };

      setProducts(
        demoProducts.map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          selling_price: item.selling_price,
          cost_price: item.cost_price,
          stock_quantity: item.stock_quantity,
          is_active: true,
          category_id:
            (item as Partial<{ category_id: string }>).category_id ??
            (item.category ? fallbackCategoryMap[item.category] ?? null : null),
          image_url: (item as Partial<{ image_url: string }>).image_url ?? null,
        }))
      );
      setCategories([
        { id: "uniforms", name: "Uniforms" },
        { id: "accessories", name: "Accessories" },
        { id: "badges", name: "Merit Badges" },
        { id: "rent-hall", name: "Hall Rental" },
        { id: "rent-room", name: "Room Rental" },
        { id: "rent-hall-room", name: "Hall & Room Rentals" },
      ]);
      return;
    }

    const load = async () => {
      try {
        const [productsResult, categoriesResult, activeCartResult] = await Promise.all([
          supabase
            .from("products")
            .select(
              "id, sku, name, selling_price, cost_price, stock_quantity, size, category_id, is_active, image_url"
            ),
          supabase.from("product_categories").select("id, name"),
          profile?.id
            ? supabase
                .from("active_carts")
                .select(
                  "id, active_cart_items(quantity, unit_price, product:products(id,sku,name,selling_price,cost_price,stock_quantity))"
                )
                .eq("created_by", profile.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        const { data: productsData, error: productsError } = productsResult;
        const { data: categoriesData, error: categoriesError } = categoriesResult;
        const activeCartData = (activeCartResult as any)?.data ?? null;
        const activeCartError = (activeCartResult as any)?.error ?? null;

        if (productsError) throw productsError;
        if (categoriesError) throw categoriesError;
        if (activeCartError) throw activeCartError;

        const normalizedProducts: ProductRow[] = (productsData ?? []).map((product) => ({
          id: product.id,
          sku: product.sku,
          name: product.name,
          selling_price: product.selling_price,
          cost_price: product.cost_price,
          stock_quantity: product.stock_quantity,
          size: product.size,
          category_id: product.category_id,
          is_active: Boolean(product.is_active),
          image_url: product.image_url,
        }));

        setProducts(normalizedProducts);
        setCategories(categoriesData ?? []);

        if (activeCartData && !cart.length) {
          const items = activeCartData.active_cart_items ?? [];
          const categoryLookup = new Map(
            (categoriesData ?? []).map((category) => [category.id, category.name])
          );
          const mapped = items
            .filter((item: any) => item.product)
            .map((item: any) => ({
              id: item.product.id,
              sku: item.product.sku,
              name: item.product.name,
              price: item.product.selling_price,
              cost: item.product.cost_price ?? undefined,
              quantity: item.quantity,
              maxQuantity: item.product.stock_quantity ?? item.quantity,
              categoryId: item.product.category_id ?? null,
              categoryName: categoryLookup.get(item.product.category_id ?? "") ?? null,
            }));
          if (mapped.length > 0) {
            setCart(mapped);
          }
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load products");
      }
    };

    load();
  }, [cart.length, profile?.id, setCart, categories]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !query
        ? true
        : product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query);
      const matchesCategory = selectedCategory === "all" || product.category_id === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  const handlePrintAllBarcodes = useCallback(() => {
    const printableProducts = filteredProducts.filter((product) => (product.sku || product.id) && product.is_active);
    if (!printableProducts.length) {
      toast.error("No printable barcodes for the current filter.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast.error("Pop-up blocked. Enable pop-ups to print barcodes.");
      return;
    }

    const barcodeCards = printableProducts
      .map((product, index) => {
        const barcodeValue = product.sku || product.id || "";
        return `
          <div class="barcode-card">
            <h2>${escapeHtml(product.name)}</h2>
            <svg id="barcode-${index}"></svg>
            <div class="sku">${escapeHtml(barcodeValue)}</div>
          </div>
        `;
      })
      .join("");

    const barcodeScripts = printableProducts
      .map((product, index) => {
        const barcodeValue = product.sku || product.id || "";
        return `JsBarcode("#barcode-${index}", ${JSON.stringify(barcodeValue)}, {
          format: "CODE128",
          displayValue: false,
          lineColor: "#000000",
          width: 2,
          height: 80,
          margin: 0
        });`;
      })
      .join("\n");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Product Barcodes</title>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            :root { color-scheme: light; }
            body {
              margin: 0;
              font-family: 'Inter', system-ui, sans-serif;
              background: #f8fafc;
              padding: 24px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
              gap: 16px;
            }
            .barcode-card {
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 16px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 12px;
              box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
            }
            .barcode-card h2 {
              margin: 0;
              font-size: 14px;
              font-weight: 600;
              text-align: center;
              color: #0f172a;
            }
            .barcode-card .sku {
              font-size: 11px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #475569;
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${barcodeCards}
          </div>
          <script>
            window.addEventListener("load", function () {
              ${barcodeScripts}
              setTimeout(function () {
                window.print();
                window.close();
              }, 300);
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
  }, [filteredProducts]);
  const handleAddToCart = useCallback(
    (product: ProductRow) => {
      if (!product.is_active) {
        toast.warning(`${product.name} is inactive and cannot be sold.`);
        return;
      }

      const categoryName = product.category_id
        ? categories.find((category) => category.id === product.category_id)?.name ?? null
        : null;
      const isRental =
        categoryName && ["Hall Rental", "Room Rental", "Hall & Room Rentals"].includes(categoryName);

      addItem({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.selling_price,
        cost: product.cost_price ?? undefined,
        quantity: 1,
        maxQuantity: isRental ? 1 : product.stock_quantity,
        categoryId: product.category_id ?? null,
        categoryName,
      });
      toast.success(`${product.name} added to cart`);
      setRecentlyAddedProductId(product.id);
    },
    [addItem, categories]
  );

  useEffect(() => {
    if (!recentlyAddedProductId) return;
    const timeout = setTimeout(() => setRecentlyAddedProductId(null), 1200);
    return () => clearTimeout(timeout);
  }, [recentlyAddedProductId]);

  const handleScanSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scanValue.trim()) return;

    const code = scanValue.trim().toLowerCase();
    const product = products.find((item) => item.sku.toLowerCase() === code || item.id.toLowerCase() === code);
    if (!product) {
      toast.error("Product not found");
      return;
    }
    if (!product.is_active) {
      toast.warning(`${product.name} is inactive and cannot be sold.`);
      setScanValue("");
      return;
    }

    handleAddToCart(product);
    setScanValue("");
    setShowManualEntry(false);
  };

  const cartItemCount = cart.length;
  const { data: heldRemote = [] } = useQuery({
    queryKey: ["held-carts"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("held_carts")
        .select("id")
        .eq("status", "held");
      if (error) throw error;
      return data ?? [];
    },
  });
  const heldCount = isSupabaseConfigured ? heldRemote.length : Object.keys(heldCartsLocal).length;


  return (
    <div className="pb-24">
      <POSHeader
        cartCount={cartItemCount}
        heldCount={heldCount}
        onPrintBarcodes={handlePrintAllBarcodes}
        printDisabled={!filteredProducts.length}
        onHeldClick={() => navigate("/pos/cart")}
      />

      <div className="pos-container mx-auto mt-4 w-full space-y-5 px-4 pb-16 pt-2 sm:px-6 lg:px-8">
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
              <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={handleScanSubmit}>
                <Input
                  placeholder="Scan or type SKU here"
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  className="h-12 flex-1 text-base"
                />
                <Button type="submit" className="h-12 min-w-[150px] text-base font-semibold sm:w-auto">
                  Add Item
                </Button>
              </form>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  placeholder="Search products by name or SKU"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 flex-1 text-sm"
                />
                <Button variant="outline" className="h-10 px-4 sm:w-auto" onClick={() => setShowManualEntry(true)}>
                  Manual Entry
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <ProductGrid
          products={filteredProducts}
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onAddToCart={handleAddToCart}
          recentlyAddedProductId={recentlyAddedProductId}
        />
      </div>

      <Sheet open={showManualEntry} onOpenChange={setShowManualEntry}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Manual Item Entry</SheetTitle>
          </SheetHeader>
          <form className="mt-4 space-y-4" onSubmit={handleScanSubmit}>
            <div className="space-y-2">
              <Label htmlFor="manual-sku">SKU or Item Name</Label>
              <Input
                id="manual-sku"
                placeholder="GS-VEST-S or Girl Scout Vest"
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Add to Cart
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

