-- Members table to support POS discounts and receipt linkage
create table if not exists public.members (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  email text,
  discount_rate numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.members enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'members'
      and policyname = 'Members select'
  ) then
    execute 'create policy "Members select" on public.members for select using (
      exists (
        select 1 from public.profiles
        where id = auth.uid() and role in (''cashier'', ''admin'', ''accountant'')
      )
    )';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'members'
      and policyname = 'Members insert'
  ) then
    execute 'create policy "Members insert" on public.members for insert with check (
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
      and tablename = 'members'
      and policyname = 'Members update'
  ) then
    execute 'create policy "Members update" on public.members for update using (
      exists (
        select 1 from public.profiles
        where id = auth.uid() and role in (''admin'', ''accountant'')
      )
    )';
  end if;
end $$;


