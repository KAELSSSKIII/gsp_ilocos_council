-- Allow all cashiers (and existing privileged roles) to view receipt history
drop policy if exists "Sale receipts select" on public.sale_receipts;

create policy "Sale receipts select" on public.sale_receipts
for select
using (
  cashier_id = auth.uid()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('cashier', 'admin', 'accountant')
  )
);


