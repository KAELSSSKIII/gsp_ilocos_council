-- Update RLS policies for receipt_settings so both admins and cashiers can manage the series
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_settings'
      and policyname = 'Receipt settings select'
  ) then
    execute 'drop policy "Receipt settings select" on public.receipt_settings';
  end if;
  execute 'create policy "Receipt settings select" on public.receipt_settings
    for select using (
      exists (
        select 1 from public.profiles
        where id = auth.uid() and role in (''admin'', ''cashier'')
      )
    )';
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_settings'
      and policyname = 'Receipt settings insert'
  ) then
    execute 'drop policy "Receipt settings insert" on public.receipt_settings';
  end if;
  execute 'create policy "Receipt settings insert" on public.receipt_settings
    for insert with check (
      exists (
        select 1 from public.profiles
        where id = auth.uid() and role in (''admin'', ''cashier'')
      )
    )';
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_settings'
      and policyname = 'Receipt settings update'
  ) then
    execute 'drop policy "Receipt settings update" on public.receipt_settings';
  end if;
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
end $$;


