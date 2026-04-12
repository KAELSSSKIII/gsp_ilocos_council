/**
 * Active Cart routes — replaces useCartSync Supabase calls
 *
 * GET    /api/active-carts              → get user's active cart (with items)
 * POST   /api/active-carts              → create new cart
 * DELETE /api/active-carts/:id/items    → clear items from cart
 * DELETE /api/active-carts/:id          → delete cart entirely
 * POST   /api/active-carts/:id/items    → replace all items (upsert)
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { activeCartCreateSchema } from "../validation/schemas";

const router = Router();

// ─── ACTIVE CARTS ─────────────────────────────────────────────────────────────

// GET /api/active-carts — returns user's latest active cart with items
router.get("/active", requireAuth, async (req, res) => {
  try {
    const [cart] = await sql`
      SELECT id, created_by, branch, created_at, updated_at
      FROM public.active_carts
      WHERE created_by = ${req.user!.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!cart) return res.json({ cart: null, items: [] });

    const items = await sql`
      SELECT
        aci.id, aci.quantity, aci.unit_price,
        p.id AS product_id, p.sku, p.name, p.selling_price,
        p.cost_price, p.stock_quantity, p.category_id,
        pc.name AS category_name,
        (rs.id IS NOT NULL) AS is_rental,
        rs.id AS rental_space_id
      FROM public.active_cart_items aci
      JOIN public.products p ON p.id = aci.product_id
      LEFT JOIN public.product_categories pc ON pc.id = p.category_id
      LEFT JOIN public.rental_spaces rs ON rs.product_id = p.id
      WHERE aci.active_cart_id = ${cart.id}
    `;

    return res.json({ cart, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/active-carts — create new active cart
router.post("/active", requireAuth, validateBody(activeCartCreateSchema), async (req, res) => {
  try {
    const { branch } = req.body;
    const [cart] = await sql`
      INSERT INTO public.active_carts (created_by, branch)
      VALUES (${req.user!.id}, ${branch ?? null})
      RETURNING *
    `;
    return res.status(201).json({ cart });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/active-carts/:id/items — delete all items from a cart
router.delete("/active/:id/items", requireAuth, async (req, res) => {
  try {
    // Verify ownership
    const [cart] = await sql`
      SELECT id FROM public.active_carts
      WHERE id = ${req.params.id} AND created_by = ${req.user!.id}
    `;
    if (!cart) return res.status(404).json({ error: "Cart not found" });

    await sql`DELETE FROM public.active_cart_items WHERE active_cart_id = ${req.params.id}`;
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/active-carts/:id — delete cart (cascades items)
router.delete("/active/:id", requireAuth, async (req, res) => {
  try {
    await sql`
      DELETE FROM public.active_carts
      WHERE id = ${req.params.id} AND created_by = ${req.user!.id}
    `;
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/active-carts/:id/items — bulk insert items (replaces old items)
router.post("/active/:id/items", requireAuth, async (req, res) => {
  try {
    const { items } = req.body; // [{ product_id, quantity, unit_price }]

    // Verify ownership
    const [cart] = await sql`
      SELECT id FROM public.active_carts
      WHERE id = ${req.params.id} AND created_by = ${req.user!.id}
    `;
    if (!cart) return res.status(404).json({ error: "Cart not found" });

    const rows = (items as { product_id: string; quantity: number; unit_price: number }[])
      .map((i) => ({
        active_cart_id: req.params.id,
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }));

    await sql`INSERT INTO public.active_cart_items ${sql(rows)}`;
    return res.status(201).json({ inserted: rows.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
