-- POS stock decrement helper
create or replace function public.decrement_product_stock(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set stock_quantity = greatest(stock_quantity - coalesce(p_quantity, 0), 0),
      updated_at = now()
  where id = p_product_id;
end;
$$;

grant execute on function public.decrement_product_stock(uuid, integer) to authenticated;



