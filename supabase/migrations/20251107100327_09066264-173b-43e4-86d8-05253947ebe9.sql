-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM ('admin', 'accountant', 'cashier', 'hr');

-- Create enum for payment methods
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'online');

-- Create enum for transaction types
CREATE TYPE public.transaction_type AS ENUM ('sale', 'expense', 'payroll', 'adjustment');

-- Create enum for voucher types
CREATE TYPE public.voucher_type AS ENUM ('payment', 'receipt', 'journal', 'payroll');

-- Create enum for voucher status
CREATE TYPE public.voucher_status AS ENUM ('pending', 'approved', 'posted', 'cancelled');

-- User profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'cashier',
  branch TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Product categories table
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view categories"
  ON public.product_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.product_categories FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- Products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.product_categories(id),
  image_url TEXT,
  size TEXT,
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active products"
  ON public.products FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'accountant')
  ));

-- Sales transactions table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number TEXT NOT NULL UNIQUE,
  cashier_id UUID NOT NULL REFERENCES public.profiles(id),
  branch TEXT,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method payment_method NOT NULL,
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sales"
  ON public.sales FOR SELECT
  USING (
    cashier_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

CREATE POLICY "Cashiers can create sales"
  ON public.sales FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('cashier', 'admin')
    )
  );

-- Sale items table
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sale items"
  ON public.sale_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id AND (
        s.cashier_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role IN ('admin', 'accountant')
        )
      )
    )
  );

CREATE POLICY "Cashiers can create sale items"
  ON public.sale_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id AND s.cashier_id = auth.uid()
    )
  );

-- Employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  position TEXT NOT NULL,
  department TEXT,
  branch TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  hire_date DATE NOT NULL,
  salary DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR and admins can view employees"
  ON public.employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr', 'accountant')
    )
  );

CREATE POLICY "HR and admins can manage employees"
  ON public.employees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- Vouchers table
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_number TEXT NOT NULL UNIQUE,
  voucher_type voucher_type NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  description TEXT NOT NULL,
  status voucher_status NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vouchers based on role"
  ON public.vouchers FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

CREATE POLICY "Accountants can create vouchers"
  ON public.vouchers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

CREATE POLICY "Admins can update vouchers"
  ON public.vouchers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accountant')
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vouchers_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cashier')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Insert seed data for categories
INSERT INTO public.product_categories (name, description) VALUES
  ('Uniforms', 'Official Girl Scout uniforms and attire'),
  ('Shirts', 'T-shirts, polo shirts, and casual wear'),
  ('Badges', 'Achievement badges and patches'),
  ('Sashes', 'Official sashes and vests'),
  ('Accessories', 'Pins, scarves, and other accessories');

-- Insert seed data for products
INSERT INTO public.products (sku, name, description, category_id, selling_price, cost_price, stock_quantity, size) VALUES
  ('GS-UNI-001', 'Junior Uniform', 'Official Girl Scout Junior uniform set', (SELECT id FROM public.product_categories WHERE name = 'Uniforms'), 45.00, 30.00, 25, 'M'),
  ('GS-UNI-002', 'Senior Uniform', 'Official Girl Scout Senior uniform set', (SELECT id FROM public.product_categories WHERE name = 'Uniforms'), 55.00, 38.00, 20, 'L'),
  ('GS-SHT-001', 'Green T-Shirt', 'Official Girl Scout green t-shirt', (SELECT id FROM public.product_categories WHERE name = 'Shirts'), 18.00, 10.00, 50, 'M'),
  ('GS-SHT-002', 'White Polo Shirt', 'Official Girl Scout white polo', (SELECT id FROM public.product_categories WHERE name = 'Shirts'), 25.00, 15.00, 40, 'L'),
  ('GS-BDG-001', 'First Aid Badge', 'First aid achievement badge', (SELECT id FROM public.product_categories WHERE name = 'Badges'), 5.00, 2.50, 100, 'One Size'),
  ('GS-BDG-002', 'Cookie Sales Badge', 'Cookie sales achievement badge', (SELECT id FROM public.product_categories WHERE name = 'Badges'), 5.00, 2.50, 100, 'One Size'),
  ('GS-SAS-001', 'Junior Sash', 'Official Girl Scout Junior sash', (SELECT id FROM public.product_categories WHERE name = 'Sashes'), 15.00, 8.00, 35, 'One Size'),
  ('GS-SAS-002', 'Senior Vest', 'Official Girl Scout Senior vest', (SELECT id FROM public.product_categories WHERE name = 'Sashes'), 28.00, 18.00, 30, 'One Size'),
  ('GS-ACC-001', 'Trefoil Pin', 'Official Girl Scout trefoil pin', (SELECT id FROM public.product_categories WHERE name = 'Accessories'), 8.00, 4.00, 75, 'One Size'),
  ('GS-ACC-002', 'Green Scarf', 'Official Girl Scout neckerchief', (SELECT id FROM public.product_categories WHERE name = 'Accessories'), 12.00, 6.00, 60, 'One Size');