-- Active cart tables to persist in-progress POS sessions
create table if not exists public.active_carts (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid references public.profiles(id) on delete cascade,
  branch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.active_cart_items (
  id uuid primary key default uuid_generate_v4(),
  active_cart_id uuid not null references public.active_carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create or replace function public.update_active_cart_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists update_active_cart_updated_at on public.active_carts;
create trigger update_active_cart_updated_at
  before update on public.active_carts
  for each row
  execute function public.update_active_cart_updated_at();

alter table public.active_carts enable row level security;
alter table public.active_cart_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'active_carts'
      and policyname = 'Active carts select'
  ) then
    execute 'create policy "Active carts select" on public.active_carts
      for select using (created_by = auth.uid())';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'active_carts'
      and policyname = 'Active carts modify'
  ) then
    execute 'create policy "Active carts modify" on public.active_carts
      using (created_by = auth.uid())
      with check (created_by = auth.uid())';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'active_cart_items'
      and policyname = 'Active cart items access'
  ) then
    execute 'create policy "Active cart items access" on public.active_cart_items
      using (
        exists(
          select 1 from public.active_carts
          where active_carts.id = active_cart_id
            and active_carts.created_by = auth.uid()
        )
      )
      with check (
        exists(
          select 1 from public.active_carts
          where active_carts.id = active_cart_id
            and active_carts.created_by = auth.uid()
        )
      )';
  end if;
end $$;


