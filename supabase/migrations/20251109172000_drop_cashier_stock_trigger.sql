begin;

drop trigger if exists trg_prevent_cashier_stock_increase on public.products;
drop function if exists public.prevent_cashier_stock_increase();

commit;

