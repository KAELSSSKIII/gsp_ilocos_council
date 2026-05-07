-- ============================================================
-- GSP (Girl Scout POS) — Self-Hosted PostgreSQL Schema
-- Consolidates all 24 Supabase migrations into a single file.
-- Requires PostgreSQL 12+ (for GENERATED ALWAYS AS ... STORED)
-- Run once on a fresh database:
--   psql -U gsp_user -d gsp_db -f db/schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE public.user_role AS ENUM ('admin', 'accountant', 'cashier', 'hr');
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'online');
CREATE TYPE public.transaction_type AS ENUM ('sale', 'expense', 'payroll', 'adjustment');
CREATE TYPE public.voucher_type AS ENUM ('payment', 'receipt', 'journal', 'payroll');
CREATE TYPE public.voucher_status AS ENUM ('pending', 'approved', 'posted', 'cancelled');
CREATE TYPE public.rental_space_type AS ENUM ('hall', 'room');
CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');
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
CREATE TYPE public.normal_balance AS ENUM ('debit', 'credit');

-- ─── USERS (replaces Supabase auth.users) ─────────────────────────────────────
-- password_hash stores bcrypt hashes (same algorithm Supabase uses).
-- Existing Supabase encrypted_password values import directly.

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        NOT NULL UNIQUE,
  email         TEXT        UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROFILES ─────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id         UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name  TEXT        NOT NULL,
  username   TEXT        NOT NULL,
  email      TEXT,
  role       user_role   NOT NULL DEFAULT 'cashier',
  branch     TEXT,
  phone      TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USER ROLES (secure role management, mirrors Supabase migration) ──────────

CREATE TABLE IF NOT EXISTS public.user_roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        user_role   NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID        REFERENCES public.users(id),
  UNIQUE (user_id, role)
);

-- ─── PRODUCT CATEGORIES ───────────────────────────────────────────────────────

