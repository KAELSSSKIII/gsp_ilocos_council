-- Held carts tables for storing paused POS transactions
create table if not exists public.held_carts (
  id uuid primary key default uuid_generate_v4(),
  label text not null,
  branch text,
  created_by uuid references public.profiles(id) on delete cascade,
  status text not null default 'held',
  created_at timestamptz not null default now()
);

create table if not exists public.held_cart_items (
  id uuid primary key default uuid_generate_v4(),
  held_cart_id uuid not null references public.held_carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  created_at timestamptz not null default now()
);

alter table public.held_carts enable row level security;
alter table public.held_cart_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'held_carts'
      and policyname = 'Held carts select'
  ) then
    execute 'create policy "Held carts select" on public.held_carts
      for select using (created_by = auth.uid())';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'held_carts'
      and policyname = 'Held carts insert'
  ) then
    execute 'create policy "Held carts insert" on public.held_carts
      for insert with check (created_by = auth.uid())';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'held_carts'
      and policyname = 'Held carts delete'
  ) then
    execute 'create policy "Held carts delete" on public.held_carts
      for delete using (created_by = auth.uid())';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'held_cart_items'
      and policyname = 'Held cart items access'
  ) then
    execute 'create policy "Held cart items access" on public.held_cart_items
      using (
        exists(
          select 1 from public.held_carts
          where held_carts.id = held_cart_id
            and held_carts.created_by = auth.uid()
        )
      )
      with check (
        exists(
          select 1 from public.held_carts
          where held_carts.id = held_cart_id
            and held_carts.created_by = auth.uid()
        )
      )';
  end if;
end $$;


