/**
 * Accounting routes (QuickBooks-style)
 *
 * GET /api/accounting/overview?year=YYYY   → monthly revenue/expense + YTD KPIs + breakdowns
 * GET /api/accounting/pnl?from=&to=        → full Profit & Loss breakdown
 */
import { Router } from "express";
import sql, { asSqlClient, type TransactionClient } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { postManualJournalEntry } from "../services/accountingPosting";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { logger } from "../logger";
import {
  accountingMappingsUpdateSchema,
  idParamSchema,
  manualJournalEntryCreateSchema,
} from "../validation/schemas";
import { validateParams } from "../middleware/validate";

const router = Router();

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Internal server error";
type AccountingMappingRow = {
  id: string;
  mapping_key: string;
  label: string;
  description: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
};
type LedgerRow = {
  date: string;
  reference: string;
  entry_type: string;
  source_key: string | null;
  entry_description: string | null;
  line_description: string | null;
  debit: string | number;
  credit: string | number;
  account_id: string;
  account_code: string;
  account_name: string;
};
type TrialBalanceRow = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  category: string;
  normal_balance: string;
  total_debit: string | number;
  total_credit: string | number;
  balance: string | number;
};
type BalanceSheetRow = {
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity";
  category: string;
  normal_balance: string;
  balance: string | number;
};
type OverviewMonthlyRow = {
  month: string | number;
  revenue: string | number;
  expenses: string | number;
};
type CategoryAmountRow = {
  category: string;
  amount: string | number;
};
type RentalIncomeRow = {
  space_name: string;
  amount: string | number;
};
type VoucherExpenseRow = {
  voucher_number: string;
  description: string;
  amount: string | number;
  date: string;
};

const ACCOUNTING_MAPPING_DEFINITIONS = [
  { key: "sales_cash", label: "POS Cash Receipts", description: "Cash account used for cash POS sales." },
  { key: "sales_cashless", label: "POS Non-cash Receipts", description: "Bank or clearing account used for card/online POS sales." },
  { key: "sales_merchandise_revenue", label: "POS Merchandise Revenue", description: "Revenue account for merchandise sold through POS." },
  { key: "sales_rental_revenue", label: "POS Rental Revenue", description: "Revenue account for rentals sold through POS." },
  { key: "sales_cogs", label: "Cost of Goods Sold", description: "Expense account recognized when merchandise inventory is sold." },
  { key: "sales_inventory", label: "Inventory Asset", description: "Inventory asset account reduced when merchandise is sold." },
  { key: "voucher_receipt_cash", label: "Receipt Voucher Cash", description: "Cash/bank account used when receipt vouchers are posted." },
  { key: "voucher_receipt_income", label: "Receipt Voucher Income", description: "Income account credited for posted receipt vouchers." },
  { key: "voucher_payment_default_expense", label: "Voucher Default Expense", description: "Fallback expense account used for payment/journal vouchers." },
  { key: "voucher_payment_utilities_expense", label: "Voucher Utilities Expense", description: "Expense account used when voucher descriptions indicate utilities." },
  { key: "voucher_payment_office_expense", label: "Voucher Office Supplies Expense", description: "Expense account used when voucher descriptions indicate office supplies." },
  { key: "voucher_payment_cash", label: "Voucher Cash Disbursement", description: "Cash/bank account reduced for payment vouchers." },
  { key: "voucher_journal_offset", label: "Voucher Journal Offset", description: "Default offset account used for journal vouchers." },
  { key: "voucher_payroll_expense", label: "Voucher Payroll Expense", description: "Expense account used for payroll vouchers." },
  { key: "voucher_payroll_liability", label: "Voucher Payroll Liability", description: "Liability account credited for payroll vouchers." },
  { key: "payroll_expense", label: "Payroll Expense", description: "Expense account used for paid payroll gross amounts." },
  { key: "payroll_cash", label: "Payroll Cash", description: "Cash/bank account used for net payroll disbursement." },
  { key: "payroll_liability", label: "Payroll Liability", description: "Liability account used for payroll withholdings." },
  { key: "invoice_receivable", label: "Accounts Receivable", description: "Receivable account used when invoices are issued." },
  { key: "invoice_revenue", label: "Invoice Revenue", description: "Revenue account used when invoices are issued." },
  { key: "invoice_cash", label: "Invoice Cash Collections", description: "Cash/bank account used when invoices are collected." },
  { key: "sales_tax_payable", label: "Sales Tax Payable", description: "Liability account used for POS tax/VAT collections." },
  { key: "invoice_tax_payable", label: "Invoice Tax Payable", description: "Liability account used for invoice tax/VAT." },
] as const;

