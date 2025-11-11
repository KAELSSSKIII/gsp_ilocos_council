-- Enhance sales void workflow: status column, void logs, and helper function
begin;

alter table public.sales
  add column if not exists status text default 'completed';

update public.sales
set status = coalesce(status, 'completed');

alter table public.sales
  alter column status set not null;

create table if not exists public.sale_void_events (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  sale_number text not null,
  receipt_number integer,
  void_reason text,
  voided_by uuid references public.profiles(id),
  voided_at timestamptz not null default now()
);

create index if not exists sale_void_events_sale_id_idx on public.sale_void_events (sale_id);
create index if not exists sale_void_events_voided_at_idx on public.sale_void_events (voided_at);

create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text default null,
  p_voided_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sale_row public.sales%rowtype;
  receipt_row_count integer;
  product_record record;
begin
  select * into sale_row
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'SALE_NOT_FOUND';
  end if;

  if sale_row.status = 'voided' then
    raise exception 'SALE_ALREADY_VOIDED';
  end if;

  for product_record in
    select product_id, sum(quantity) as total_quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by product_id
  loop
    update public.products
    set stock_quantity = stock_quantity + product_record.total_quantity,
        updated_at = now()
    where id = product_record.product_id;
  end loop;

  update public.sales
  set status = 'voided'
  where id = p_sale_id;

  update public.sale_receipts
  set voided_at = now(),
      voided_by = p_voided_by,
      void_reason = p_reason
  where sale_id = p_sale_id;

  get diagnostics receipt_row_count = row_count;

  if receipt_row_count = 0 then
    update public.sale_receipts
    set sale_id = sale_row.id,
        voided_at = now(),
        voided_by = p_voided_by,
        void_reason = p_reason
    where sale_number = sale_row.sale_number;
  end if;

  insert into public.sale_void_events (sale_id, sale_number, receipt_number, void_reason, voided_by)
  values (sale_row.id, sale_row.sale_number, sale_row.receipt_number, p_reason, p_voided_by);
end;
$$;

grant execute on function public.void_sale(uuid, text, uuid) to authenticated, service_role;

commit;

