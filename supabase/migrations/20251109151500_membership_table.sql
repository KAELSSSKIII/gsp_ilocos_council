-- Seed example members for POS client selection
insert into public.members (code, name, email, discount_rate)
values
  ('MEM-001', 'Alex Rivera', 'alex.rivera@example.com', 0.10),
  ('MEM-002', 'Jamie Cruz', 'jamie.cruz@example.com', 0.05),
  ('MEM-003', 'Morgan Dela Cruz', 'morgan.delacruz@example.com', 0.03)
on conflict (code) do update set
  name = excluded.name,
  email = excluded.email,
  discount_rate = excluded.discount_rate,
  updated_at = now();

