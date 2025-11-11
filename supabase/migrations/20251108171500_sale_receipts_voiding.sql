-- Add voiding metadata columns and policies for sale receipts
alter table if exists public.sale_receipts
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

create index if not exists sale_receipts_voided_at_idx on public.sale_receipts (voided_at);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_receipts'
      and policyname = 'Sale receipts update'
  ) then
    execute 'create policy "Sale receipts update" on public.sale_receipts
      for update using (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'')
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in (''admin'')
        )
      )';
  end if;
end $$;


