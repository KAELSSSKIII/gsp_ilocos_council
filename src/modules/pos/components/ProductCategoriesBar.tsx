import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CategoryOption = {
  id: string;
  name: string;
};

type CategoryGroup = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  categories: CategoryOption[];
};

type ProductCategoriesBarProps = {
  activeCategory: string;
  activeCategoryLabel: string;
  groupedCategories: CategoryGroup[];
  hasUnassignedCategory: boolean;
  setActiveCategory: (category: string) => void;
  onCreateCategory?: () => void;
  createCategoryDisabled?: boolean;
};

export function ProductCategoriesBar({
  activeCategory,
  activeCategoryLabel,
  groupedCategories,
  hasUnassignedCategory,
  setActiveCategory,
  onCreateCategory,
  createCategoryDisabled = false,
}: ProductCategoriesBarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [lastClosedCategory, setLastClosedCategory] = useState<string | null>(null);
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const prevActiveCategoryRef = useRef<string>(activeCategory);
  const prevCategoriesRef = useRef<number>(
    groupedCategories.reduce((count, group) => count + group.categories.length, 0)
  );

  useEffect(() => {
    const totalCategories = groupedCategories.reduce((count, group) => count + group.categories.length, 0);
    if (prevCategoriesRef.current !== totalCategories) {
      prevCategoriesRef.current = totalCategories;
      if (activeCategory !== "all") {
        const exists = groupedCategories.some((group) =>
          group.categories.some((category) => category.id === activeCategory)
        );
        if (!exists) {
          setOpenGroup(null);
        }
      }
    }
  }, [groupedCategories, activeCategory]);

  useEffect(() => {
    const previous = prevActiveCategoryRef.current;
    if (previous === activeCategory) return;
    prevActiveCategoryRef.current = activeCategory;

    if (activeCategory === "all") {
      setOpenGroup(null);
      setLastClosedCategory(null);
      return;
    }

    const matchedGroup = groupedCategories.find((group) =>
      group.categories.some((category) => category.id === activeCategory)
    );

    if (!matchedGroup) {
      setOpenGroup(null);
      return;
    }

    if (lastClosedCategory === activeCategory) {
      setLastClosedCategory(null);
      return;
    }

    setOpenGroup(matchedGroup.key);
  }, [activeCategory, groupedCategories, lastClosedCategory]);

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

  const isAllSelected = activeCategory === "all";

  return (
    <Card className="w-full border-border bg-card/95 shadow-sm">
      <CardContent ref={categoryBarRef} className="flex flex-col gap-4 pb-6 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-card-foreground">Product Categories</div>
            <p className="text-xs text-muted-foreground">
              Currently viewing: <span className="font-medium text-card-foreground">{activeCategoryLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setOpenGroup(null);
                setActiveCategory("all");
              }}
              variant={isAllSelected ? "default" : "outline"}
              size="sm"
              className={cn("min-w-[110px] rounded-full px-4", isAllSelected ? "bg-primary text-primary-foreground" : "")}
            >
              Show All
            </Button>
            {hasUnassignedCategory && (
              <Button
                onClick={() => setActiveCategory("unassigned")}
                variant={activeCategory === "unassigned" ? "default" : "outline"}
                size="sm"
                className="h-10 rounded-full px-4"
              >
                Unassigned
              </Button>
            )}
            {onCreateCategory ? (
              <Button
                onClick={onCreateCategory}
                variant="outline"
                size="sm"
                className="h-10 rounded-full px-4"
                disabled={createCategoryDisabled}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Category
              </Button>
            ) : null}
          </div>
        </div>

        {groupedCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories available yet.</p>
        ) : (
          <div className="flex flex-wrap items-start gap-3 overflow-visible">
            {groupedCategories.map((group) => {
              const isOpen = openGroup === group.key;
              const GroupIcon = group.icon;

              return (
                <div
                  key={group.key}
                  className={cn(
                    "relative min-w-[180px] flex-1 overflow-visible rounded-xl border border-border/70 bg-background/95 shadow-sm backdrop-blur-sm sm:flex-none",
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
                    <ChevronDown
                      className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen ? "rotate-180" : "")}
                    />
                  </button>
                  {isOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 w-max min-w-[200px] max-w-[280px] rounded-xl border border-border/80 bg-card shadow-lg">
                      <div className="max-h-64 overflow-y-auto p-3">
                        <div className="grid gap-2">
                          {group.categories.map((category) => {
                            const isActive = activeCategory === category.id;
                            return (
                              <Button
                                key={category.id}
                                variant={isActive ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  setLastClosedCategory(category.id);
                                  setActiveCategory(category.id);
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
  );
}
