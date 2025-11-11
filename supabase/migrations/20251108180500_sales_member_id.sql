alter table if exists public.sales
  add column if not exists member_id uuid references public.members(id);












