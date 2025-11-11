-- Remove initial seed categories and products no longer needed
BEGIN;

DELETE FROM public.sale_items
WHERE product_id IN (
  SELECT id FROM public.products
  WHERE sku IN (
    'GS-UNI-001',
    'GS-UNI-002',
    'GS-SHT-001',
    'GS-SHT-002',
    'GS-BDG-001',
    'GS-BDG-002',
    'GS-SAS-001',
    'GS-SAS-002',
    'GS-ACC-001',
    'GS-ACC-002'
  )
);

DELETE FROM public.active_cart_items
WHERE product_id IN (
  SELECT id FROM public.products
  WHERE sku IN (
    'GS-UNI-001',
    'GS-UNI-002',
    'GS-SHT-001',
    'GS-SHT-002',
    'GS-BDG-001',
    'GS-BDG-002',
    'GS-SAS-001',
    'GS-SAS-002',
    'GS-ACC-001',
    'GS-ACC-002'
  )
);

DELETE FROM public.held_cart_items
WHERE product_id IN (
  SELECT id FROM public.products
  WHERE sku IN (
    'GS-UNI-001',
    'GS-UNI-002',
    'GS-SHT-001',
    'GS-SHT-002',
    'GS-BDG-001',
    'GS-BDG-002',
    'GS-SAS-001',
    'GS-SAS-002',
    'GS-ACC-001',
    'GS-ACC-002'
  )
);

DELETE FROM public.products
WHERE sku IN (
  'GS-UNI-001',
  'GS-UNI-002',
  'GS-SHT-001',
  'GS-SHT-002',
  'GS-BDG-001',
  'GS-BDG-002',
  'GS-SAS-001',
  'GS-SAS-002',
  'GS-ACC-001',
  'GS-ACC-002'
);

UPDATE public.products
SET category_id = NULL
WHERE category_id IN (
  SELECT id FROM public.product_categories
  WHERE name IN ('Uniforms', 'Shirts', 'Badges', 'Sashes', 'Accessories')
);

DELETE FROM public.product_categories
WHERE name IN ('Uniforms', 'Shirts', 'Badges', 'Sashes', 'Accessories');

COMMIT;

