-- ============================================================
-- GSP Data Migration: Supabase → Self-Hosted PostgreSQL
-- ============================================================
-- Run this AFTER db/schema.sql has been applied to your new DB.
-- Run this AFTER you have imported the public schema data dump
-- from Supabase (pg_dump --data-only --schema=public).
--
-- This script handles the auth.users → public.users mapping,
-- since Supabase's auth schema is not part of the public dump.
--
-- HOW TO USE:
-- 1. Export from Supabase (run in your terminal):
--
--    pg_dump \
--      --host=db.kaqjchyibvkwpjurrinv.supabase.co \
--      --port=5432 \
--      --username=postgres \
--      --dbname=postgres \
--      --schema=public \
--      --data-only \
--      --no-owner \
--      --no-privileges \
--      --file=supabase_public_data.sql
--
--    pg_dump \
--      --host=db.kaqjchyibvkwpjurrinv.supabase.co \
--      --port=5432 \
--      --username=postgres \
--      --dbname=postgres \
--      --schema=auth \
--      --table=auth.users \
--      --data-only \
--      --file=supabase_auth_users.sql
--
-- 2. Apply schema to new DB:
--    psql -U gsp_user -d gsp_db -f db/schema.sql
--
-- 3. Create a temporary auth.users table to receive the Supabase dump:
--    (run the block below, then import supabase_auth_users.sql)
--
-- 4. Run the INSERT statements in this file to migrate users.
--
-- 5. Import public data:
--    psql -U gsp_user -d gsp_db -f supabase_public_data.sql
--
-- 6. Run verification queries at the bottom.
-- ============================================================

-- Step 3a: Create temp schema to receive Supabase's auth dump
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                   UUID PRIMARY KEY,
  email                TEXT,
  encrypted_password   TEXT,
  email_confirmed_at   TIMESTAMPTZ,
  raw_user_meta_data   JSONB,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
);

-- After running: psql -U gsp_user -d gsp_db -f supabase_auth_users.sql
-- continue with Step 3b below.

-- Step 3b: Migrate auth.users → public.users
-- Supabase uses bcrypt for encrypted_password (same as bcryptjs) — passwords transfer directly.

INSERT INTO public.users (id, email, password_hash, created_at, updated_at)
SELECT
  id,
  email,
  encrypted_password,                     -- bcrypt hash, compatible with bcryptjs
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW())
FROM auth.users
WHERE encrypted_password IS NOT NULL       -- skip social-only accounts (no password)
ON CONFLICT (id) DO NOTHING;

-- Step 3c: Seed profiles for users that don't have a profile yet
-- (profiles should already exist from the public data dump, but this handles gaps)
INSERT INTO public.profiles (id, full_name, email, role, created_at, updated_at)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email, 'Unknown'),
  u.email,
  COALESCE(
    (u.raw_user_meta_data->>'role')::public.user_role,
    'cashier'::public.user_role
  ),
  COALESCE(u.created_at, NOW()),
  COALESCE(u.updated_at, NOW())
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 3d: Optional cleanup — drop the temporary auth schema
-- Uncomment when you are satisfied the migration is correct:
-- DROP SCHEMA auth CASCADE;

-- ─── VERIFICATION QUERIES ────────────────────────────────────────────────────
-- Run these to confirm data integrity:

SELECT 'users'            AS table_name, COUNT(*) AS row_count FROM public.users
UNION ALL
SELECT 'profiles',         COUNT(*) FROM public.profiles
UNION ALL
SELECT 'product_categories', COUNT(*) FROM public.product_categories
UNION ALL
SELECT 'products',         COUNT(*) FROM public.products
UNION ALL
SELECT 'members',          COUNT(*) FROM public.members
UNION ALL
SELECT 'sales',            COUNT(*) FROM public.sales
UNION ALL
SELECT 'sale_items',       COUNT(*) FROM public.sale_items
UNION ALL
SELECT 'sale_receipts',    COUNT(*) FROM public.sale_receipts
UNION ALL
SELECT 'rental_spaces',    COUNT(*) FROM public.rental_spaces
UNION ALL
SELECT 'rental_bookings',  COUNT(*) FROM public.rental_bookings
UNION ALL
SELECT 'employees',        COUNT(*) FROM public.employees
UNION ALL
SELECT 'vouchers',         COUNT(*) FROM public.vouchers
ORDER BY table_name;
