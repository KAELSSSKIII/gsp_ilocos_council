create table if not exists public.receipt_settings (
  id uuid primary key default uuid_generate_v4(),
  start_number integer not null,
  end_number integer not null,
  current_number integer not null,
  date_issued date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipt_settings_updated_at_idx on public.receipt_settings (updated_at desc);

create or replace function public.set_receipt_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_receipt_settings_updated_at on public.receipt_settings;
create trigger set_receipt_settings_updated_at
  before update on public.receipt_settings
  for each row
  execute function public.set_receipt_settings_updated_at();

alter table public.receipt_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_settings'
      and policyname = 'Receipt settings select'
  ) then
    execute 'create policy "Receipt settings select" on public.receipt_settings
      for select using (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'', ''cashier'')
        )
      )';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_settings'
      and policyname = 'Receipt settings insert'
  ) then
    execute 'create policy "Receipt settings insert" on public.receipt_settings
      for insert with check (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'', ''cashier'')
        )
      )';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_settings'
      and policyname = 'Receipt settings update'
  ) then
    execute 'create policy "Receipt settings update" on public.receipt_settings
      for update using (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'', ''cashier'')
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'', ''cashier'')
        )
      )';
  end if;
end $$;


