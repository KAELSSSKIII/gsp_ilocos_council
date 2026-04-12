/**
 * Dashboard route — replaces the 3 parallel supabase.from() calls in useDashboardData
 *
 * GET /api/dashboard?months=6  → { sales, lowStockProducts, teamCount }
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, requireRole("admin", "accountant", "manager", "hr"), async (req, res) => {
  try {
    const months = parseInt((req.query.months as string) ?? "6", 10);
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceISO = since.toISOString();

    const [sales, products, teamCount] = await Promise.all([
      sql`
        SELECT
          s.id,
          s.sale_number,
          s.receipt_number,
          s.total_amount,
          s.created_at,
          s.branch,
          s.status,
          s.cashier_id,
          s.member_id,
          COALESCE(
            NULLIF(p.full_name, ''),
            sr.payload->>'cashierName',
            p.email,
            u.email,
            'Unknown cashier'
          ) AS cashier_name,
          COALESCE(p.email, u.email) AS cashier_email,
          COALESCE(
            NULLIF(sr.payload->>'memberName', ''),
            NULLIF(m.name, ''),
            NULLIF(s.notes, ''),
            'Walk-in customer'
          ) AS customer_name
        FROM public.sales s
        LEFT JOIN public.profiles p ON p.id = s.cashier_id
        LEFT JOIN public.users u ON u.id = s.cashier_id
        LEFT JOIN public.members m ON m.id = s.member_id
        LEFT JOIN public.sale_receipts sr ON sr.sale_id = s.id
        WHERE s.created_at >= ${sinceISO}::timestamptz
          AND s.status <> 'voided'
        ORDER BY s.created_at DESC
      `,
      sql`
        SELECT id, name, stock_quantity, reorder_level
        FROM public.products
        WHERE is_active = true
        ORDER BY name
      `,
      sql`SELECT COUNT(*) AS count FROM public.profiles`,
    ]);

    return res.json({
      sales,
      products,
      teamCount: Number(teamCount[0]?.count ?? 0),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
