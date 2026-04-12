import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Check, X, Plus, Tag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore, selectRole } from "@/store/sessionStore";

type CategoryOption = {
  id: string;
  name: string;
};

type ProductRow = {
  id?: string;
  category_id?: string | null;
};

type Props = {
  categories: CategoryOption[];
  products: ProductRow[];
  onRefresh: () => Promise<void>;
};

export function CategoriesTab({ categories, products, onRefresh }: Props) {
  const role = useSessionStore(selectRole);
  const isAdmin = role === "admin";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creating, setCreating] = useState(false);

  const productCountByCategory = new Map<string, number>();
  for (const p of products) {
    if (p.category_id) {
      productCountByCategory.set(
        p.category_id,
        (productCountByCategory.get(p.category_id) ?? 0) + 1
      );
    }
  }

  const startEdit = (cat: CategoryOption) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = useCallback(
    async (id: string) => {
      const trimmed = editName.trim();
      if (!trimmed) {
        toast.error("Category name cannot be empty.");
        return;
      }
      setSavingId(id);
      try {
        await api.patch(`/products/categories/${id}`, { name: trimmed });
        toast.success("Category renamed");
        await onRefresh();
        setEditingId(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to rename category";
        toast.error(msg);
      } finally {
        setSavingId(null);
      }
    },
    [editName, onRefresh]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await api.delete(`/products/categories/${id}`);
        toast.success("Category deleted");
        await onRefresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete category";
        toast.error(msg);
      } finally {
        setDeletingId(null);
      }
    },
    [onRefresh]
  );

  const handleCreate = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || trimmed.length < 2) {
      toast.error("Enter at least 2 characters.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/products/categories", { name: trimmed });
      toast.success("Category created");
      await onRefresh();
      setAddDialogOpen(false);
      setNewCategoryName("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create category";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }, [newCategoryName, onRefresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
        </p>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => {
              setNewCategoryName("");
              setAddDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Category
          </Button>
        )}
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category Name</TableHead>
              <TableHead className="w-[120px] text-center">Products</TableHead>
              {isAdmin && <TableHead className="w-[140px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No categories yet.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => {
                const count = productCountByCategory.get(cat.id) ?? 0;
                const isEditing = editingId === cat.id;
                const isSaving = savingId === cat.id;
                const isDeleting = deletingId === cat.id;
                return (
                  <TableRow key={cat.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(cat.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                          className="h-8 max-w-xs"
                        />
                      ) : (
                        <span className="font-medium">{cat.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{count}</Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right space-x-1">
                        {isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => saveEdit(cat.id)}
                              disabled={isSaving}
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={cancelEdit}
                              disabled={isSaving}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(cat)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                count > 0
                                  ? "text-muted-foreground"
                                  : "text-destructive hover:text-destructive"
                              )}
                              onClick={() => handleDelete(cat.id)}
                              disabled={isDeleting || count > 0}
                              title={
                                count > 0
                                  ? `Cannot delete - ${count} product${count !== 1 ? "s" : ""} assigned`
                                  : "Delete category"
                              }
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAdmin && addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Product Category</DialogTitle>
            <DialogDescription>Add a new grouping for products in the catalogue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800">
              <Tag className="h-4 w-4 text-emerald-600" />
              Use names like &ldquo;Camping Gear&rdquo; or &ldquo;Scout Essentials&rdquo; for quick recognition.
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-cat-name">Category name</Label>
              <Input
                id="new-cat-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="e.g. Camping Gear"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


