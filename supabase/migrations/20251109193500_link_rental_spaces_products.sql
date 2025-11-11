-- Link rental spaces to product records so rentals can be sold through the existing POS flow
BEGIN;

ALTER TABLE public.rental_spaces
  ADD COLUMN IF NOT EXISTS product_id uuid UNIQUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rental_spaces_product_id_fkey'
      AND conrelid = 'public.rental_spaces'::regclass
  ) THEN
    ALTER TABLE public.rental_spaces
      ADD CONSTRAINT rental_spaces_product_id_fkey
        FOREIGN KEY (product_id)
        REFERENCES public.products(id)
        ON DELETE SET NULL;
  END IF;
END
$$;

WITH normalized AS (
  SELECT
    rs.id,
    rs.name,
    rs.rental_type,
    rs.base_rate,
    rs.product_category_id,
    rs.description,
    rs.image_url,
    rs.is_active,
    COALESCE(NULLIF(rs.slug, ''), regexp_replace(lower(rs.name), '[^a-z0-9]+', '-', 'g')) AS slug_value
  FROM public.rental_spaces rs
  WHERE rs.product_id IS NULL
),
inserted_products AS (
  INSERT INTO public.products (
    sku,
    name,
    category_id,
    selling_price,
    cost_price,
    stock_quantity,
    reorder_level,
    is_active,
    description,
    image_url,
    size
  )
  SELECT
    UPPER('RENT-' || normalized.slug_value),
    normalized.name,
    normalized.product_category_id,
    normalized.base_rate,
    0,
    CASE WHEN normalized.is_active THEN 1 ELSE 0 END,
    0,
    normalized.is_active,
    normalized.description,
    normalized.image_url,
    NULL
  FROM normalized
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, name
)
UPDATE public.rental_spaces rs
SET product_id = ip.id
FROM inserted_products ip
WHERE rs.product_id IS NULL
  AND rs.name = ip.name;

UPDATE public.products p
SET stock_quantity = CASE WHEN rs.is_active THEN 1 ELSE 0 END,
    reorder_level = 0,
    cost_price = 0,
    updated_at = now()
FROM public.rental_spaces rs
WHERE rs.product_id = p.id;

COMMIT;

