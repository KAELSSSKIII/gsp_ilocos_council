-- =============================================================
-- GSP Products Migration: Supabase export → gsp_db
-- =============================================================
-- Run AFTER db/schema.sql has been applied.
-- HOW TO RUN (from project root, Git Bash):
--   PGPASSWORD='sample' "/c/Program Files/PostgreSQL/18/bin/psql" \
--     -U gsp_user -d gsp_db -h localhost -f db/migrate-products.sql
-- VERIFY:
--   SELECT COUNT(*) FROM public.product_categories; -- 51
--   SELECT COUNT(*) FROM public.products;           -- ~302
-- =============================================================

-- ─── 1. Product Categories (must exist before products FK) ───────────────────

INSERT INTO public.product_categories (id, name) VALUES
  ('d0420d32-d4a5-479c-b3fc-008ae934b56b', 'Cadet Badges'),
  ('c916dd15-c26d-43dd-b41c-f6ce36b04465', 'Green Pants - Wool'),
  ('4719e25b-5396-4123-b24b-ac6162ab4233', 'Magic Carpet'),
  ('4e942e73-f754-4585-996c-965542804ebc', '1940 Anniv. Shirt White'),
  ('67528e49-942a-4b6b-8057-6db6d858ae7d', 'Star Badges'),
  ('f72ceecf-5b90-40cd-affb-7a9db3ff8b4c', 'Twinkler Badges'),
  ('07e0335a-be0d-4e77-89b8-6a58731a0b62', 'Junior Badges'),
  ('7d5e253b-2846-4913-9422-132ed79fc0f2', 'RTW Girls'),
  ('fca66264-64b3-48d1-86ca-cece040dfb18', 'Bermuda Shorts (Star & Junior)'),
  ('168308d6-bd65-488e-ac69-9521439969b4', 'Black Adult Polo Shirt'),
  ('b56e9359-2a3d-44d6-b3f4-94cc52155b61', 'T-Shirts'),
  ('4b9c6b63-16fd-4d83-bada-08634279a9e1', 'Pins'),
  ('f421c188-795c-4f0c-9f0c-79d030ba70cf', 'Polo Shirt (Combi)'),
  ('0454ce23-ba56-42fe-af4b-e7ef978b04b6', 'Handbook (New)'),
  ('f97a317a-fab2-4f89-b671-0facd005aa3a', 'Bermuda Short (Senior & Cadet)'),
  ('27286317-b16d-45d3-ae24-d50ef369e05b', '1940 Anniv. Shirt Black'),
  ('90baadb3-1a6f-4101-8bbd-9d6c94112596', 'Goodwill Pouch'),
  ('94f58b4a-b001-4053-9754-af7ff671a55a', 'Blouse SR/CDT'),
  ('5ba11495-2119-41ee-bd3a-76732cf23ac7', 'Plain Green Skirt'),
  ('3f3aacb1-9c97-4d3d-ab4a-162d3b5cb0ad', 'Jogging Pants'),
  ('0a3a0edd-1150-44c2-b58f-b7dc6d8516f8', 'Fun Shirt Raglan-Everyway'),
  ('7fa651c7-dc2e-4fea-bf5b-cda6d063397e', 'Fun Shirt Professionals'),
  ('cb5757fd-b5c6-48c0-9766-60a41f06bc69', 'Sash'),
  ('fd3f96ca-bf41-4448-8f48-005771b21c5c', 'Scarf'),
  ('9bfafc4a-9067-4578-8968-27bea947c009', 'Cloth'),
  ('b7af2fed-ddcd-454a-8195-29e660721e86', 'Nylon Belt'),
  ('a2d52598-f614-4b4d-b895-a47b2c9cae2f', 'Socks'),
  ('62414ec3-1d6d-47bf-9d2c-772ed43922c1', 'Caps'),
  ('2430c952-50e7-489c-bb1c-3670220a5868', 'Vest - Wool'),
  ('508a0a31-54d7-4d20-a0a3-f6039ce399d4', 'Vest - Wool Embroidered'),
  ('3b4ba909-7434-4304-b171-50803113ca93', 'Rinna Blouse'),
  ('bb7926a3-2e22-4cf0-be5c-0425103769fd', 'Raglan Shirt'),
  ('2cd1b7fe-e618-4bf2-bfd2-179c41393ffd', 'Manual (New)'),
  ('0ae8d481-afc3-40b6-8fcb-28ceabd9f492', 'Manual (Old)'),
  ('d2da4883-a9a3-48a7-bf6b-0aa6677270e4', 'Handbook (Old)'),
  ('06b15020-fedf-42aa-bd2f-30d93792b88b', 'Strips'),
  ('10921cb6-ba44-44e2-ad8c-7c7650970af2', 'Rag Doll'),
  ('bd19f348-6d4e-49ee-af40-42a552a5858e', 'Gespie Doll'),
  ('483e0cd0-0f8d-4e8b-a23a-dacaf2f927c1', 'Fun T-Shirt'),
  ('64cd930b-b261-41cf-b9f7-9a8105a41a8a', 'Badges'),
  ('04b07f0c-b241-4d32-bfe7-8dc722a37481', 'Face Mask'),
  ('5562ef2f-9a92-441b-837a-b21215eb2a73', 'Men''s Black Polo'),
  ('d558276a-fe6b-45d6-a5d8-583016af188f', 'Adult Jacket'),
  ('35801477-9e5c-4a55-a517-307252f7d57c', 'Books - Camping'),
  ('7d1be704-1b75-44a5-bb86-008edb6cd150', 'Songbook'),
  ('9a60d87f-bfb3-4fc8-899f-cda9e7230da1', 'Keychain'),
  ('97865292-7410-4a74-9c18-7039d97757de', 'Green Pants Wool (Old Price)'),
  ('2e47a71f-93e7-48c0-a912-7026ba6f3d00', 'GSP Terno Set'),
  ('0cd946fc-a809-4489-840d-4f99f6a3d526', 'Rental - Hall'),
  ('83fb9a90-9e20-41ad-a895-1960fc5670f6', 'Rental - Room'),
  ('49c5e3bd-8cdb-4c26-be2b-f97e72833524', 'Senior Badges')
ON CONFLICT (id) DO NOTHING;
