-- Step 4: reseller package (an SKU, 350 HKD) + 15% reseller discount + tier income for the 3 levels above the buyer.
-- Replaces the order-level unilevel commission of step 3. Safe to run again if an earlier try stopped half way. Run in the Supabase SQL Editor after 0001-0003.

drop view if exists public.package_requests_open;
drop table if exists public.package_requests;

-- Package and tier settings (all editable in Accounting -> Costing).
drop view if exists public.pricing_settings;
alter table public.costing_settings drop column if exists unilevel_pct;
alter table public.costing_settings alter column reseller_discount_pct set default 15;
update public.costing_settings set reseller_discount_pct = 15 where id = 1 and reseller_discount_pct = 10;
alter table public.costing_settings
  add column if not exists package_hkd     numeric not null default 350 check (package_hkd >= 0),
  add column if not exists package_srp_php numeric not null default 990 check (package_srp_php >= 0),
  add column if not exists tier_l1_pct     numeric not null default 2 check (tier_l1_pct between 0 and 50),
  add column if not exists tier_l2_pct     numeric not null default 2 check (tier_l2_pct between 0 and 50),
  add column if not exists tier_l3_pct     numeric not null default 1 check (tier_l3_pct between 0 and 50);

create view public.pricing_settings as
select shipping_fee_hkd, cf_rate_pct, cf_min_hkd, reseller_discount_pct, package_hkd
from public.costing_settings
where public.app_role() is not null;
grant select on public.pricing_settings to authenticated;

-- The package is a product that bundles other goods. Buying it (order delivered) makes the buyer a reseller.
alter table public.items
  add column if not exists is_package boolean not null default false,
  add column if not exists inclusions text;

-- The discount (15% of the SRP) comes out of SDSI's top-up, not the merchant. Tier income per order, earned once delivered.
alter table public.orders add column if not exists buyer_id uuid references public.profiles (id);
create table if not exists public.order_tiers (
  order_id text not null references public.orders (id) on delete cascade,
  level    integer not null check (level between 1 and 3),
  user_id  uuid not null references public.profiles (id),
  pct      numeric not null,
  php      numeric(12, 2) not null,
  primary key (order_id, level)
);
alter table public.order_tiers enable row level security;
revoke all on public.order_tiers from anon, authenticated;

-- No commission to one sponsor on regular orders any more (replaced by the tiers above).
drop view if exists public.my_commissions;
alter table public.orders drop column if exists sponsor_id, drop column if exists commission_pct, drop column if exists commission_php;

-- One row per package sold. The buyer is an active reseller from then on.
create table if not exists public.package_sales (
  id          text primary key,
  reseller_id uuid not null unique references public.profiles (id),
  recorded_by uuid not null references public.profiles (id),
  created_at  timestamp not null default now(),
  hkd         numeric(12, 2) not null,
  srp_php     numeric(12, 2) not null,
  gross_php   numeric(12, 2) not null,
  reseller_php numeric(12, 2) not null,
  net_php     numeric(12, 2) not null,
  order_id    text references public.orders (id),
  payment_method text check (payment_method in ('Cash', 'Bank Transfer', 'Debit / Credit Card'))
);

alter table public.package_sales add column if not exists order_id text references public.orders (id);
alter table public.package_sales add column if not exists payment_method text check (payment_method in ('Cash', 'Bank Transfer', 'Debit / Credit Card'));

-- Who earned what on that sale (levels 1 to 3 above the buyer).
create table if not exists public.package_tiers (
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
drop view if exists public.package_sales_admin;
create view public.package_sales_admin as
select s.*, p.name as reseller_name
from public.package_sales s join public.profiles p on p.id = s.reseller_id
where public.app_role() = 'admin';

-- Cashier and admin: who bought, when, how much in HKD. No pesos.
drop view if exists public.package_sales_staff;
create view public.package_sales_staff as
select s.id, s.reseller_id, p.name as reseller_name, s.created_at, s.hkd
from public.package_sales s join public.profiles p on p.id = s.reseller_id
where public.is_sdsi_staff();

-- A reseller: their own purchase (is the account active?).
drop view if exists public.my_package;
create view public.my_package as
select s.id, s.created_at, s.hkd from public.package_sales s where s.reseller_id = auth.uid();

-- A reseller: the tier income they earned, and nothing else about the sale.
drop view if exists public.my_tier_income;
create view public.my_tier_income as
select t.sale_id as ref, s.created_at, p.name as reseller_name, t.level, t.pct, t.php
from public.package_tiers t
join public.package_sales s on s.id = t.sale_id
join public.profiles p on p.id = s.reseller_id
where t.user_id = auth.uid();

-- The same for orders: earned once the order is delivered, on the way before that.
drop view if exists public.my_tier_income_orders;
create view public.my_tier_income_orders as
select t.order_id as ref, o.created_at, o.customer_name as reseller_name, t.level, t.pct, t.php, (o.status = 'delivered') as earned
from public.order_tiers t
join public.orders o on o.id = t.order_id
where t.user_id = auth.uid() and o.status not in ('cancelled', 'rts');

grant select on public.package_sales_admin, public.package_sales_staff, public.my_package, public.my_tier_income, public.my_tier_income_orders to authenticated;
