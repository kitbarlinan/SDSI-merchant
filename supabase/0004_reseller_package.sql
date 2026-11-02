-- Step 4: reseller package (350 HKD) + tier income for the 3 levels above the buyer.
-- Replaces the order-level unilevel commission of step 3. Run once in the Supabase SQL Editor after 0001-0003.

-- Package and tier settings (all editable in Accounting -> Costing).
drop view public.pricing_settings;
alter table public.costing_settings drop column unilevel_pct;
alter table public.costing_settings alter column reseller_discount_pct set default 15;
update public.costing_settings set reseller_discount_pct = 15 where id = 1 and reseller_discount_pct = 10;
alter table public.costing_settings
  add column package_hkd     numeric not null default 350 check (package_hkd >= 0),
  add column package_srp_php numeric not null default 990 check (package_srp_php >= 0),
  add column tier_l1_pct     numeric not null default 2 check (tier_l1_pct between 0 and 50),
  add column tier_l2_pct     numeric not null default 2 check (tier_l2_pct between 0 and 50),
  add column tier_l3_pct     numeric not null default 1 check (tier_l3_pct between 0 and 50);

create view public.pricing_settings as
select shipping_fee_hkd, cf_rate_pct, cf_min_hkd, reseller_discount_pct, package_hkd
from public.costing_settings
where public.app_role() is not null;
grant select on public.pricing_settings to authenticated;

-- No commission on regular orders any more.
drop view public.my_commissions;
alter table public.orders drop column sponsor_id, drop column commission_pct, drop column commission_php;

-- One row per package sold. The buyer is an active reseller from then on.
create table public.package_sales (
  id          text primary key,
  reseller_id uuid not null unique references public.profiles (id),
  recorded_by uuid not null references public.profiles (id),
  created_at  timestamp not null default now(),
  hkd         numeric(12, 2) not null,
  srp_php     numeric(12, 2) not null,
  gross_php   numeric(12, 2) not null,
  reseller_php numeric(12, 2) not null,
  net_php     numeric(12, 2) not null,
  payment_method text check (payment_method in ('Cash', 'Bank Transfer', 'Debit / Credit Card'))
);

-- A reseller asked to buy the package; the cashier clears it when the sale is recorded.
create table public.package_requests (
  id          text primary key,
  reseller_id uuid not null unique references public.profiles (id),
  created_at  timestamp not null default now()
);
alter table public.package_requests enable row level security;
revoke all on public.package_requests from anon, authenticated;
create view public.package_requests_open as
select r.id, r.reseller_id, p.name as reseller_name, r.created_at
from public.package_requests r join public.profiles p on p.id = r.reseller_id
where public.is_sdsi_staff() or r.reseller_id = auth.uid();
grant select on public.package_requests_open to authenticated;

-- Who earned what on that sale (levels 1 to 3 above the buyer).
create table public.package_tiers (
  sale_id text not null references public.package_sales (id) on delete cascade,
  level   integer not null check (level between 1 and 3),
  user_id uuid not null references public.profiles (id),
  pct     numeric not null,
  php     numeric(12, 2) not null,
  primary key (sale_id, level)
);

alter table public.package_sales enable row level security;
alter table public.package_tiers enable row level security;
-- No direct reads from the browser: peso figures are admin only, everyone else uses the views below.
revoke all on public.package_sales, public.package_tiers from anon, authenticated;

-- Admin: the full split.
create view public.package_sales_admin as
select s.*, p.name as reseller_name
from public.package_sales s join public.profiles p on p.id = s.reseller_id
where public.app_role() = 'admin';

-- Cashier and admin: who bought, when, how much in HKD. No pesos.
create view public.package_sales_staff as
select s.id, s.reseller_id, p.name as reseller_name, s.created_at, s.hkd
from public.package_sales s join public.profiles p on p.id = s.reseller_id
where public.is_sdsi_staff();

-- A reseller: their own purchase (is the account active?).
create view public.my_package as
select s.id, s.created_at, s.hkd from public.package_sales s where s.reseller_id = auth.uid();

-- A reseller: the tier income they earned, and nothing else about the sale.
create view public.my_tier_income as
select t.sale_id, s.created_at, p.name as reseller_name, t.level, t.pct, t.php
from public.package_tiers t
join public.package_sales s on s.id = t.sale_id
join public.profiles p on p.id = s.reseller_id
where t.user_id = auth.uid();

grant select on public.package_sales_admin, public.package_sales_staff, public.my_package, public.my_tier_income to authenticated;
