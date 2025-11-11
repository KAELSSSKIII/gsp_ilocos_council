-- Ensure Hall & Room rental categories exist
begin;

insert into public.product_categories (name)
select name
from (values ('Hall Rental'), ('Room Rental'), ('Hall & Room Rentals')) as t(name)
where not exists (
  select 1 from public.product_categories c
  where c.name = t.name
);

commit;