router.get(
  "/mappings",
  requireAuth,
  requireRole("admin", "accountant"),
  async (_req, res) => {
    try {
      const rows = await sql<AccountingMappingRow[]>`
        SELECT
          am.id,
          am.mapping_key,
          am.label,
          am.description,
          am.account_id,
          coa.code AS account_code,
          coa.name AS account_name
        FROM public.accounting_mappings am
        JOIN public.chart_of_accounts coa ON coa.id = am.account_id
        ORDER BY am.label
      `;

      const rowMap = new Map(rows.map((row) => [row.mapping_key, row]));
      const mappings = ACCOUNTING_MAPPING_DEFINITIONS.map((definition) => {
        const row = rowMap.get(definition.key);
        return {
          mapping_key: definition.key,
          label: row?.label ?? definition.label,
          description: row?.description ?? definition.description,
          account_id: row?.account_id ?? null,
          account_code: row?.account_code ?? null,
          account_name: row?.account_name ?? null,
        };
      });

      return res.json({ mappings });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

router.put(
  "/mappings",
  requireAuth,
  requireRole("admin", "accountant"),
  validateBody(accountingMappingsUpdateSchema),
  async (req, res) => {
    try {
      const definitions = new Set<string>(ACCOUNTING_MAPPING_DEFINITIONS.map((item) => item.key));
      const payload = (req.body.mappings as Array<{ mapping_key: string; account_id: string }>)
        .filter((item) => definitions.has(item.mapping_key));

      if (payload.length === 0) {
        return res.status(400).json({ error: "No valid mappings provided" });
      }

      await sql.begin(async (tx: TransactionClient) => {
        const txSql = asSqlClient(tx);
        for (const item of payload) {
          const definition = ACCOUNTING_MAPPING_DEFINITIONS.find((entry) => entry.key === item.mapping_key);
          if (!definition) continue;

          await txSql`
            INSERT INTO public.accounting_mappings (mapping_key, label, description, account_id)
            VALUES (${item.mapping_key}, ${definition.label}, ${definition.description}, ${item.account_id}::uuid)
            ON CONFLICT (mapping_key) DO UPDATE SET
              label = EXCLUDED.label,
              description = EXCLUDED.description,
              account_id = EXCLUDED.account_id,
              updated_at = NOW()
          `;
        }
      });

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.ACCOUNTING_MAPPINGS_UPDATED,
        actorId: req.user!.id,
        entityType: "accounting_mapping",
        summary: "Accounting mappings were updated.",
        metadata: {
          display_name: `${payload.length} mapping${payload.length === 1 ? "" : "s"}`,
          mapping_keys: payload.map((item) => item.mapping_key),
        },
      });

      return res.json({ success: true });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

router.post(
  "/journal-entries",
  requireAuth,
  requireRole("admin", "accountant"),
  validateBody(manualJournalEntryCreateSchema),
  async (req, res) => {
    try {
      const entry = await sql.begin(async (tx: TransactionClient) => {
        const body = req.body as {
          entry_date: string;
          description: string;
          reference_type?: string | null;
          reference_id?: string | null;
          lines: Array<{
            account_id: string;
            description?: string | null;
            debit?: number;
            credit?: number;
          }>;
        };

        const totals = body.lines.reduce(
          (acc, line) => ({
            debit: acc.debit + Number(line.debit ?? 0),
            credit: acc.credit + Number(line.credit ?? 0),
          }),
          { debit: 0, credit: 0 }
        );

        if (Math.round(totals.debit * 100) !== Math.round(totals.credit * 100)) {
          throw new Error("JOURNAL_ENTRY_UNBALANCED");
        }

        return postManualJournalEntry(asSqlClient(tx), {
          entryDate: body.entry_date,
          description: body.description,
          referenceType: body.reference_type ?? "manual",
          referenceId: body.reference_id ?? null,
          createdBy: req.user!.id,
          lines: body.lines.map((line) => ({
            accountId: line.account_id,
            description: line.description ?? null,
            debit: Number(line.debit ?? 0),
            credit: Number(line.credit ?? 0),
          })),
        });
      });

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.JOURNAL_ENTRY_CREATED,
        actorId: req.user!.id,
        entityType: "journal_entry",
        entityId: entry.id,
        summary: `Manual journal entry ${entry.entry_number} was posted.`,
        metadata: {
          display_name: entry.entry_number,
          entry_date: entry.entry_date,
          description: entry.description,
          status: entry.status,
        },
      });

      return res.status(201).json({ entry });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal server error";
      if (message === "JOURNAL_ENTRY_UNBALANCED") {
        return res.status(400).json({ error: "Journal entry must balance before posting" });
      }
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: message });
    }
  }
);

