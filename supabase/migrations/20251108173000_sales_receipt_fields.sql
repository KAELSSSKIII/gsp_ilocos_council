alter table if exists public.sales
  add column if not exists receipt_number integer,
  add column if not exists receipt_issued_at date;

create index if not exists sales_receipt_number_idx on public.sales (receipt_number);


