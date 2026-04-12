import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProductRow, CategoryRow } from "@/modules/pos/types";
import { ChevronDown, FolderTree, ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/lib/utils";
import { isRentalProduct } from "@/modules/pos/utils/rental";
import { CATEGORY_GROUPS } from "@/modules/pos/utils/categoryGroups";

type ProductGridProps = {
  products: ProductRow[];
  categories: CategoryRow[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  onAddToCart: (product: ProductRow) => void;
  recentlyAddedProductId?: string | null;
};

export function ProductGrid({
  products,
  categories,
  selectedCategory,
  onSelectCategory,
  onAddToCart,
  recentlyAddedProductId,
}: ProductGridProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [lastClosedCategory, setLastClosedCategory] = useState<string | null>(null);
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const prevSelectedCategoryRef = useRef<string>(selectedCategory);
  const prevCategoriesRef = useRef<number>(categories.length);

  const groupedCategories = useMemo(() => {
    const categoryByName = new Map(categories.map((category) => [category.name, category]));
    const assignedNames = new Set<string>();

    const groups = CATEGORY_GROUPS.map((group) => {
      const items = group.names
        .map((name) => {
          const match = categoryByName.get(name);
          if (match) assignedNames.add(name);
          return match;
        })
        .filter(Boolean)
        .sort((a, b) => a!.name.localeCompare(b!.name)) as CategoryRow[];

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

  useEffect(() => {
    if (prevCategoriesRef.current !== categories.length) {
      prevCategoriesRef.current = categories.length;
      if (selectedCategory !== "all") {
        const exists = categories.some((category) => category.id === selectedCategory);
        if (!exists) {
          setOpenGroup(null);
        }
      }
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    const previous = prevSelectedCategoryRef.current;
    if (previous === selectedCategory) return;
    prevSelectedCategoryRef.current = selectedCategory;

    if (selectedCategory === "all") {
      setOpenGroup(null);
      setLastClosedCategory(null);
      return;
    }

    const matchedGroup = groupedCategories.find((group) =>
      group.categories.some((category) => category.id === selectedCategory)
    );

    if (!matchedGroup) {
      setOpenGroup(null);
      return;
    }

    if (lastClosedCategory === selectedCategory) {
      setLastClosedCategory(null);
      return;
    }

    setOpenGroup(matchedGroup.key);
  }, [selectedCategory, groupedCategories, lastClosedCategory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!categoryBarRef.current) return;
      if (!categoryBarRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isAllSelected = selectedCategory === "all";

  return (
    <div className="space-y-4">
      <Card className="w-full border-border bg-card/95 shadow-sm">
        <CardContent ref={categoryBarRef} className="flex flex-col gap-4 pt-4 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-card-foreground">Browse by Category</div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setOpenGroup(null);
                  onSelectCategory("all");
                }}
                variant={isAllSelected ? "default" : "outline"}
                size="sm"
                className={cn(
                  "min-w-[110px] rounded-full px-4",
                  isAllSelected ? "bg-primary text-primary-foreground" : ""
                )}
              >
                Show All
              </Button>
            </div>
          </div>

          {groupedCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories available.</p>
          ) : (
            <div className="relative flex flex-wrap items-start gap-3 overflow-visible">
              {groupedCategories.map((group) => {
                const isOpen = openGroup === group.key;
                const GroupIcon = group.icon;
                return (
                  <div
                    key={group.key}
                    className={cn(
                      "relative flex-1 min-w-[180px] sm:flex-none",
                      "rounded-xl border border-border/70 bg-background/95 backdrop-blur-sm shadow-sm",
                      "overflow-visible",
                      isOpen ? "z-20" : "z-0"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenGroup(isOpen ? null : group.key)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-card-foreground transition",
                        "hover:bg-primary/5",
                        isOpen ? "bg-primary/5" : ""
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <GroupIcon className="h-4 w-4" />
                        </span>
                        {group.label}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen ? "rotate-180" : "")} />
                    </button>
                    {isOpen && (
                      <div className="absolute left-0 top-full z-20 mt-2 w-max min-w-[200px] max-w-[280px] rounded-xl border border-border/80 bg-card shadow-lg">
                        <div className="max-h-64 overflow-y-auto p-3">
                          <div className="grid gap-2">
                            {group.categories.map((category) => {
                              const isActive = selectedCategory === category.id;
                              return (
                                <Button
                                  key={category.id}
                                  variant={isActive ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => {
                                    setLastClosedCategory(category.id);
                                    onSelectCategory(category.id);
                                    setOpenGroup(null);
                                  }}
                                  className={cn(
                                    "justify-start rounded-lg border text-sm font-medium transition-all",
                                    isActive
                                      ? "bg-primary text-primary-foreground shadow-sm"
                                      : "bg-card text-card-foreground hover:border-primary hover:bg-primary/5"
                                  )}
                                >
                                  {category.name}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 items-stretch justify-items-center gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {products.map((product) => {
          const inactive = !product.is_active;
          const wasJustAdded = recentlyAddedProductId === product.id;
          const isRental = isRentalProduct(product);
          const outOfStock = !isRental && product.stock_quantity <= 0;
          const isLowStock = !isRental && !outOfStock && product.reorder_level != null && product.stock_quantity <= product.reorder_level;
          const availabilityLabel = isRental
            ? inactive
              ? "Unavailable"
              : "Available"
            : product.stock_quantity <= 0
              ? "Out of stock"
              : isLowStock
                ? `Low stock (${product.stock_quantity})`
                : `${product.stock_quantity} in stock`;
          const availabilityVariant = inactive || outOfStock ? "destructive" : "secondary";
          return (
            <Card
              key={product.id}
              className={cn(
                "group flex h-full w-full max-w-[280px] flex-col overflow-hidden border border-border/60 bg-card transition duration-200 ease-out",
                inactive
                  ? "opacity-80 grayscale"
                  : "hover:-translate-y-1 hover:scale-[1.01] hover:shadow-lg hover:shadow-primary/10",
                wasJustAdded && "!border-primary/70 ring-2 ring-primary/30 ring-offset-2 animate-pulse"
              )}
            >
              <CardContent className="flex h-full flex-col p-0">
                <div className="flex h-full flex-col gap-4 p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[13px] font-semibold text-card-foreground">{product.name}</h3>
                          {inactive && (
                            <span className="shrink-0 rounded bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p
                          className="text-[11px] text-muted-foreground"
                          style={{ whiteSpace: "nowrap" }}
                          title={product.sku ?? product.id}
                        >
                          SKU: {product.sku ?? product.id}
                        </p>
                        {product.size && (
                          <p className="text-[11px] text-muted-foreground/80">Size: {product.size}</p>
                        )}
                      </div>
                      {outOfStock ? (
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-destructive"
                          title="Out of stock"
                        />
                      ) : isLowStock ? (
                        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                          {availabilityLabel}
                        </Badge>
                      ) : (
                        <Badge variant={availabilityVariant}>
                          {availabilityLabel}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex w-full items-end justify-between gap-2">
                    <div>
                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground/70">Price</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(product.selling_price)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={inactive || outOfStock}
                      onClick={() => onAddToCart(product)}
                    >
                      <ShoppingBag className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {products.length === 0 && (
        <div className="flex h-32 items-center justify-center rounded border border-dashed border-border/60 bg-muted/30 text-sm text-muted-foreground">
          No products match your current filters.
        </div>
      )}
    </div>
  );
}


