-- Create rental bookings table to power calendar + POS availability
BEGIN;

CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rental_space_id uuid NOT NULL REFERENCES public.rental_spaces(id) ON DELETE CASCADE,
  booking_date date NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_bookings_status_valid CHECK (status IN ('confirmed', 'cancelled')),
  CONSTRAINT rental_bookings_unique_space_date UNIQUE (rental_space_id, booking_date)
);

CREATE INDEX IF NOT EXISTS rental_bookings_space_date_idx ON public.rental_bookings (rental_space_id, booking_date);
CREATE INDEX IF NOT EXISTS rental_bookings_date_idx ON public.rental_bookings (booking_date);

CREATE OR REPLACE FUNCTION public.update_rental_bookings_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_rental_bookings_timestamp ON public.rental_bookings;
CREATE TRIGGER update_rental_bookings_timestamp
  BEFORE UPDATE ON public.rental_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rental_bookings_timestamp();

ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_bookings'
      AND policyname = 'rental bookings select'
  ) THEN
    EXECUTE 'CREATE POLICY "rental bookings select" ON public.rental_bookings
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN (''admin'', ''cashier'', ''accountant'')
        )
      )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_bookings'
      AND policyname = 'rental bookings insert'
  ) THEN
    EXECUTE 'CREATE POLICY "rental bookings insert" ON public.rental_bookings
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN (''admin'', ''cashier'')
        )
      )';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_bookings'
      AND policyname = 'rental bookings update'
  ) THEN
    EXECUTE 'CREATE POLICY "rental bookings update" ON public.rental_bookings
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN (''admin'', ''cashier'')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN (''admin'', ''cashier'')
        )
      )';
  END IF;
END
$$;

COMMIT;


