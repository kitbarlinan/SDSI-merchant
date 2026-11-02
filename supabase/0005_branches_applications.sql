-- Step 5: two branches, reseller applications from the landing page, referral codes.
-- Safe to run again. Run in the Supabase SQL Editor after 0001-0004.
-- Passwords are NOT stored here: Supabase Auth keeps them (hashed) and sends the invite email.

create table if not exists public.branches (
  id   text primary key,
  name text not null
);
insert into public.branches (id, name) values ('shueng-wan', 'SDSI Shueng Wan'), ('central', 'Central')
on conflict (id) do nothing;
alter table public.branches enable row level security;
revoke all on public.branches from anon, authenticated;
grant select on public.branches to authenticated;
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated using (true);

-- Which branch handles an order or a pickup. Missing = SDSI Shueng Wan.
alter table public.orders add column if not exists branch_id text not null default 'shueng-wan' references public.branches (id);
-- A cashier works at one branch and only handles that branch's orders.
alter table public.profiles add column if not exists branch_id text references public.branches (id);
-- Shared by a reseller so new resellers land under them.
alter table public.profiles add column if not exists ref_code text unique;
alter table public.profiles add column if not exists email text;

-- Someone who applied on the landing page. Their account is created when the cashier delivers the order.
create table if not exists public.reseller_applications (
  order_id   text primary key references public.orders (id) on delete cascade,
  name       text not null,
  email      text not null,
  mobile     text not null,
  sponsor_id uuid references public.profiles (id),
  user_id    uuid references public.profiles (id)
);
create unique index if not exists one_open_application_per_email on public.reseller_applications (lower(email));
alter table public.reseller_applications enable row level security;
revoke all on public.reseller_applications from anon, authenticated;

-- Staff see the applications of their branch (the admin all). The applicant's contact details are not for merchants.
drop view if exists public.applications_staff;
create view public.applications_staff as
select a.order_id, a.name, a.email, a.mobile, o.branch_id, o.status, o.created_at
from public.reseller_applications a
join public.orders o on o.id = a.order_id
where public.app_role() = 'admin'
   or (public.app_role() = 'cashier' and o.branch_id = (select branch_id from public.profiles where id = auth.uid()));

grant select on public.applications_staff to authenticated;