router.get(
  "/journal-entries",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const page      = Math.max(0, parseInt((req.query.page as string) ?? "0", 10) || 0);
      const page_size = Math.min(Math.max(1, parseInt((req.query.page_size as string) ?? "25", 10) || 25), 100);
      const offset    = page * page_size;

      const [countRow] = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM public.journal_entries
      `;
      const total = parseInt(countRow.total, 10);

      const entries = await sql`
        SELECT
          je.id,
          je.entry_number,
          je.entry_date,
          je.source_key,
          je.reference_type,
          je.reference_id,
          je.description,
          je.status,
          je.posted_at,
          je.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', jel.id,
                'line_number', jel.line_number,
                'account_id', jel.account_id,
                'account_code', coa.code,
                'account_name', coa.name,
                'description', jel.description,
                'debit', jel.debit,
                'credit', jel.credit
              ) ORDER BY jel.line_number
            ) FILTER (WHERE jel.id IS NOT NULL),
            '[]'::json
          ) AS lines
        FROM public.journal_entries je
        LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
        LEFT JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
        GROUP BY je.id
        ORDER BY je.entry_date DESC, je.created_at DESC
        LIMIT ${page_size} OFFSET ${offset}
      `;

      return res.json({ data: entries, total, page, page_size });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

router.delete(
  "/journal-entries/:id",
  requireAuth,
  requireRole("admin", "accountant"),
  validateParams(idParamSchema),
  async (req, res) => {
    try {
      const journalEntry = await sql.begin(async (tx: TransactionClient) => {
        const txSql = asSqlClient(tx);
        const [entry] = await txSql<{
          id: string;
          entry_number: string;
          entry_date: string;
          description: string | null;
          source_key: string | null;
          reference_type: string | null;
          status: string;
        }[]>`
          SELECT id, entry_number, entry_date, description, source_key, reference_type, status
          FROM public.journal_entries
          WHERE id = ${req.params.id}::uuid
          LIMIT 1
        `;

        if (!entry) {
          return null;
        }

        const isManualEntry = (entry.source_key ?? "").startsWith("manual:")
          || entry.reference_type === "manual"
          || entry.entry_number.startsWith("JE-MAN");

        if (!isManualEntry) {
          throw new Error("JOURNAL_ENTRY_DELETE_FORBIDDEN");
        }

        await txSql`
          DELETE FROM public.journal_entries
          WHERE id = ${entry.id}::uuid
        `;

        return entry;
      });

      if (!journalEntry) {
        return res.status(404).json({ error: "Journal entry not found" });
      }

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.JOURNAL_ENTRY_DELETED,
        actorId: req.user!.id,
        entityType: "journal_entry",
        entityId: journalEntry.id,
        summary: `Manual journal entry ${journalEntry.entry_number} was deleted.`,
        metadata: {
          display_name: journalEntry.entry_number,
          entry_date: journalEntry.entry_date,
          description: journalEntry.description,
          status: journalEntry.status,
        },
      });

      return res.status(204).send();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "JOURNAL_ENTRY_DELETE_FORBIDDEN") {
        return res.status(409).json({ error: "Only manual journal entries can be deleted." });
      }
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

router.get(
  "/account-ledger",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const from = (req.query.from as string) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
      const accountId = (req.query.account_id as string) || null;

      const rows = await sql<LedgerRow[]>`
        SELECT
          je.entry_date AS date,
          je.entry_number AS reference,
          je.reference_type AS entry_type,
          je.source_key,
          je.description AS entry_description,
          jel.description AS line_description,
          jel.debit,
          jel.credit,
          coa.id AS account_id,
          coa.code AS account_code,
          coa.name AS account_name
        FROM public.journal_entries je
        JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
        WHERE je.status = 'posted'
          AND je.entry_date >= ${from}
          AND je.entry_date <= ${to}
          AND (${accountId}::uuid IS NULL OR coa.id = ${accountId}::uuid)
        ORDER BY je.entry_date ASC, je.created_at ASC, jel.line_number ASC
        LIMIT 2000
      `;

      let balance = 0;
      const ledger = rows.map((row: LedgerRow) => {
        balance += Number(row.debit) - Number(row.credit);
        return {
          ...row,
          debit: Number(row.debit),
          credit: Number(row.credit),
          balance,
          is_reversal: typeof row.source_key === "string" && row.source_key.includes("reversed"),
        };
      });

      return res.json({ ledger });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

router.get(
  "/trial-balance",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const asOf = (req.query.as_of as string) || new Date().toISOString().slice(0, 10);
      const rows = await sql<TrialBalanceRow[]>`
        SELECT
          coa.id,
          coa.code,
          coa.name,
          coa.account_type,
          coa.category,
          coa.normal_balance,
          COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.debit ELSE 0 END), 0)::numeric AS total_debit,
          COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.credit ELSE 0 END), 0)::numeric AS total_credit,
          CASE
            WHEN coa.normal_balance = 'debit'
              THEN COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.debit ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.credit ELSE 0 END), 0)
            ELSE COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.credit ELSE 0 END), 0)
               - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.debit ELSE 0 END), 0)
          END::numeric AS balance
        FROM public.chart_of_accounts coa
        LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
        LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
          AND je.status = 'posted'
          AND je.entry_date <= ${asOf}
        GROUP BY coa.id
        HAVING COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.debit ELSE 0 END), 0) <> 0
          OR COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.credit ELSE 0 END), 0) <> 0
        ORDER BY coa.code
      `;

      const totals = rows.reduce((acc: { debit: number; credit: number }, row: TrialBalanceRow) => ({
        debit: acc.debit + Number(row.total_debit),
        credit: acc.credit + Number(row.total_credit),
      }), { debit: 0, credit: 0 });

      return res.json({
        as_of: asOf,
        rows: rows.map((row: TrialBalanceRow) => ({
          ...row,
          total_debit: Number(row.total_debit),
          total_credit: Number(row.total_credit),
          balance: Number(row.balance),
        })),
        totals,
      });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

router.get(
  "/balance-sheet",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const asOf = (req.query.as_of as string) || new Date().toISOString().slice(0, 10);
      const rows = await sql<BalanceSheetRow[]>`
        SELECT
          coa.code,
          coa.name,
          coa.account_type,
          coa.category,
          coa.normal_balance,
          CASE
            WHEN coa.normal_balance = 'debit'
              THEN COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.debit ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.credit ELSE 0 END), 0)
            ELSE COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.credit ELSE 0 END), 0)
               - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.debit ELSE 0 END), 0)
          END::numeric AS balance
        FROM public.chart_of_accounts coa
        LEFT JOIN public.journal_entry_lines jel ON jel.account_id = coa.id
        LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
          AND je.status = 'posted'
          AND je.entry_date <= ${asOf}
        WHERE coa.account_type IN ('asset', 'liability', 'equity')
        GROUP BY coa.id
        HAVING COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.debit ELSE 0 END), 0) <> 0
          OR COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jel.credit ELSE 0 END), 0) <> 0
        ORDER BY coa.code
      `;

      const assets = rows
        .filter((row: BalanceSheetRow) => row.account_type === "asset")
        .map((row: BalanceSheetRow) => ({ ...row, balance: Number(row.balance) }));
      const liabilities = rows
        .filter((row: BalanceSheetRow) => row.account_type === "liability")
        .map((row: BalanceSheetRow) => ({ ...row, balance: Number(row.balance) }));
      const equity = rows
        .filter((row: BalanceSheetRow) => row.account_type === "equity")
        .map((row: BalanceSheetRow) => ({ ...row, balance: Number(row.balance) }));

      const totalAssets = assets.reduce((sum: number, row) => sum + row.balance, 0);
      const totalLiabilities = liabilities.reduce((sum: number, row) => sum + row.balance, 0);
      const totalEquity = equity.reduce((sum: number, row) => sum + row.balance, 0);

      return res.json({
        as_of: asOf,
        assets,
        liabilities,
        equity,
        totals: {
          assets: totalAssets,
          liabilities: totalLiabilities,
          equity: totalEquity,
          liabilities_and_equity: totalLiabilities + totalEquity,
        },
      });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── GET /api/accounting/overview ─────────────────────────────────────────────
router.get(
  "/overview",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

      // Monthly revenue vs expenses
      const monthly = await sql<OverviewMonthlyRow[]>`
        WITH months AS (SELECT generate_series(1, 12) AS m),
        sales_monthly AS (
          SELECT EXTRACT(MONTH FROM created_at)::int AS m, SUM(total_amount)::numeric AS rev
          FROM public.sales
          WHERE status != 'voided' AND EXTRACT(YEAR FROM created_at) = ${year}
          GROUP BY 1
        ),
        rental_monthly AS (
          SELECT EXTRACT(MONTH FROM booking_date::date)::int AS m, SUM(initial_payment)::numeric AS rev
          FROM public.rental_bookings
          WHERE status != 'cancelled' AND EXTRACT(YEAR FROM booking_date::date) = ${year}
          GROUP BY 1
        ),
        payroll_monthly AS (
          SELECT EXTRACT(MONTH FROM COALESCE(processed_at, updated_at))::int AS m, SUM(net_salary)::numeric AS exp
          FROM public.payroll
          WHERE status = 'paid'
            AND EXTRACT(YEAR FROM COALESCE(processed_at, updated_at)) = ${year}
          GROUP BY 1
        ),
        voucher_exp AS (
          SELECT EXTRACT(MONTH FROM posted_at)::int AS m, SUM(amount)::numeric AS exp
          FROM public.vouchers
          WHERE status = 'posted'
            AND voucher_type IN ('payment', 'journal', 'payroll')
            AND EXTRACT(YEAR FROM posted_at) = ${year}
          GROUP BY 1
        )
        SELECT
          mo.m AS month,
          COALESCE(s.rev, 0) + COALESCE(r.rev, 0) AS revenue,
          COALESCE(p.exp, 0) + COALESCE(v.exp, 0) AS expenses
        FROM months mo
        LEFT JOIN sales_monthly  s ON s.m = mo.m
        LEFT JOIN rental_monthly r ON r.m = mo.m
        LEFT JOIN payroll_monthly p ON p.m = mo.m
        LEFT JOIN voucher_exp     v ON v.m = mo.m
        ORDER BY mo.m
      `;

      // YTD totals
      const [ytdSales] = await sql`
        SELECT
          COALESCE(SUM(total_amount), 0)::numeric AS total
        FROM public.sales
        WHERE status != 'voided' AND EXTRACT(YEAR FROM created_at) = ${year}
      `;
      const [ytdRental] = await sql`
        SELECT COALESCE(SUM(initial_payment), 0)::numeric AS total
        FROM public.rental_bookings
        WHERE status != 'cancelled' AND EXTRACT(YEAR FROM booking_date::date) = ${year}
      `;
      const [ytdReceiptVouchers] = await sql`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM public.vouchers
        WHERE status = 'posted' AND voucher_type = 'receipt'
          AND EXTRACT(YEAR FROM posted_at) = ${year}
      `;
      const [ytdPayroll] = await sql`
        SELECT COALESCE(SUM(net_salary), 0)::numeric AS total
        FROM public.payroll
        WHERE status = 'paid'
          AND EXTRACT(YEAR FROM COALESCE(processed_at, updated_at)) = ${year}
      `;
      const [ytdVoucherExp] = await sql`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM public.vouchers
        WHERE status = 'posted'
          AND voucher_type IN ('payment', 'journal', 'payroll')
          AND EXTRACT(YEAR FROM posted_at) = ${year}
      `;
      const [outstanding] = await sql`
        SELECT COALESCE(SUM(total_amount), 0)::numeric AS total
        FROM public.invoices
        WHERE status IN ('sent', 'overdue')
          AND EXTRACT(YEAR FROM issue_date) = ${year}
      `;

      const totalRevenue  = Number(ytdSales.total) + Number(ytdRental.total) + Number(ytdReceiptVouchers.total);
      const totalExpenses = Number(ytdPayroll.total) + Number(ytdVoucherExp.total);

      return res.json({
        monthly: monthly.map((row: OverviewMonthlyRow) => ({
          month:      Number(row.month),
          monthLabel: MONTH_LABELS[Number(row.month) - 1],
          revenue:    Number(row.revenue),
          expenses:   Number(row.expenses),
        })),
        ytd: {
          totalRevenue,
          totalExpenses,
          netIncome:           totalRevenue - totalExpenses,
          outstandingInvoices: Number(outstanding.total),
        },
        incomeBreakdown: [
          { name: "POS Sales",       value: Number(ytdSales.total) },
          { name: "Rental Income",   value: Number(ytdRental.total) },
          { name: "Other Receipts",  value: Number(ytdReceiptVouchers.total) },
        ].filter((d) => d.value > 0),
        expenseBreakdown: [
          { name: "Payroll",          value: Number(ytdPayroll.total) },
          { name: "Voucher Expenses", value: Number(ytdVoucherExp.total) },
        ].filter((d) => d.value > 0),
      });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

// ── GET /api/accounting/pnl ───────────────────────────────────────────────────
router.get(
  "/pnl",
  requireAuth,
  requireRole("admin", "accountant"),
  async (req, res) => {
    try {
      const now   = new Date();
      const from  = (req.query.from as string) || `${now.getFullYear()}-01-01`;
      const to    = (req.query.to   as string) || now.toISOString().slice(0, 10);

      // Income — POS sales by category (net of discount, matching GL postings)
      const salesByCategory = await sql<CategoryAmountRow[]>`
        SELECT
          COALESCE(pc.name, 'Uncategorized') AS category,
          SUM(
            si.subtotal
            * (s.subtotal - COALESCE(s.discount_amount, 0))
            / NULLIF(s.subtotal, 0)
          )::numeric AS amount
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        JOIN public.products p ON p.id = si.product_id
        LEFT JOIN public.product_categories pc ON pc.id = p.category_id
        WHERE s.status != 'voided'
          AND s.created_at::date >= ${from}
          AND s.created_at::date <= ${to}
        GROUP BY pc.name
        ORDER BY amount DESC
      `;

      // Income — Rental
      const rentalIncome = await sql<RentalIncomeRow[]>`
        SELECT
          rs.name AS space_name,
          SUM(rb.initial_payment)::numeric AS amount
        FROM public.rental_bookings rb
        JOIN public.rental_spaces rs ON rs.id = rb.rental_space_id
        WHERE rb.status != 'cancelled'
          AND rb.booking_date >= ${from}
          AND rb.booking_date <= ${to}
        GROUP BY rs.name
        ORDER BY amount DESC
      `;

      // Income — Receipt vouchers (other income)
      const [receiptVouchers] = await sql`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM public.vouchers
        WHERE status = 'posted' AND voucher_type = 'receipt'
          AND posted_at::date >= ${from}
          AND posted_at::date <= ${to}
      `;

      // Expenses — Payroll breakdown
      const [payrollTotals] = await sql`
        SELECT
          COALESCE(SUM(basic_salary), 0)::numeric  AS salaries,
          COALESCE(SUM(cola), 0)::numeric           AS cola,
          COALESCE(SUM(sss), 0)::numeric            AS sss,
          COALESCE(SUM(philhealth), 0)::numeric     AS philhealth,
          COALESCE(SUM(pagibig), 0)::numeric        AS pagibig,
          COALESCE(SUM(net_salary), 0)::numeric     AS total
        FROM public.payroll
        WHERE status = 'paid'
          AND COALESCE(processed_at, updated_at)::date >= ${from}
          AND COALESCE(processed_at, updated_at)::date <= ${to}
      `;

      // Expenses — Voucher payments/journal entries
      const voucherExpenses = await sql<VoucherExpenseRow[]>`
        SELECT
          description,
          amount::numeric AS amount,
          posted_at::date AS date,
          voucher_number
        FROM public.vouchers
        WHERE status = 'posted'
          AND voucher_type IN ('payment', 'journal')
          AND posted_at::date >= ${from}
          AND posted_at::date <= ${to}
        ORDER BY posted_at DESC
      `;

      const totalSales   = salesByCategory.reduce((s: number, r: CategoryAmountRow) => s + Number(r.amount), 0);
      const totalRental  = rentalIncome.reduce((s: number, r: RentalIncomeRow) => s + Number(r.amount), 0);
      const otherIncome  = Number(receiptVouchers.total);
      const totalIncome  = totalSales + totalRental + otherIncome;

      const payroll = {
        salaries:   Number(payrollTotals?.salaries   ?? 0),
        cola:       Number(payrollTotals?.cola        ?? 0),
        sss:        Number(payrollTotals?.sss         ?? 0),
        philhealth: Number(payrollTotals?.philhealth  ?? 0),
        pagibig:    Number(payrollTotals?.pagibig     ?? 0),
        total:      Number(payrollTotals?.total       ?? 0),
      };
      const voucherExpTotal = voucherExpenses.reduce((s: number, r: VoucherExpenseRow) => s + Number(r.amount), 0);
      const totalExpenses   = payroll.total + voucherExpTotal;

      return res.json({
        from,
        to,
        income: {
          salesByCategory: salesByCategory.map((r: CategoryAmountRow) => ({ category: r.category, amount: Number(r.amount) })),
          rentalIncome:    rentalIncome.map((r: RentalIncomeRow) => ({ space_name: r.space_name, amount: Number(r.amount) })),
          otherIncome,
          totalIncome,
        },
        expenses: {
          payroll,
          voucherExpenses: voucherExpenses.map((r: VoucherExpenseRow) => ({
            voucher_number: r.voucher_number,
            description:    r.description,
            amount:         Number(r.amount),
            date:           r.date,
          })),
          totalExpenses,
        },
        netIncome: totalIncome - totalExpenses,
      });
    } catch (err: unknown) {
      logger.error({ err }, "Route error");
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  }
);

export default router;
