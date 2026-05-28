/**
 * Reports routes
 *
 * GET  /api/reports/scrd?year=&month=   → auto-aggregated DB data (sales + rentals)
 * GET  /api/reports/scrd/saved?year=&month= → load saved report for a month
 * POST /api/reports/scrd/saved          → upsert (save/update) a report
 */
import { Router } from "express";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logger } from "../logger";

const router = Router();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";

type LedgerEntryRow = {
  date: string;
  reference: string;
  description: string;
  debit: string | number;
  credit: string | number;
  entry_type: string;
};

// ── GET /api/reports/scrd — auto-aggregated sales & rental data ───────────────
router.get(
  "/scrd",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const year = parseInt(req.query.year as string, 10);
      const month = parseInt(req.query.month as string, 10);

      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ error: "Valid year and month required" });
      }

      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 1);

      const salesByCategory = await sql`
        SELECT
          COALESCE(pc.name, 'Uncategorized') AS category_name,
          SUM(si.subtotal)::numeric AS total
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        JOIN public.products p ON p.id = si.product_id
        LEFT JOIN public.product_categories pc ON pc.id = p.category_id
        WHERE s.status != 'voided'
          AND s.created_at >= ${monthStart}
          AND s.created_at < ${monthEnd}
        GROUP BY pc.name
        ORDER BY pc.name
      `;

      const rentalBySpace = await sql`
        SELECT
          rs.name AS space_name,
          COALESCE(SUM(rb.initial_payment), 0)::numeric AS amount
        FROM public.rental_bookings rb
        JOIN public.rental_spaces rs ON rs.id = rb.rental_space_id
        WHERE rb.status != 'cancelled'
          AND rb.booking_date >= ${monthStart.toISOString().slice(0, 10)}
          AND rb.booking_date < ${monthEnd.toISOString().slice(0, 10)}
        GROUP BY rs.name
        ORDER BY rs.name
      `;

      const [payrollSummary] = await sql`
        SELECT
          COALESCE(SUM(basic_salary), 0)::numeric AS salaries_wages,
          COALESCE(SUM(cola), 0)::numeric AS cola,
          COALESCE(SUM(sss), 0)::numeric AS sss,
          COALESCE(SUM(philhealth), 0)::numeric AS philhealth,
          COALESCE(SUM(pagibig), 0)::numeric AS pagibig,
          COALESCE(SUM(net_salary), 0)::numeric AS net_salary
        FROM public.payroll
        WHERE status = 'paid'
          AND COALESCE(processed_at, updated_at) >= ${monthStart}
          AND COALESCE(processed_at, updated_at) < ${monthEnd}
      `;

      const [receiptVoucherSummary] = await sql`
        SELECT
          COALESCE(SUM(amount), 0)::numeric AS total
        FROM public.vouchers
        WHERE status = 'posted'
          AND voucher_type = 'receipt'
          AND posted_at >= ${monthStart}
          AND posted_at < ${monthEnd}
      `;

      const voucherExpenses = await sql`
        SELECT
          voucher_number,
          voucher_type,
          description,
          amount::numeric AS amount,
          posted_at::date AS posted_date
        FROM public.vouchers
        WHERE status = 'posted'
          AND voucher_type IN ('payment', 'journal', 'payroll')
          AND posted_at >= ${monthStart}
          AND posted_at < ${monthEnd}
        ORDER BY posted_at DESC
      `;

      return res.json({
        salesByCategory,
        rentalBySpace,
        payrollSummary,
        receiptVoucherSummary,
        voucherExpenses,
      });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── GET /api/reports/scrd/saved — load a saved report ────────────────────────
router.get(
  "/scrd/saved",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const year = parseInt(req.query.year as string, 10);
      const month = parseInt(req.query.month as string, 10);

      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ error: "Valid year and month required" });
      }

      const [report] = await sql`
        SELECT * FROM public.scrd_reports
        WHERE year = ${year} AND month = ${month}
      `;

      if (!report) return res.json({ report: null });
      return res.json({ report });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── POST /api/reports/scrd/saved — upsert a report ───────────────────────────
