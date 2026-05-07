/**
 * Products & Categories routes
 *
 * GET    /api/products                   → all active products (with category)
 * GET    /api/products/all               → all products including inactive (admin)
 * POST   /api/products                   → create product
 * PATCH  /api/products/:id               → update product
 * GET    /api/categories                  → all categories
 * POST   /api/categories                  → create category (admin)
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { logger } from "../logger";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  idParamSchema,
  productCreateSchema,
  productsListQuerySchema,
  productUpdateSchema,
} from "../validation/schemas";

const router = Router();

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

const buildProductFilters = (query: Record<string, unknown>) => {
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const categoryId = typeof query.category_id === "string" ? query.category_id : null;
  const unassigned = query.unassigned === "true";
  const includeRental = query.include_rental === "true";
  const excludeRental = query.exclude_rental === "true";
  const page = typeof query.page === "number" ? query.page : DEFAULT_PAGE;
  const pageSize = typeof query.page_size === "number" ? query.page_size : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  return {
    search,
    categoryId,
    unassigned,
    includeRental,
    excludeRental,
    page,
    pageSize,
    offset,
    searchLike: search ? `%${search}%` : null,
  };
};

// GET /api/products — active products visible to cashier/admin/accountant
router.get("/", requireAuth, validateQuery(productsListQuerySchema), async (req, res) => {
  try {
    const { role } = req.user!;
    if (!["admin", "cashier", "accountant", "inventory_clerk"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { categoryId, unassigned, offset, page, pageSize, searchLike } = buildProductFilters(req.query);

    const products = await sql`
      SELECT
        p.id, p.sku, p.name, p.description, p.category_id,
        p.image_url, p.size, p.cost_price, p.selling_price,
        p.stock_quantity, p.reorder_level, p.is_active,
        p.begin_inventory, p.purchases, p.sales_units,
        p.created_at, p.updated_at,
        c.name AS category_name,
        (rs.id IS NOT NULL) AS is_rental,
        rs.id AS rental_space_id,
        rs.rental_type AS rental_space_type
      FROM public.products p
      LEFT JOIN public.product_categories c ON c.id = p.category_id
      LEFT JOIN public.rental_spaces rs ON rs.product_id = p.id
      WHERE p.is_active = true
        AND rs.id IS NULL
        AND (${unassigned} = false OR p.category_id IS NULL)
        AND (${categoryId}::uuid IS NULL OR p.category_id = ${categoryId}::uuid)
        AND (
          ${searchLike}::text IS NULL
          OR p.name ILIKE ${searchLike}
          OR p.sku ILIKE ${searchLike}
          OR COALESCE(c.name, '') ILIKE ${searchLike}
        )
      ORDER BY p.name
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM public.products p
      LEFT JOIN public.product_categories c ON c.id = p.category_id
      LEFT JOIN public.rental_spaces rs ON rs.product_id = p.id
      WHERE p.is_active = true
        AND rs.id IS NULL
        AND (${unassigned} = false OR p.category_id IS NULL)
        AND (${categoryId}::uuid IS NULL OR p.category_id = ${categoryId}::uuid)
        AND (
          ${searchLike}::text IS NULL
          OR p.name ILIKE ${searchLike}
          OR p.sku ILIKE ${searchLike}
          OR COALESCE(c.name, '') ILIKE ${searchLike}
        )
    `;
    return res.json({ products, page, pageSize, total: count });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/all — includes inactive
router.get("/all", requireAuth, requireRole("admin", "accountant", "cashier", "inventory_clerk"), validateQuery(productsListQuerySchema), async (req, res) => {
  try {
    const { categoryId, unassigned, includeRental, excludeRental, offset, page, pageSize, searchLike } = buildProductFilters(req.query);
    const products = await sql`
      SELECT
        p.id, p.sku, p.name, p.description, p.category_id,
        p.image_url, p.size, p.cost_price, p.selling_price,
        p.stock_quantity, p.reorder_level, p.is_active,
        p.begin_inventory, p.purchases, p.sales_units,
        p.created_at, p.updated_at,
        c.name AS category_name,
        (rs.id IS NOT NULL) AS is_rental,
        rs.id AS rental_space_id,
        rs.rental_type AS rental_space_type
      FROM public.products p
      LEFT JOIN public.product_categories c ON c.id = p.category_id
      LEFT JOIN public.rental_spaces rs ON rs.product_id = p.id
      WHERE (${unassigned} = false OR p.category_id IS NULL)
        AND (${includeRental} = true OR rs.id IS NULL)
        AND (${excludeRental} = false OR rs.id IS NULL)
        AND (${categoryId}::uuid IS NULL OR p.category_id = ${categoryId}::uuid)
        AND (
          ${searchLike}::text IS NULL
          OR p.name ILIKE ${searchLike}
          OR p.sku ILIKE ${searchLike}
          OR COALESCE(c.name, '') ILIKE ${searchLike}
        )
      ORDER BY p.name
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM public.products p
      LEFT JOIN public.product_categories c ON c.id = p.category_id
      LEFT JOIN public.rental_spaces rs ON rs.product_id = p.id
      WHERE (${unassigned} = false OR p.category_id IS NULL)
        AND (${includeRental} = true OR rs.id IS NULL)
        AND (${excludeRental} = false OR rs.id IS NULL)
        AND (${categoryId}::uuid IS NULL OR p.category_id = ${categoryId}::uuid)
        AND (
          ${searchLike}::text IS NULL
          OR p.name ILIKE ${searchLike}
          OR p.sku ILIKE ${searchLike}
          OR COALESCE(c.name, '') ILIKE ${searchLike}
        )
    `;
    return res.json({ products, page, pageSize, total: count });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/products — admin/accountant
router.post("/", requireAuth, requireRole("admin", "accountant"), validateBody(productCreateSchema), async (req, res) => {
  try {
    const { sku, name, description, category_id, image_url, size,
            cost_price, selling_price, stock_quantity, reorder_level } = req.body;

    if (!sku || !name || selling_price == null || cost_price == null) {
      return res.status(400).json({ error: "sku, name, selling_price, and cost_price are required" });
    }

    const [product] = await sql`
      INSERT INTO public.products
        (sku, name, description, category_id, image_url, size,
         cost_price, selling_price, stock_quantity, reorder_level)
      VALUES
        (${sku}, ${name}, ${description ?? null}, ${category_id ?? null},
         ${image_url ?? null}, ${size ?? null}, ${cost_price}, ${selling_price},
         ${stock_quantity ?? 0}, ${reorder_level ?? 10})
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.PRODUCT_CREATED,
      actorId: req.user!.id,
      entityType: "product",
      entityId: product.id,
      summary: `Product ${product.name} was created.`,
      metadata: {
        display_name: product.name,
        sku: product.sku,
        stock_quantity: product.stock_quantity,
      },
    });

    return res.status(201).json({ product });
  } catch (err: unknown) {
    logger.error({ err }, "Route error");
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      "constraint_name" in err &&
      err.code === "23505" &&
      String(err.constraint_name ?? "").includes("sku")
    ) {
      return res.status(400).json({ error: "A product with this SKU already exists." });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/products/:id — admin/accountant
router.patch("/:id", requireAuth, requireRole("admin", "accountant", "inventory_clerk"), validateParams(idParamSchema), validateBody(productUpdateSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    // Fetch current row so we can detect stock changes and log adjustments
    const [existing] = await sql`
      SELECT id, sku, name, category_id, selling_price, cost_price, stock_quantity, reorder_level, is_active
      FROM public.products
      WHERE id = ${id}
    `;
    if (!existing) return res.status(404).json({ error: "Product not found" });

    const [product] = await sql`
      UPDATE public.products
      SET
        sku              = COALESCE(${fields.sku           ?? null}, sku),
        name             = COALESCE(${fields.name          ?? null}, name),
        description      = COALESCE(${fields.description   ?? null}, description),
        category_id      = COALESCE(${fields.category_id   ?? null}, category_id),
        image_url        = COALESCE(${fields.image_url     ?? null}, image_url),
        size             = COALESCE(${fields.size          ?? null}, size),
        cost_price       = COALESCE(${fields.cost_price    ?? null}, cost_price),
        selling_price    = COALESCE(${fields.selling_price ?? null}, selling_price),
        stock_quantity   = COALESCE(${fields.stock_quantity  ?? null}, stock_quantity),
        reorder_level    = COALESCE(${fields.reorder_level   ?? null}, reorder_level),
        is_active        = COALESCE(${fields.is_active       ?? null}, is_active),
        updated_at       = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Log stock adjustment if quantity changed
    const oldQty = existing.stock_quantity as number;
    const newQty = product.stock_quantity as number;
    if (newQty !== oldQty) {
      const userId = req.user!.id;
      // Look up full_name — JWT only carries id + role
      const [profile] = await sql`SELECT full_name FROM public.profiles WHERE id = ${userId}`;
      await sql`
        INSERT INTO public.stock_adjustments
          (product_id, product_name, old_quantity, new_quantity, adjustment, reason, adjusted_by, adjusted_by_name)
        VALUES
          (${id}, ${existing.name}, ${oldQty}, ${newQty}, ${newQty - oldQty},
           ${fields.adjust_reason ?? null}, ${userId}, ${profile?.full_name ?? null})
      `;
    }

    const stockChanged = Number(existing.stock_quantity) !== Number(product.stock_quantity);
    const delta = newQty - oldQty;
    const stockSummary = stockChanged
      ? ` Stock adjusted: ${oldQty} → ${newQty} (${delta >= 0 ? "+" : ""}${delta})${fields.adjust_reason ? `. Reason: ${fields.adjust_reason}` : ""}.`
      : "";

    await appendAuditLog({
      action: stockChanged ? ADMIN_AUDIT_ACTIONS.STOCK_ADJUSTED : ADMIN_AUDIT_ACTIONS.PRODUCT_UPDATED,
      actorId: req.user!.id,
      entityType: "product",
      entityId: product.id,
      summary: stockChanged
        ? `Stock adjusted for ${product.name}: ${oldQty} → ${newQty} (${delta >= 0 ? "+" : ""}${delta})${fields.adjust_reason ? `. Reason: ${fields.adjust_reason}` : ""}.`
        : `Product ${product.name} was updated.${stockSummary}`,
      metadata: {
        display_name: product.name,
        sku: product.sku,
        ...(stockChanged && {
          stock_old: oldQty,
          stock_new: newQty,
          stock_delta: delta,
          stock_reason: fields.adjust_reason ?? null,
        }),
        changes: {
          sku: existing.sku !== product.sku,
          name: existing.name !== product.name,
          category_id: (existing.category_id ?? null) !== (product.category_id ?? null),
          cost_price: Number(existing.cost_price) !== Number(product.cost_price),
          selling_price: Number(existing.selling_price) !== Number(product.selling_price),
          stock_quantity: stockChanged,
          reorder_level: Number(existing.reorder_level) !== Number(product.reorder_level),
          is_active: Boolean(existing.is_active) !== Boolean(product.is_active),
        },
      },
    });

    return res.json({ product });
  } catch (err: unknown) {
    logger.error({ err }, "Route error");
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      "constraint_name" in err &&
      err.code === "23505" &&
      String(err.constraint_name ?? "").includes("sku")
    ) {
      return res.status(400).json({ error: "A product with this SKU already exists." });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/stock-adjustments — all stock adjustments (global, filterable)
router.get("/stock-adjustments", requireAuth, requireRole("admin", "accountant", "inventory_clerk"), async (req, res) => {
  try {
    const { from, to, product_id, limit = "100", offset = "0" } = req.query as Record<string, string>;
    const limitN  = Math.min(parseInt(limit,  10) || 100, 500);
    const offsetN = Math.max(parseInt(offset, 10) || 0,   0);

    const adjustments = await sql`
      SELECT id, product_id, product_name, old_quantity, new_quantity, adjustment,
             reason, adjusted_by, adjusted_by_name, created_at
      FROM public.stock_adjustments
      WHERE (${from         ?? null}::timestamptz IS NULL OR created_at >= ${from         ?? null}::timestamptz)
        AND (${to           ?? null}::timestamptz IS NULL OR created_at <= ${to           ?? null}::timestamptz)
        AND (${product_id   ?? null}::uuid        IS NULL OR product_id  = ${product_id  ?? null}::uuid)
      ORDER BY created_at DESC
      LIMIT  ${limitN}
      OFFSET ${offsetN}
    `;

    const [{ total }] = await sql`
      SELECT COUNT(*)::int AS total
      FROM public.stock_adjustments
      WHERE (${from         ?? null}::timestamptz IS NULL OR created_at >= ${from         ?? null}::timestamptz)
        AND (${to           ?? null}::timestamptz IS NULL OR created_at <= ${to           ?? null}::timestamptz)
        AND (${product_id   ?? null}::uuid        IS NULL OR product_id  = ${product_id  ?? null}::uuid)
    `;

    return res.json({ adjustments, total });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "42P01") {
      return res.json({ adjustments: [], total: 0 });
    }
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/:id/adjustments — stock adjustment history
router.get("/:id/adjustments", requireAuth, requireRole("admin", "accountant", "inventory_clerk"), validateParams(idParamSchema), async (req, res) => {
  try {
    const adjustments = await sql`
      SELECT id, product_id, product_name, old_quantity, new_quantity, adjustment, reason,
             adjusted_by, adjusted_by_name, created_at
      FROM public.stock_adjustments
      WHERE product_id = ${req.params.id}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return res.json({ adjustments });
  } catch (err: unknown) {
    // Table doesn't exist yet — return empty list instead of 500
    if (typeof err === "object" && err !== null && "code" in err && err.code === "42P01") {
      return res.json({ adjustments: [] });
    }
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/categories
router.get("/categories", requireAuth, async (req, res) => {
  try {
    const excludeRental = req.query.exclude_rental === "true";
    const categories = excludeRental
      ? await sql`
          SELECT DISTINCT c.id, c.name, c.description, c.created_at, c.revenue_account_id
          FROM public.product_categories c
          JOIN public.products p ON p.category_id = c.id
          LEFT JOIN public.rental_spaces rs ON rs.product_id = p.id
          WHERE rs.id IS NULL
          ORDER BY c.name
        `
      : await sql`
          SELECT id, name, description, created_at, revenue_account_id
          FROM public.product_categories
          ORDER BY name
        `;
    return res.json({ categories });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/categories — admin
router.post("/categories", requireAuth, requireRole("admin"), validateBody(categoryCreateSchema), async (req, res) => {
  try {
    const { name, description, revenue_account_id } = req.body;
    const [category] = await sql`
      INSERT INTO public.product_categories (name, description, revenue_account_id)
      VALUES (${name}, ${description ?? null}, ${revenue_account_id ?? null})
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.CATEGORY_CREATED,
      actorId: req.user!.id,
      entityType: "category",
      entityId: category.id,
      summary: `Category ${category.name} was created.`,
      metadata: {
        display_name: category.name,
      },
    });

    return res.status(201).json({ category });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/products/categories/:id — rename category (admin)
router.patch("/categories/:id", requireAuth, requireRole("admin"), validateParams(idParamSchema), validateBody(categoryUpdateSchema), async (req, res) => {
  try {
    const { name, description, revenue_account_id } = req.body;
    const [existing] = await sql`
      SELECT id, name, description, revenue_account_id
      FROM public.product_categories
      WHERE id = ${req.params.id}
    `;
    if (!existing) return res.status(404).json({ error: "Category not found" });

    const [category] = await sql`
      UPDATE public.product_categories
      SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        revenue_account_id = COALESCE(${revenue_account_id ?? null}, revenue_account_id),
        updated_at = NOW()
      WHERE id = ${req.params.id}
      RETURNING *
    `;

    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.CATEGORY_UPDATED,
      actorId: req.user!.id,
      entityType: "category",
      entityId: category.id,
      summary: `Category ${category.name} was updated.`,
      metadata: {
        display_name: category.name,
        changes: {
          name: existing.name !== category.name,
          description: (existing.description ?? null) !== (category.description ?? null),
          revenue_account_id: (existing.revenue_account_id ?? null) !== (category.revenue_account_id ?? null),
        },
      },
    });

    return res.json({ category });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/products/categories/:id — delete category (admin)
// Blocked if any products still reference this category
router.delete("/categories/:id", requireAuth, requireRole("admin"), validateParams(idParamSchema), async (req, res) => {
  try {
    const [category] = await sql`
      SELECT id, name
      FROM public.product_categories
      WHERE id = ${req.params.id}
    `;
    if (!category) return res.status(404).json({ error: "Category not found" });

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM public.products WHERE category_id = ${req.params.id}
    `;
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete — ${count} product${count === 1 ? " is" : "s are"} assigned to this category.`,
      });
    }
    await appendAuditLog({
      action: ADMIN_AUDIT_ACTIONS.CATEGORY_DELETED,
      actorId: req.user!.id,
      entityType: "category",
      entityId: category.id,
      summary: `Category ${category.name} was deleted.`,
      metadata: {
        display_name: category.name,
      },
    });

    await sql`DELETE FROM public.product_categories WHERE id = ${req.params.id}`;
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