CREATE TABLE public.product_categories (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────────

CREATE TABLE public.products (
  id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku              TEXT           NOT NULL UNIQUE,
  name             TEXT           NOT NULL,
  description      TEXT,
  category_id      UUID           REFERENCES public.product_categories(id),
  image_url        TEXT,
  size             TEXT,
  cost_price       DECIMAL(10,2)  NOT NULL DEFAULT 0,
  selling_price    DECIMAL(10,2)  NOT NULL,
  stock_quantity   INTEGER        NOT NULL DEFAULT 0,
  reorder_level    INTEGER        NOT NULL DEFAULT 10,
  is_active        BOOLEAN        NOT NULL DEFAULT true,
  supplier_id       UUID,
  last_restocked_at TIMESTAMPTZ,
  restock_interval_days INTEGER,
  begin_inventory  NUMERIC(10,2),
  purchases        NUMERIC(10,2),
  sales_units      NUMERIC(10,2),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ─── MEMBERS (POS discount / loyalty program) ─────────────────────────────────

CREATE TABLE public.members (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          TEXT          NOT NULL UNIQUE,
  name          TEXT          NOT NULL,
  email         TEXT,
  discount_rate NUMERIC(5,2)  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

-- ─── MEMBERSHIP (full membership records, queried by /api/members endpoint) ────

CREATE TABLE public.membership (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     TEXT          NOT NULL,
  membership_id TEXT,
  plan_type     TEXT,
  expiry_date   DATE,
  email         TEXT,
  phone         TEXT,
  status        TEXT          NOT NULL DEFAULT 'active',
  discount_rate NUMERIC(5,2)  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── SALES ────────────────────────────────────────────────────────────────────

CREATE TABLE public.sales (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number       TEXT           NOT NULL UNIQUE,
  cashier_id        UUID           NOT NULL REFERENCES public.profiles(id),
  branch            TEXT,
  subtotal          DECIMAL(10,2)  NOT NULL,
  tax_amount        DECIMAL(10,2)  NOT NULL DEFAULT 0,
  discount_amount   DECIMAL(10,2)  NOT NULL DEFAULT 0,
  total_amount      DECIMAL(10,2)  NOT NULL,
  payment_method    payment_method NOT NULL,
  payment_reference TEXT,
  notes             TEXT,
  member_id         UUID           REFERENCES public.members(id),
  status            TEXT           NOT NULL DEFAULT 'completed',
  receipt_number    INTEGER,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_cashier_id_idx  ON public.sales (cashier_id);
CREATE INDEX IF NOT EXISTS sales_created_at_idx  ON public.sales (created_at DESC);
CREATE INDEX IF NOT EXISTS sales_status_idx      ON public.sales (status);

-- ─── SALE ITEMS ───────────────────────────────────────────────────────────────

CREATE TABLE public.sale_items (
  id         UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id    UUID          NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID          NOT NULL REFERENCES public.products(id),
  quantity   INTEGER       NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_cost  DECIMAL(10,2) NOT NULL,
  subtotal   DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON public.sale_items (sale_id);

-- ─── SALE RECEIPTS ────────────────────────────────────────────────────────────

CREATE TABLE public.sale_receipts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id     UUID        NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_number TEXT        NOT NULL,
  cashier_id  UUID        REFERENCES public.profiles(id),
  member_id   UUID        REFERENCES public.members(id),
  payload     JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at   TIMESTAMPTZ,
  voided_by   UUID        REFERENCES public.profiles(id),
  void_reason TEXT,
  CONSTRAINT sale_receipts_sale_id_unique UNIQUE (sale_id)
);

CREATE INDEX IF NOT EXISTS sale_receipts_sale_number_idx ON public.sale_receipts (sale_number);

-- ─── SALE VOID EVENTS (audit log) ────────────────────────────────────────────

CREATE TABLE public.sale_void_events (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id        UUID        NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_number    TEXT        NOT NULL,
  receipt_number INTEGER,
  void_reason    TEXT,
  voided_by      UUID        REFERENCES public.profiles(id),
  voided_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sale_void_events_sale_id_idx  ON public.sale_void_events (sale_id);
CREATE INDEX IF NOT EXISTS sale_void_events_voided_at_idx ON public.sale_void_events (voided_at);

-- --- ADMIN AUDIT LOGS ---

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action         TEXT        NOT NULL,
  actor_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type    TEXT        NOT NULL,
  entity_id      UUID,
  summary        TEXT        NOT NULL,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_id_idx
  ON public.admin_audit_logs (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_id_idx
  ON public.admin_audit_logs (actor_id, created_at DESC);

-- ─── ACTIVE CARTS ─────────────────────────────────────────────────────────────

CREATE TABLE public.active_carts (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.active_cart_items (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  active_cart_id UUID         NOT NULL REFERENCES public.active_carts(id) ON DELETE CASCADE,
  product_id     UUID         NOT NULL REFERENCES public.products(id),
  quantity       INTEGER      NOT NULL CHECK (quantity > 0),
  unit_price     NUMERIC(10,2) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── HELD CARTS ───────────────────────────────────────────────────────────────

CREATE TABLE public.held_carts (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  label      TEXT        NOT NULL,
  branch     TEXT,
  created_by UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'held',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.held_cart_items (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  held_cart_id UUID         NOT NULL REFERENCES public.held_carts(id) ON DELETE CASCADE,
  product_id   UUID         NOT NULL REFERENCES public.products(id),
  quantity     INTEGER      NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── RECEIPT SETTINGS ─────────────────────────────────────────────────────────

CREATE TABLE public.receipt_settings (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_number   INTEGER     NOT NULL,
  end_number     INTEGER     NOT NULL,
  current_number INTEGER     NOT NULL,
  date_issued    DATE        NOT NULL,
  created_by     UUID        REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS receipt_settings_updated_at_idx ON public.receipt_settings (updated_at DESC);

-- ─── RENTAL SPACES ────────────────────────────────────────────────────────────

CREATE TABLE public.rental_spaces (
  id                  UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT                    NOT NULL,
  slug                TEXT GENERATED ALWAYS AS (regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) STORED,
  rental_type         public.rental_space_type NOT NULL,
  description         TEXT,
  base_rate           NUMERIC(12,2)           NOT NULL DEFAULT 0,
  rate_unit           TEXT                    NOT NULL DEFAULT 'per_day',
  capacity            INTEGER,
  image_url           TEXT,
  product_category_id UUID                    REFERENCES public.product_categories(id) ON DELETE SET NULL,
  product_id          UUID                    REFERENCES public.products(id) ON DELETE SET NULL,
  facilities          TEXT[],
  display_order       INTEGER                 NOT NULL DEFAULT 0,
  is_active           BOOLEAN                 NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  CONSTRAINT rental_spaces_name_unique     UNIQUE (name),
  CONSTRAINT rental_spaces_slug_unique     UNIQUE (slug),
  CONSTRAINT rental_spaces_capacity_check  CHECK (capacity IS NULL OR capacity >= 0),
  CONSTRAINT rental_spaces_base_rate_check CHECK (base_rate >= 0)
);

CREATE INDEX IF NOT EXISTS rental_spaces_type_idx   ON public.rental_spaces (rental_type);
CREATE INDEX IF NOT EXISTS rental_spaces_active_idx ON public.rental_spaces (is_active);

-- ─── RENTAL BOOKINGS ──────────────────────────────────────────────────────────

CREATE TABLE public.rental_bookings (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  rental_space_id UUID          NOT NULL REFERENCES public.rental_spaces(id) ON DELETE CASCADE,
  booking_date    DATE          NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'confirmed',
  sale_id         UUID          REFERENCES public.sales(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by      UUID          REFERENCES public.profiles(id),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  total_amount    NUMERIC(12,2),
  initial_payment NUMERIC(12,2),
  payment_status  TEXT          NOT NULL DEFAULT 'paid'
    CONSTRAINT rental_bookings_payment_status_check
      CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
  balance_sale_id UUID          REFERENCES public.sales(id) ON DELETE SET NULL,
  CONSTRAINT rental_bookings_status_check     CHECK (status IN ('confirmed', 'cancelled')),
  CONSTRAINT rental_bookings_unique_space_date UNIQUE (rental_space_id, booking_date)
);

CREATE INDEX IF NOT EXISTS rental_bookings_space_date_idx    ON public.rental_bookings (rental_space_id, booking_date);
CREATE INDEX IF NOT EXISTS rental_bookings_date_idx          ON public.rental_bookings (booking_date);
CREATE INDEX IF NOT EXISTS rental_bookings_payment_status_idx ON public.rental_bookings (payment_status);

-- ─── EMPLOYEES ────────────────────────────────────────────────────────────────

CREATE TABLE public.employees (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_number TEXT          NOT NULL UNIQUE,
  full_name       TEXT          NOT NULL,
  position        TEXT          NOT NULL,
  department      TEXT,
  branch          TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  hire_date       DATE          NOT NULL,
  salary          DECIMAL(10,2) NOT NULL,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── ATTENDANCE ───────────────────────────────────────────────────────────────

CREATE TABLE public.attendance (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date         DATE          NOT NULL,
  clock_in     TIMESTAMPTZ,
  clock_out    TIMESTAMPTZ,
  hours_worked DECIMAL(5,2),
  status       TEXT          NOT NULL DEFAULT 'present'
                             CHECK (status IN ('present', 'absent', 'leave', 'half-day')),
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

-- ─── VOUCHERS ─────────────────────────────────────────────────────────────────

CREATE TABLE public.vouchers (
  id             UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_number TEXT           NOT NULL UNIQUE,
  voucher_type   voucher_type   NOT NULL,
  amount         DECIMAL(10,2)  NOT NULL,
  reference_id   UUID,
  reference_type TEXT,
  description    TEXT           NOT NULL,
  status         voucher_status NOT NULL DEFAULT 'pending',
  created_by     UUID           NOT NULL REFERENCES public.profiles(id),
  approved_by    UUID           REFERENCES public.profiles(id),
  posted_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ─── PAYROLL ──────────────────────────────────────────────────────────────────

CREATE TABLE public.payroll (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_number TEXT          NOT NULL UNIQUE,
  employee_id    UUID          NOT NULL REFERENCES public.employees(id),
  period_start   DATE          NOT NULL,
  period_end     DATE          NOT NULL,
  basic_salary   DECIMAL(10,2) NOT NULL,
  overtime_pay   DECIMAL(10,2) NOT NULL DEFAULT 0,
  deductions     DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_deducted   DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_salary     DECIMAL(10,2) NOT NULL,
  status         TEXT          NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'paid')),
  voucher_id     UUID          REFERENCES public.vouchers(id),
  processed_by   UUID          REFERENCES public.users(id),
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────

CREATE TABLE public.invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT          NOT NULL UNIQUE,
  customer_name   TEXT          NOT NULL,
  customer_email  TEXT,
  customer_phone  TEXT,
  issue_date      DATE          NOT NULL,
  due_date        DATE          NOT NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  tax_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(10,2) NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  notes           TEXT,
  created_by      UUID          NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE public.invoice_items (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID          NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT         NOT NULL,
  quantity   INTEGER       NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ACCOUNTING FOUNDATION

CREATE TABLE public.chart_of_accounts (
  id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT                    NOT NULL UNIQUE,
  name              TEXT                    NOT NULL,
  account_type      public.account_type     NOT NULL,
  category          public.account_category NOT NULL,
  normal_balance    public.normal_balance   NOT NULL,
  parent_account_id UUID                    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  description       TEXT,
  is_system         BOOLEAN                 NOT NULL DEFAULT false,
  is_active         BOOLEAN                 NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chart_of_accounts_type_idx   ON public.chart_of_accounts (account_type, category);
CREATE INDEX IF NOT EXISTS chart_of_accounts_parent_idx ON public.chart_of_accounts (parent_account_id);
CREATE INDEX IF NOT EXISTS chart_of_accounts_active_idx ON public.chart_of_accounts (is_active);

CREATE TABLE public.journal_entries (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number   TEXT        NOT NULL UNIQUE,
  entry_date     DATE        NOT NULL,
  source_key     TEXT        UNIQUE,
  reference_type TEXT,
  reference_id   UUID,
  description    TEXT,
  status         TEXT        NOT NULL DEFAULT 'draft',
  created_by     UUID        REFERENCES public.profiles(id),
  posted_by      UUID        REFERENCES public.profiles(id),
  posted_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_entries_entry_date_idx ON public.journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_entries_status_idx     ON public.journal_entries (status);

CREATE TABLE public.journal_entry_lines (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID          NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id       UUID          NOT NULL REFERENCES public.chart_of_accounts(id),
  line_number      INTEGER       NOT NULL,
  description      TEXT,
  debit            NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT journal_entry_lines_debit_credit_check CHECK (
    (debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0)
  ),
  CONSTRAINT journal_entry_lines_unique_line UNIQUE (journal_entry_id, line_number)
);

CREATE INDEX IF NOT EXISTS journal_entry_lines_account_idx ON public.journal_entry_lines (account_id);

CREATE TABLE public.accounting_mappings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_key TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  description TEXT,
  account_id  UUID        NOT NULL REFERENCES public.chart_of_accounts(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS accounting_mappings_account_idx ON public.accounting_mappings (account_id);

ALTER TABLE public.product_categories
ADD COLUMN IF NOT EXISTS revenue_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.vouchers
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

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
    ('sales_tax_payable', 'Sales Tax Payable', 'Liability account used for tax/VAT collected on POS sales.', '2000'),
    ('invoice_tax_payable', 'Invoice Tax Payable', 'Liability account used for tax/VAT on invoicing.', '2000')
) AS seed(mapping_key, label, description, account_code)
JOIN public.chart_of_accounts coa ON coa.code = seed.account_code
ON CONFLICT (mapping_key) DO NOTHING;

-- ─── TRIGGER: updated_at ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'profiles', 'products', 'employees', 'vouchers',
    'active_carts', 'receipt_settings', 'rental_spaces', 'rental_bookings',
    'invoices', 'attendance', 'payroll', 'membership',
    'accounting_mappings',
    'chart_of_accounts', 'journal_entries'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
       CREATE TRIGGER trg_%1$s_updated_at
         BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();',
      t
    );
  END LOOP;
END $$;

-- ─── TRIGGER: auto-create profile on new user ─────────────────────────────────
-- In the self-hosted setup, profiles are created explicitly by the /api/auth/register
-- or admin endpoints. This trigger is kept for completeness but auth.users is gone.

-- ─── FUNCTION: decrement_product_stock ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decrement_product_stock(
  p_product_id UUID,
  p_quantity   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.products
  SET stock_quantity = stock_quantity - p_quantity,
      updated_at     = NOW()
  WHERE id = p_product_id;
END;
$$;

-- ─── FUNCTION: void_sale ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_sale(
  p_sale_id   UUID,
  p_reason    TEXT DEFAULT NULL,
  p_voided_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  sale_row       public.sales%ROWTYPE;
  product_record RECORD;
BEGIN
  SELECT * INTO sale_row
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  IF sale_row.status = 'voided' THEN
    RAISE EXCEPTION 'SALE_ALREADY_VOIDED';
  END IF;

  -- Restore stock for each sold product
  FOR product_record IN
    SELECT product_id, SUM(quantity) AS total_quantity
    FROM public.sale_items
    WHERE sale_id = p_sale_id
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET stock_quantity = stock_quantity + product_record.total_quantity,
        updated_at     = NOW()
    WHERE id = product_record.product_id;
  END LOOP;

  -- Mark sale voided
  UPDATE public.sales
  SET status = 'voided'
  WHERE id = p_sale_id;

  -- Update receipt snapshot
  UPDATE public.sale_receipts
  SET voided_at   = NOW(),
      voided_by   = p_voided_by,
      void_reason = p_reason
  WHERE sale_id = p_sale_id;

  -- Audit log
  INSERT INTO public.sale_void_events
    (sale_id, sale_number, receipt_number, void_reason, voided_by)
  VALUES
    (sale_row.id, sale_row.sale_number, sale_row.receipt_number, p_reason, p_voided_by);
END;
$$;

-- ─── BUSINESS SETTINGS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_settings (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key        BOOLEAN      NOT NULL DEFAULT TRUE UNIQUE,
  tax_rate             NUMERIC(6,4) NOT NULL DEFAULT 0.12,
  rental_discount_rate NUMERIC(6,4) NOT NULL DEFAULT 0.10,
  org_name             TEXT         NOT NULL DEFAULT 'Girl Scouts of the Philippines',
  region_name          TEXT         NOT NULL DEFAULT 'Northern Luzon Region',
  council_name         TEXT         NOT NULL DEFAULT 'Ilocos Sur Council',
  bank_account_1       TEXT         NOT NULL DEFAULT 'Cash in Bank, DBP #00500128590-5',
  bank_account_2       TEXT         NOT NULL DEFAULT 'Time Deposit, Cordillera Bank #8104',
  bank_account_3       TEXT         NOT NULL DEFAULT 'Cash in Bank, Maybank #01-017-00-0197-9',
  bank_account_4       TEXT         NOT NULL DEFAULT 'Checking Account, DBP #00-0-50141-590-7',
  bank_account_5       TEXT         NOT NULL DEFAULT 'Cash in Bank, PNB #223510036978',
  org_address              TEXT         NOT NULL DEFAULT 'Plaza Burgos, City of Vigan, Ilocos Sur, Philippines',
  report_prepared_by_name  TEXT         NOT NULL DEFAULT '',
  report_prepared_by_title TEXT         NOT NULL DEFAULT 'Cashier',
  report_verified_by_name  TEXT         NOT NULL DEFAULT '',
  report_verified_by_title TEXT         NOT NULL DEFAULT 'Supervisor / Council Executive Director',
  report_approved_by_name  TEXT         NOT NULL DEFAULT '',
  report_approved_by_title TEXT         NOT NULL DEFAULT 'Council President / Authorized Signatory',
  updated_by           UUID         NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_business_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_settings_updated_at ON public.business_settings;
CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_business_settings_updated_at();

INSERT INTO public.business_settings (singleton_key) VALUES (TRUE) ON CONFLICT (singleton_key) DO NOTHING;

-- ─── BUSINESS SETTINGS MIGRATIONS (idempotent) ───────────────────────────────
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS org_address              TEXT NOT NULL DEFAULT 'Plaza Burgos, City of Vigan, Ilocos Sur, Philippines';
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS report_prepared_by_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS report_prepared_by_title TEXT NOT NULL DEFAULT 'Cashier';
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS report_verified_by_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS report_verified_by_title TEXT NOT NULL DEFAULT 'Supervisor / Council Executive Director';
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS report_approved_by_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS report_approved_by_title TEXT NOT NULL DEFAULT 'Council President / Authorized Signatory';

-- ─── PAYROLL MIGRATIONS (idempotent) ──────────────────────────────────────────
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS cola       DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS sss        DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS philhealth DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS pagibig    DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ─── PAYMENT METHOD ENUM MIGRATION ───────────────────────────────────────────
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'mixed';

-- ─── USER ROLE ENUM MIGRATIONS (idempotent) ───────────────────────────────────
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'inventory_clerk';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';

-- USERNAME LOGIN MIGRATIONS (idempotent)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;
UPDATE public.users SET username = COALESCE(username, email) WHERE username IS NULL;
ALTER TABLE public.users ALTER COLUMN username SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON public.users (username);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
UPDATE public.profiles p
SET username = COALESCE(p.username, u.username, p.email, u.email)
FROM public.users u
WHERE p.id = u.id
  AND p.username IS NULL;
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (username);

-- ─── SEED DATA ────────────────────────────────────────────────────────────────
-- Uncomment to insert default categories and members.
-- Run full inventory seed separately from supabase/migrations/20251109120000_inventory_products.sql

/*
INSERT INTO public.product_categories (name, description) VALUES
  ('Uniforms',     'Official Girl Scout uniforms and attire'),
  ('Shirts',       'T-shirts, polo shirts, and casual wear'),
  ('Badges',       'Achievement badges and patches'),
  ('Sashes',       'Official sashes and vests'),
  ('Accessories',  'Pins, scarves, and other accessories'),
  ('Hall Rental',  'Function hall rental'),
  ('Room Rental',  'Conference and training room rental')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.members (code, name, email, discount_rate) VALUES
  ('MEM-001', 'Alex Rivera',        'alex.rivera@example.com',     0.10),
  ('MEM-002', 'Jamie Cruz',         'jamie.cruz@example.com',      0.05),
  ('MEM-003', 'Morgan Dela Cruz',   'morgan.delacruz@example.com', 0.03)
ON CONFLICT (code) DO NOTHING;
*/

-- ─── OUTPUT TAX PAYABLE ACCOUNT MIGRATION (idempotent) ───────────────────────
INSERT INTO public.chart_of_accounts (code, name, account_type, category, normal_balance, description, is_system)
VALUES ('2050', 'Output Tax Payable', 'liability', 'current_liability', 'credit', 'VAT/sales tax collected from customers, payable to BIR.', true)
ON CONFLICT (code) DO NOTHING;

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

-- ─── BIR RECEIPT SERIES TABLE (idempotent) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.receipt_series (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_label   TEXT NOT NULL,
  from_number    INTEGER NOT NULL,
  to_number      INTEGER NOT NULL,
  current_number INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT receipt_series_range_check   CHECK (from_number <= to_number),
  CONSTRAINT receipt_series_current_check CHECK (current_number >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS receipt_series_one_active
  ON public.receipt_series (is_active) WHERE is_active = true;

-- ─── STOCK ADJUSTMENTS TABLE (idempotent) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  old_quantity     INTEGER NOT NULL,
  new_quantity     INTEGER NOT NULL,
  adjustment       INTEGER NOT NULL,
  reason           TEXT,
  adjusted_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  adjusted_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON public.stock_adjustments (product_id);
CREATE INDEX IF NOT EXISTS stock_adjustments_created_idx ON public.stock_adjustments (created_at DESC);

-- ─── SCRD SAVED REPORTS TABLE (idempotent) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scrd_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  payload     JSONB NOT NULL,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── LOGIN ATTEMPTS TABLE (brute-force lockout) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_username
  ON public.login_attempts (username, attempted_at);