router.post(
  "/scrd/saved",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const d = req.body;

      const [report] = await sql`
        INSERT INTO public.scrd_reports (
          year, month,
          beginning_balance,
          council_support_fund, troop_fees, district_committee,
          career_woman, honorary_member, iccg, thinking_day_fund_gen,
          nes_sales, rental_rows,
          interest_income,
          souvenir_sales, other_income_label, other_income_amount,
          exp_salaries_wages, exp_cola, exp_representation_ce,
          exp_sss, exp_philhealth, exp_pagibig,
          exp_transportation, exp_postage, exp_telephone, exp_electric,
          exp_office_supplies, exp_maintenance_linens, exp_gasoline_oil,
          exp_maintenance_vehicle, exp_repair_hq, exp_trainings,
          exp_conferences, exp_representation, exp_donations,
          exp_christmas_program, exp_escoda_fund, exp_thinking_day_fund,
          exp_licenses_permits, exp_legal_fees, exp_taxes,
          exp_advertising, exp_tulong_bata, exp_miscellaneous,
          nes_purchases,
          acc_cash_in_bank_dbp, acc_petty_cash, acc_cash_on_hand,
          acc_retirement_fund, acc_cash_in_bank_maybank,
          acc_checking_account_dbp, acc_cash_in_bank_pnb,
          created_by, updated_by, updated_at
        ) VALUES (
          ${d.year}, ${d.month},
          ${d.beginning_balance ?? 0},
          ${d.council_support_fund ?? 0}, ${d.troop_fees ?? 0}, ${d.district_committee ?? 0},
          ${d.career_woman ?? 0}, ${d.honorary_member ?? 0}, ${d.iccg ?? 0}, ${d.thinking_day_fund_gen ?? 0},
          ${d.nes_sales ?? 0}, ${JSON.stringify(d.rental_rows ?? [])}::jsonb,
          ${d.interest_income ?? 0},
          ${d.souvenir_sales ?? 0}, ${d.other_income_label ?? 'Cash Prize'}, ${d.other_income_amount ?? 0},
          ${d.exp_salaries_wages ?? 0}, ${d.exp_cola ?? 0}, ${d.exp_representation_ce ?? 0},
          ${d.exp_sss ?? 0}, ${d.exp_philhealth ?? 0}, ${d.exp_pagibig ?? 0},
          ${d.exp_transportation ?? 0}, ${d.exp_postage ?? 0}, ${d.exp_telephone ?? 0}, ${d.exp_electric ?? 0},
          ${d.exp_office_supplies ?? 0}, ${d.exp_maintenance_linens ?? 0}, ${d.exp_gasoline_oil ?? 0},
          ${d.exp_maintenance_vehicle ?? 0}, ${d.exp_repair_hq ?? 0}, ${d.exp_trainings ?? 0},
          ${d.exp_conferences ?? 0}, ${d.exp_representation ?? 0}, ${d.exp_donations ?? 0},
          ${d.exp_christmas_program ?? 0}, ${d.exp_escoda_fund ?? 0}, ${d.exp_thinking_day_fund ?? 0},
          ${d.exp_licenses_permits ?? 0}, ${d.exp_legal_fees ?? 0}, ${d.exp_taxes ?? 0},
          ${d.exp_advertising ?? 0}, ${d.exp_tulong_bata ?? 0}, ${d.exp_miscellaneous ?? 0},
          ${d.nes_purchases ?? 0},
          ${d.acc_cash_in_bank_dbp ?? 0}, ${d.acc_petty_cash ?? 0}, ${d.acc_cash_on_hand ?? 0},
          ${d.acc_retirement_fund ?? 0}, ${d.acc_cash_in_bank_maybank ?? 0},
          ${d.acc_checking_account_dbp ?? 0}, ${d.acc_cash_in_bank_pnb ?? 0},
          ${userId}, ${userId}, NOW()
        )
        ON CONFLICT (year, month) DO UPDATE SET
          beginning_balance         = EXCLUDED.beginning_balance,
          council_support_fund      = EXCLUDED.council_support_fund,
          troop_fees                = EXCLUDED.troop_fees,
          district_committee        = EXCLUDED.district_committee,
          career_woman              = EXCLUDED.career_woman,
          honorary_member           = EXCLUDED.honorary_member,
          iccg                      = EXCLUDED.iccg,
          thinking_day_fund_gen     = EXCLUDED.thinking_day_fund_gen,
          nes_sales                 = EXCLUDED.nes_sales,
          rental_rows               = EXCLUDED.rental_rows,
          interest_income           = EXCLUDED.interest_income,
          souvenir_sales            = EXCLUDED.souvenir_sales,
          other_income_label        = EXCLUDED.other_income_label,
          other_income_amount       = EXCLUDED.other_income_amount,
          exp_salaries_wages        = EXCLUDED.exp_salaries_wages,
          exp_cola                  = EXCLUDED.exp_cola,
          exp_representation_ce     = EXCLUDED.exp_representation_ce,
          exp_sss                   = EXCLUDED.exp_sss,
          exp_philhealth            = EXCLUDED.exp_philhealth,
          exp_pagibig               = EXCLUDED.exp_pagibig,
          exp_transportation        = EXCLUDED.exp_transportation,
          exp_postage               = EXCLUDED.exp_postage,
          exp_telephone             = EXCLUDED.exp_telephone,
          exp_electric              = EXCLUDED.exp_electric,
          exp_office_supplies       = EXCLUDED.exp_office_supplies,
          exp_maintenance_linens    = EXCLUDED.exp_maintenance_linens,
          exp_gasoline_oil          = EXCLUDED.exp_gasoline_oil,
          exp_maintenance_vehicle   = EXCLUDED.exp_maintenance_vehicle,
          exp_repair_hq             = EXCLUDED.exp_repair_hq,
          exp_trainings             = EXCLUDED.exp_trainings,
          exp_conferences           = EXCLUDED.exp_conferences,
          exp_representation        = EXCLUDED.exp_representation,
          exp_donations             = EXCLUDED.exp_donations,
          exp_christmas_program     = EXCLUDED.exp_christmas_program,
          exp_escoda_fund           = EXCLUDED.exp_escoda_fund,
          exp_thinking_day_fund     = EXCLUDED.exp_thinking_day_fund,
          exp_licenses_permits      = EXCLUDED.exp_licenses_permits,
          exp_legal_fees            = EXCLUDED.exp_legal_fees,
          exp_taxes                 = EXCLUDED.exp_taxes,
          exp_advertising           = EXCLUDED.exp_advertising,
          exp_tulong_bata           = EXCLUDED.exp_tulong_bata,
          exp_miscellaneous         = EXCLUDED.exp_miscellaneous,
          nes_purchases             = EXCLUDED.nes_purchases,
          acc_cash_in_bank_dbp      = EXCLUDED.acc_cash_in_bank_dbp,
          acc_petty_cash            = EXCLUDED.acc_petty_cash,
          acc_cash_on_hand          = EXCLUDED.acc_cash_on_hand,
          acc_retirement_fund       = EXCLUDED.acc_retirement_fund,
          acc_cash_in_bank_maybank  = EXCLUDED.acc_cash_in_bank_maybank,
          acc_checking_account_dbp  = EXCLUDED.acc_checking_account_dbp,
          acc_cash_in_bank_pnb      = EXCLUDED.acc_cash_in_bank_pnb,
          updated_by                = EXCLUDED.updated_by,
          updated_at                = NOW()
        RETURNING *
      `;

      return res.json({ report });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── GET /api/reports/ledger — aggregated ledger from sales, payroll, vouchers ─
// ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  "/ledger",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const from = (req.query.from as string) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const to   = (req.query.to   as string) || new Date().toISOString().slice(0, 10);

      // Sales receipts
      const sales = await sql<LedgerEntryRow[]>`
        SELECT
          s.created_at::date                       AS date,
          s.sale_number                            AS reference,
          'POS Sale'                               AS description,
          s.total_amount                           AS debit,
          0                                        AS credit,
          'sale'                                   AS entry_type
        FROM public.sales s
        WHERE s.status != 'voided'
          AND s.created_at::date >= ${from}
          AND s.created_at::date <= ${to}
        ORDER BY s.created_at
      `;

      // Payroll disbursements
      const payroll = await sql<LedgerEntryRow[]>`
        SELECT
          COALESCE(p.processed_at, p.updated_at)::date  AS date,
          p.payroll_number                               AS reference,
          'Payroll: ' || e.full_name                     AS description,
          0                                              AS debit,
          p.net_salary                                   AS credit,
          'payroll'                                      AS entry_type
        FROM public.payroll p
        JOIN public.employees e ON e.id = p.employee_id
        WHERE p.status = 'paid'
          AND COALESCE(p.processed_at, p.updated_at)::date >= ${from}
          AND COALESCE(p.processed_at, p.updated_at)::date <= ${to}
        ORDER BY p.processed_at
      `;

      // Posted vouchers
      const vouchers = await sql<LedgerEntryRow[]>`
        SELECT
          v.posted_at::date                        AS date,
          v.voucher_number                         AS reference,
          v.description                            AS description,
          CASE WHEN v.voucher_type = 'receipt' THEN v.amount ELSE 0 END  AS debit,
          CASE WHEN v.voucher_type != 'receipt' THEN v.amount ELSE 0 END AS credit,
          'voucher'                                AS entry_type
        FROM public.vouchers v
        WHERE v.status = 'posted'
          AND v.posted_at::date >= ${from}
          AND v.posted_at::date <= ${to}
        ORDER BY v.posted_at
      `;

      // Merge and sort by date
      const allEntries = [...sales, ...payroll, ...vouchers].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Running balance
      let balance = 0;
      const ledger = allEntries.map((row: LedgerEntryRow) => {
        balance += Number(row.debit) - Number(row.credit);
        return { ...row, balance };
      });

      return res.json({ ledger });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── GET /api/reports/disbursement-journal?year=Y&month=M ─────────────────────
router.get(
  "/disbursement-journal",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const year  = parseInt(req.query.year  as string, 10) || new Date().getFullYear();
      const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
      const from  = new Date(year, month - 1, 1);
      const to    = new Date(year, month, 0, 23, 59, 59);

      const vouchers = await sql`
        SELECT
          v.id, v.voucher_number, v.voucher_type,
          v.amount::numeric AS amount,
          v.description, v.status, v.created_at,
          v.posted_at,
          p.full_name  AS created_by_name,
          ap.full_name AS approved_by_name,
          coa.code     AS account_code,
          coa.name     AS account_name,
          coa.account_type,
          coa.category AS account_category
        FROM public.vouchers v
        LEFT JOIN public.profiles p   ON p.id  = v.created_by
        LEFT JOIN public.profiles ap  ON ap.id = v.approved_by
        LEFT JOIN public.chart_of_accounts coa ON coa.id = v.account_id
        WHERE v.voucher_type IN ('payment','payroll','journal')
          AND v.status = 'posted'
          AND v.created_at >= ${from}
          AND v.created_at <= ${to}
          AND EXISTS (
            SELECT 1
            FROM public.journal_entries je
            WHERE je.source_key = ('voucher:posted:' || v.id::text)
          )
        ORDER BY v.created_at
      `;

      const payroll = await sql`
        SELECT
          py.id, py.payroll_number,
          py.period_start, py.period_end,
          py.basic_salary::numeric  AS basic_salary,
          py.overtime_pay::numeric  AS overtime_pay,
          py.cola::numeric          AS cola,
          py.sss::numeric           AS sss,
          py.philhealth::numeric    AS philhealth,
          py.pagibig::numeric       AS pagibig,
          py.tax_deducted::numeric  AS tax_deducted,
          py.deductions::numeric    AS deductions,
          py.net_salary::numeric    AS net_salary,
          py.status,
          e.full_name AS employee_name,
          e.position
        FROM public.payroll py
        LEFT JOIN public.employees e ON e.id = py.employee_id
        WHERE py.period_start >= ${from.toISOString().slice(0,10)}
          AND py.period_end   <= ${to.toISOString().slice(0,10)}
          AND py.status = 'paid'
          AND EXISTS (
            SELECT 1
            FROM public.journal_entries je
            WHERE je.source_key = ('payroll:paid:' || py.id::text)
          )
        ORDER BY py.period_start, e.full_name
      `;

      return res.json({ vouchers, payroll });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── GET /api/reports/receipts-journal?year=Y&month=M ─────────────────────────
router.get(
  "/receipts-journal",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const year  = parseInt(req.query.year  as string, 10) || new Date().getFullYear();
      const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;
      const from  = new Date(year, month - 1, 1);
      const to    = new Date(year, month, 0, 23, 59, 59);
      const fromD = from.toISOString().slice(0, 10);
      const toD   = to.toISOString().slice(0, 10);

      const sales = await sql`
        SELECT
          s.id, s.sale_number AS receipt_number,
          s.created_at, s.total_amount::numeric AS total_amount,
          s.payment_method, s.status,
          p.full_name AS cashier_name,
          COALESCE(
            json_agg(
              json_build_object(
                'category_name', COALESCE(pc.name,'Uncategorized'),
                'line_total', (si.quantity * si.unit_price)::numeric
              )
            ) FILTER (WHERE si.id IS NOT NULL),
            '[]'
          ) AS items
        FROM public.sales s
        LEFT JOIN public.profiles p   ON p.id  = s.cashier_id
        LEFT JOIN public.sale_items si ON si.sale_id = s.id
        LEFT JOIN public.products pr   ON pr.id = si.product_id
        LEFT JOIN public.product_categories pc ON pc.id = pr.category_id
        WHERE s.status != 'voided'
          AND s.created_at >= ${from}
          AND s.created_at <= ${to}
        GROUP BY s.id, p.full_name
        ORDER BY s.created_at
      `;

      const rentals = await sql`
        SELECT
          rb.id, rb.booking_date AS start_date,
          rb.initial_payment::numeric AS amount,
          rb.status,
          rs.name AS space_name,
          s.sale_number AS receipt_number,
          s.created_at
        FROM public.rental_bookings rb
        LEFT JOIN public.rental_spaces rs ON rs.id = rb.rental_space_id
        LEFT JOIN public.sales s          ON s.id  = rb.sale_id
        WHERE rb.status != 'cancelled'
          AND rb.booking_date >= ${fromD}
          AND rb.booking_date <= ${toD}
        ORDER BY rb.booking_date
      `;

      const receiptVouchers = await sql`
        SELECT
          v.id, v.voucher_number,
          v.amount::numeric AS amount,
          v.description, v.status, v.created_at,
          p.full_name AS created_by_name
        FROM public.vouchers v
        LEFT JOIN public.profiles p ON p.id = v.created_by
        WHERE v.voucher_type = 'receipt'
          AND v.created_at >= ${from}
          AND v.created_at <= ${to}
        ORDER BY v.created_at
      `;

      return res.json({ sales, rentals, receiptVouchers });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

export default router;
