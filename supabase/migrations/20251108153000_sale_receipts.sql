-- Receipts snapshot table to allow reprinting historical sales
create table if not exists public.sale_receipts (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  sale_number text not null,
  cashier_id uuid references public.profiles(id),
  member_id uuid references public.members(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text
);

create unique index if not exists sale_receipts_sale_id_key on public.sale_receipts (sale_id);
create index if not exists sale_receipts_sale_number_idx on public.sale_receipts (sale_number);

alter table public.sale_receipts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_receipts'
      and policyname = 'Sale receipts select'
  ) then
    execute 'create policy "Sale receipts select" on public.sale_receipts
      for select using (
        cashier_id = auth.uid() or
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'', ''accountant'')
        )
      )';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_receipts'
      and policyname = 'Sale receipts insert'
  ) then
    execute 'create policy "Sale receipts insert" on public.sale_receipts
      for insert with check (
        cashier_id = auth.uid() or
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''cashier'', ''admin'')
        )
      )';
  end if;
end $$;


