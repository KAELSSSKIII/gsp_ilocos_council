-- Define dedicated rental space catalog for halls and rooms
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'rental_space_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.rental_space_type AS ENUM ('hall', 'room');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.rental_spaces (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text GENERATED ALWAYS AS (regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) STORED,
  rental_type public.rental_space_type NOT NULL,
  description text,
  base_rate numeric(12,2) NOT NULL DEFAULT 0,
  rate_unit text NOT NULL DEFAULT 'per_day',
  capacity integer,
  image_url text,
  product_category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  facilities text[],
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_spaces_name_unique UNIQUE (name),
  CONSTRAINT rental_spaces_slug_unique UNIQUE (slug),
  CONSTRAINT rental_spaces_capacity_positive CHECK (capacity IS NULL OR capacity >= 0),
  CONSTRAINT rental_spaces_base_rate_positive CHECK (base_rate >= 0)
);

CREATE INDEX IF NOT EXISTS rental_spaces_type_idx ON public.rental_spaces (rental_type);
CREATE INDEX IF NOT EXISTS rental_spaces_active_idx ON public.rental_spaces (is_active);

CREATE OR REPLACE FUNCTION public.update_rental_spaces_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_rental_spaces_timestamp ON public.rental_spaces;
CREATE TRIGGER update_rental_spaces_timestamp
  BEFORE UPDATE ON public.rental_spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rental_spaces_timestamp();

ALTER TABLE public.rental_spaces ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_spaces'
      AND policyname = 'Rental spaces select'
  ) THEN
    EXECUTE 'CREATE POLICY "Rental spaces select" ON public.rental_spaces
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN (''cashier'', ''admin'', ''accountant'')
        )
      )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_spaces'
      AND policyname = 'Rental spaces write'
  ) THEN
    EXECUTE 'CREATE POLICY "Rental spaces write" ON public.rental_spaces
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN (''admin'', ''accountant'')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN (''admin'', ''accountant'')
        )
      )';
  END IF;
END
$$;

WITH category_map AS (
  SELECT
    name,
    id
  FROM public.product_categories
  WHERE name IN ('Hall Rental', 'Room Rental')
),
seed(name, rental_type, base_rate, rate_unit, capacity, category_name, description, display_order) AS (
  VALUES
    ('Main Function Hall', 'hall', 5500, 'per_day', 180, 'Hall Rental', 'Primary event hall suitable for assemblies, trainings, and ceremonies.', 1),
    ('Board Room', 'room', 2500, 'per_day', 16, 'Room Rental', 'Executive board room with conference table, projector, and air conditioning.', 1),
    ('Training Room', 'room', 1800, 'per_day', 30, 'Room Rental', 'Flexible training room with modular seating and AV equipment.', 2)
)
INSERT INTO public.rental_spaces (name, rental_type, base_rate, rate_unit, capacity, product_category_id, description, display_order)
SELECT
  seed.name,
  seed.rental_type::public.rental_space_type,
  seed.base_rate,
  seed.rate_unit,
  seed.capacity,
  category_map.id,
  seed.description,
  seed.display_order
FROM seed
LEFT JOIN category_map ON category_map.name = seed.category_name
ON CONFLICT (name) DO NOTHING;

COMMIT;

