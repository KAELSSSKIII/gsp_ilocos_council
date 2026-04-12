import sql from "./db";
import { ensureAdminAuditLogTable } from "./services/auditLog";

const statements = [
  `
    DO $$
    BEGIN
      CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `,
  `
    DO $$
    BEGIN
      CREATE TYPE public.account_category AS ENUM (
        'current_asset',
        'fixed_asset',
        'current_liability',
        'long_term_liability',
        'equity',
        'revenue',
        'cost_of_sales',
        'operating_expense',
        'other_income',
        'other_expense'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `,
  `
    DO $$
    BEGIN
      CREATE TYPE public.normal_balance AS ENUM ('debit', 'credit');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `,
  `
    CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      account_type public.account_type NOT NULL,
      category public.account_category NOT NULL,
      normal_balance public.normal_balance NOT NULL,
      parent_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  `
    ALTER TABLE public.product_categories
    ADD COLUMN IF NOT EXISTS revenue_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
  `,
  `
    ALTER TABLE public.vouchers
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
  `,
  `
    CREATE TABLE IF NOT EXISTS public.journal_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_number TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      source_key TEXT UNIQUE,
      reference_type TEXT,
      reference_id UUID,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by UUID REFERENCES public.profiles(id),
      posted_by UUID REFERENCES public.profiles(id),
      posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  `
    ALTER TABLE public.journal_entries
    ADD COLUMN IF NOT EXISTS source_key TEXT;
  `,
  `
    CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
      account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
      line_number INTEGER NOT NULL,
      description TEXT,
      debit NUMERIC(14,2) NOT NULL DEFAULT 0,
      credit NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT journal_entry_lines_debit_credit_check CHECK (
        (debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0)
      ),
      CONSTRAINT journal_entry_lines_unique_line UNIQUE (journal_entry_id, line_number)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS public.accounting_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mapping_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT,
      account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  `CREATE INDEX IF NOT EXISTS chart_of_accounts_type_idx ON public.chart_of_accounts (account_type, category);`,
  `CREATE INDEX IF NOT EXISTS chart_of_accounts_parent_idx ON public.chart_of_accounts (parent_account_id);`,
  `CREATE INDEX IF NOT EXISTS chart_of_accounts_active_idx ON public.chart_of_accounts (is_active);`,
  `CREATE INDEX IF NOT EXISTS accounting_mappings_account_idx ON public.accounting_mappings (account_id);`,
  `CREATE INDEX IF NOT EXISTS journal_entries_entry_date_idx ON public.journal_entries (entry_date DESC);`,
  `CREATE INDEX IF NOT EXISTS journal_entries_status_idx ON public.journal_entries (status);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_key_idx ON public.journal_entries (source_key) WHERE source_key IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS journal_entry_lines_account_idx ON public.journal_entry_lines (account_id);`,
  `
    INSERT INTO public.chart_of_accounts (
      code, name, account_type, category, normal_balance, description, is_system
    ) VALUES
      ('1010', 'Cash on Hand', 'asset', 'current_asset', 'debit', 'Primary petty cash and till balances.', true),
      ('1020', 'Cash in Bank', 'asset', 'current_asset', 'debit', 'Depository bank balances.', true),
      ('1100', 'Accounts Receivable', 'asset', 'current_asset', 'debit', 'Customer receivables from invoices.', true),
      ('1200', 'Inventory', 'asset', 'current_asset', 'debit', 'Merchandise inventory on hand.', true),
      ('1500', 'Equipment', 'asset', 'fixed_asset', 'debit', 'Office and operational equipment.', true),
      ('2000', 'Accounts Payable', 'liability', 'current_liability', 'credit', 'Vendor obligations awaiting payment.', true),
      ('2050', 'Output Tax Payable', 'liability', 'current_liability', 'credit', 'VAT/sales tax collected from customers, payable to BIR.', true),
      ('2100', 'Accrued Payroll', 'liability', 'current_liability', 'credit', 'Outstanding payroll liabilities.', true),
      ('3000', 'Fund Balance', 'equity', 'equity', 'credit', 'Accumulated organizational equity.', true),
      ('4000', 'Sales Revenue', 'income', 'revenue', 'credit', 'Revenue from POS sales.', true),
      ('4100', 'Rental Income', 'income', 'revenue', 'credit', 'Revenue from rental operations.', true),
      ('4200', 'Other Income', 'income', 'other_income', 'credit', 'Other posted receipt income.', true),
      ('5000', 'Cost of Goods Sold', 'expense', 'cost_of_sales', 'debit', 'Inventory cost recognized on sales.', true),
      ('6100', 'Salaries and Wages Expense', 'expense', 'operating_expense', 'debit', 'Gross payroll expense.', true),
      ('6110', 'Payroll Contributions Expense', 'expense', 'operating_expense', 'debit', 'Employer payroll contributions.', true),
      ('6200', 'Utilities Expense', 'expense', 'operating_expense', 'debit', 'Electricity, water, and similar utilities.', true),
      ('6300', 'Office Supplies Expense', 'expense', 'operating_expense', 'debit', 'Office and admin supplies.', true),
      ('6900', 'Miscellaneous Expense', 'expense', 'other_expense', 'debit', 'Fallback expense bucket.', true)
    ON CONFLICT (code) DO NOTHING;
  `,
  `
    INSERT INTO public.accounting_mappings (mapping_key, label, description, account_id)
    SELECT seed.mapping_key, seed.label, seed.description, coa.id
    FROM (
      VALUES
        ('sales_cash', 'POS Cash Receipts', 'Debit account used when POS sales are paid in cash.', '1010'),
        ('sales_cashless', 'POS Non-cash Receipts', 'Debit account used when POS sales are paid through bank, card, or online.', '1020'),
        ('sales_merchandise_revenue', 'POS Merchandise Revenue', 'Credit account used for regular POS merchandise revenue.', '4000'),
        ('sales_rental_revenue', 'POS Rental Revenue', 'Credit account used for rental income captured through POS.', '4100'),
        ('sales_cogs', 'Cost of Goods Sold', 'Debit account used when inventory cost is recognized on sale.', '5000'),
        ('sales_inventory', 'Inventory Asset', 'Credit account used to reduce inventory on sale.', '1200'),
        ('voucher_receipt_cash', 'Receipt Voucher Cash', 'Debit account used for posted receipt vouchers.', '1020'),
        ('voucher_receipt_income', 'Receipt Voucher Income', 'Credit account used for posted receipt vouchers.', '4200'),
        ('voucher_payment_default_expense', 'Voucher Default Expense', 'Debit fallback account used for payment and journal vouchers.', '6900'),
        ('voucher_payment_utilities_expense', 'Voucher Utilities Expense', 'Expense account used when voucher descriptions indicate utilities.', '6200'),
        ('voucher_payment_office_expense', 'Voucher Office Supplies Expense', 'Expense account used when voucher descriptions indicate office supplies.', '6300'),
        ('voucher_payment_cash', 'Voucher Cash Disbursement', 'Credit account used when payment vouchers reduce cash.', '1020'),
        ('voucher_journal_offset', 'Voucher Journal Offset', 'Credit offset account used for journal vouchers.', '2000'),
        ('voucher_payroll_expense', 'Voucher Payroll Expense', 'Debit account used for payroll vouchers.', '6100'),
        ('voucher_payroll_liability', 'Voucher Payroll Liability', 'Credit account used for payroll voucher liabilities.', '2100'),
        ('payroll_expense', 'Payroll Expense', 'Debit account used for paid payroll gross amounts.', '6100'),
        ('payroll_cash', 'Payroll Cash', 'Credit account used for net payroll cash disbursement.', '1020'),
        ('payroll_liability', 'Payroll Liability', 'Credit account used for payroll withholdings.', '2100'),
        ('invoice_receivable', 'Accounts Receivable', 'Debit account used when invoices are issued.', '1100'),
        ('invoice_revenue', 'Invoice Revenue', 'Credit account used when invoices are issued.', '4000'),
        ('invoice_cash', 'Invoice Cash Collections', 'Debit account used when invoices are paid.', '1020'),
        ('sales_tax_payable', 'Sales Tax Payable', 'Liability account used for tax/VAT collected on POS sales.', '2050'),
        ('invoice_tax_payable', 'Invoice Tax Payable', 'Liability account used for tax/VAT on invoicing.', '2050')
    ) AS seed(mapping_key, label, description, account_code)
    JOIN public.chart_of_accounts coa ON coa.code = seed.account_code
    ON CONFLICT (mapping_key) DO NOTHING;
  `,
  // ── Migrate tax payable accounts to 2050 (idempotent) ──────────────────────
  `
    DO $$
    DECLARE v_2050 UUID;
    BEGIN
      SELECT id INTO v_2050 FROM public.chart_of_accounts WHERE code = '2050';
      IF v_2050 IS NOT NULL THEN
        UPDATE public.accounting_mappings
        SET account_id = v_2050, updated_at = NOW()
        WHERE mapping_key IN ('sales_tax_payable', 'invoice_tax_payable')
          AND account_id != v_2050;
      END IF;
    END $$;
  `,
];

let foundationPromise: Promise<void> | null = null;

export async function ensureAccountingFoundation() {
  if (!foundationPromise) {
    foundationPromise = (async () => {
      for (const statement of statements) {
        await sql.unsafe(statement);
      }

      await ensureAdminAuditLogTable();
    })();
  }

  return foundationPromise;
}
