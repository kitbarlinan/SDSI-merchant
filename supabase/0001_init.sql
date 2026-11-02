-- SDSI Wellness: database schema, access rules (RLS) and safe views.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- How access works:
--   * The browser can only READ, and only what its role may see (RLS policies below).
--   * Nothing can be written from the browser. All writes (orders, approvals, payouts, costing...)
--     are done by the server, which checks the rules first (Phase 2).
--   * Times are stored as local time (Hong Kong and Manila share UTC+8).


-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.merchants (
  id    text primary key,
  name  text not null,
  color text not null default '#059669'
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  role        text not null check (role in ('admin', 'cashier', 'clerk', 'merchant', 'customer')),
  merchant_id text references public.merchants (id),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint merchant_has_merchant check (role <> 'merchant' or merchant_id is not null)
);

-- ---------------------------------------------------------------------------
-- Products and prices
-- ---------------------------------------------------------------------------

create table public.items (
  id            text primary key,
  merchant_id   text not null references public.merchants (id),
  sku           text not null,
  name          text not null,
  category      text not null,
  unit_cost     numeric(12, 2) not null default 0,
  unit_price    numeric(12, 2) not null check (unit_price >= 0),      -- SRP in PHP
  stock         integer not null default 0 check (stock >= 0),
  reorder_level integer not null default 10,
  expiry_date   date not null,
  disabled      boolean not null default false
);
-- A SKU code is unique (any capitals) and never reused, even for a disabled SKU.
create unique index items_sku_unique on public.items (lower(sku));

create table public.costing_settings (
  id                    integer primary key default 1 check (id = 1),
  markup_pct            numeric not null default 50,
  fx_php_per_hkd        numeric not null default 8.1432 check (fx_php_per_hkd > 0),
  sf_per_qty_hkd        numeric not null default 5,
  shipping_fee_hkd      numeric not null default 34,
  cf_rate_pct           numeric not null default 2.5,
  cf_min_hkd            numeric not null default 5,
  reseller_discount_pct numeric not null default 10 check (reseller_discount_pct between 0 and 90)
);
insert into public.costing_settings (id) values (1);

create table public.costing_rows (
  id               text primary key,
  item_id          text not null unique references public.items (id),   -- one row per SKU
  qty              integer not null default 1 check (qty between 1 and 99),
  pickup_price_hkd numeric(12, 2),
  status           text not null default 'draft' check (status in ('draft', 'approved', 'live')),
  live             jsonb,                                              -- frozen when it goes live
  approved_by      uuid references public.profiles (id),
  approved_at      timestamp
);

create table public.costing_log (
  id      text primary key,
  at      timestamp not null,
  by      uuid references public.profiles (id),
  summary text not null,
  details jsonb not null default '[]'
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create table public.orders (
  id                 text primary key,                                  -- POID-000123, never reused
  merchant_id        text not null references public.merchants (id),
  source             text not null check (source in ('merchant', 'walk-in', 'reseller')),
  created_by         uuid not null references public.profiles (id),
  created_at         timestamp not null,
  customer_name      text,
  contact_no         text not null default '',
  address            text not null default '',
  notes              text not null default '',
  terms              text not null check (terms in ('COP', 'COD')),
  status             text not null check (status in ('pending', 'packed', 'shipped', 'delivered', 'rts', 'cancelled')),
  packed_at          timestamp,
  shipped_at         timestamp,
  waybill            text,
  delivered_at       timestamp,
  rts_at             timestamp,
  rts_reason         text,
  return_receipt_id  text,
  handled_by         uuid references public.profiles (id),
  payment_method     text check (payment_method in ('Cash', 'Bank Transfer', 'Debit / Credit Card')),
  top_up_rate        numeric,
  cancelled_at       timestamp,
  cancel_reason      text,
  sf_hkd             numeric(12, 2),
  collection_fee_hkd numeric(12, 2),
  net_cod_hkd        numeric(12, 2),
  pickup_hkd         numeric(12, 2),
  amount_hkd         numeric(12, 2),
  discount_pct       numeric,
  discount_hkd       numeric(12, 2),
  discount_php       numeric(12, 2)
);
create unique index orders_waybill_unique on public.orders (waybill) where waybill is not null;
create index orders_merchant_idx on public.orders (merchant_id, created_at desc);
create index orders_creator_idx on public.orders (created_by);
create index orders_status_idx on public.orders (status);

create table public.order_lines (
  order_id   text not null references public.orders (id) on delete cascade,
  line_no    integer not null,
  item_id    text not null references public.items (id),
  sku        text not null,
  name       text not null,
  category   text not null,
  quantity   integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  unit_cost  numeric(12, 2) not null default 0,
  total      numeric(12, 2) not null,
  primary key (order_id, line_no)
);

-- ---------------------------------------------------------------------------
-- Stock receiving, undo requests, remittances
-- ---------------------------------------------------------------------------

create table public.receipts (
  id            text primary key,
  kind          text not null check (kind in ('stock-in', 'stock-out', 'rts')),
  merchant_id   text not null references public.merchants (id),
  order_id      text references public.orders (id),
  received_date date not null,
  note          text not null default '',
  received_by   uuid not null references public.profiles (id),
  created_at    timestamp not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by    uuid references public.profiles (id),
  decided_at    timestamp,
  reject_reason text
);

create table public.receipt_lines (
  receipt_id text not null references public.receipts (id) on delete cascade,
  item_id    text not null references public.items (id),
  sku        text not null,
  name       text not null,
  quantity   integer not null check (quantity > 0),
  primary key (receipt_id, item_id)
);

create table public.reversals (
  id            text primary key,
  order_id      text not null references public.orders (id),
  merchant_id   text not null references public.merchants (id),
  from_status   text not null,
  requested_by  uuid not null references public.profiles (id),
  requested_at  timestamp not null,
  note          text not null check (length(trim(note)) >= 5),         -- the cashier must say why
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by    uuid references public.profiles (id),
  decided_at    timestamp,
  decision_note text
);
-- Only one waiting request per order.
create unique index reversals_one_pending on public.reversals (order_id) where status = 'pending';

create table public.remittances (
  id              text primary key,
  merchant_id     text not null references public.merchants (id),
  week_start      date not null,                                       -- Monday
  week_end        date not null,                                       -- Sunday
  net_payable     numeric(12, 2) not null,
  deduction_php   numeric(12, 2) not null default 0 check (deduction_php >= 0),
  deduction_note  text not null default '',
  adjustment_php  numeric(12, 2) not null default 0,
  adjustment_note text not null default '',
  payout_php      numeric(12, 2) not null,
  status          text not null default 'pending' check (status in ('pending', 'submitted', 'released')),
  closed_by       uuid references public.profiles (id),
  closed_at       timestamp,
  released_by     uuid references public.profiles (id),                -- the cashier
  released_at     timestamp,
  released_date   date,
  reference       text,
  approved_by     uuid references public.profiles (id),                -- the admin
  approved_at     timestamp,
  reject_note     text,
  constraint week_is_monday check (extract(isodow from week_start) = 1),
  constraint week_is_seven_days check (week_end = week_start + 6),
  unique (merchant_id, week_start)
);

create table public.remittance_orders (
  remittance_id text not null references public.remittances (id) on delete cascade,
  order_id      text not null unique references public.orders (id),    -- an order is in at most one remittance
  primary key (remittance_id, order_id)
);

-- Counters for POID, receipts, undo requests, remittances. The server locks and bumps them.
create table public.counters (
  name  text primary key,
  value bigint not null default 0
);
insert into public.counters (name, value)
values ('poid', 0), ('receipt', 0), ('reversal', 0), ('remittance', 0), ('costing_log', 0);

-- ---------------------------------------------------------------------------
-- Who is asking? (used by the access rules)
-- ---------------------------------------------------------------------------

create function public.app_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and active $$;

create function public.app_merchant_id() returns text
language sql stable security definer set search_path = ''
as $$ select merchant_id from public.profiles where id = auth.uid() and active $$;

create function public.is_sdsi_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.app_role() in ('admin', 'cashier', 'clerk'), false) $$;

-- ---------------------------------------------------------------------------
-- Access rules (RLS). Everything is closed unless a policy opens it.
-- There are NO insert / update / delete policies: the browser cannot write.
-- ---------------------------------------------------------------------------

alter table public.merchants         enable row level security;
alter table public.profiles          enable row level security;
alter table public.items             enable row level security;
alter table public.costing_settings  enable row level security;
alter table public.costing_rows      enable row level security;
alter table public.costing_log       enable row level security;
alter table public.orders            enable row level security;
alter table public.order_lines       enable row level security;
alter table public.receipts          enable row level security;
alter table public.receipt_lines     enable row level security;
alter table public.reversals         enable row level security;
alter table public.remittances       enable row level security;
alter table public.remittance_orders enable row level security;
alter table public.counters          enable row level security;

-- Anyone signed in sees merchant names and staff names (to show "handled by").
create policy merchants_read on public.merchants for select to authenticated
  using (public.app_role() is not null);

create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.app_role() = 'admin'
    or (public.is_sdsi_staff() and role in ('admin', 'cashier', 'clerk'))
    or (public.app_role() = 'merchant' and role in ('admin', 'cashier', 'clerk'))
  );

-- Products: staff see all, a merchant sees their own. Resellers use the "catalog" view (no cost).
create policy items_read on public.items for select to authenticated
  using (public.is_sdsi_staff() or (public.app_role() = 'merchant' and merchant_id = public.app_merchant_id()));

-- Costing is for the admin only.
create policy costing_settings_admin on public.costing_settings for select to authenticated
  using (public.app_role() = 'admin');
create policy costing_rows_admin on public.costing_rows for select to authenticated
  using (public.app_role() = 'admin');
create policy costing_log_admin on public.costing_log for select to authenticated
  using (public.app_role() = 'admin');

-- Orders: staff see all, a merchant sees their own, a reseller sees only what they placed.
create policy orders_read on public.orders for select to authenticated
  using (
    public.is_sdsi_staff()
    or (public.app_role() = 'merchant' and merchant_id = public.app_merchant_id())
    or (public.app_role() = 'customer' and created_by = auth.uid())
  );

create policy order_lines_read on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_lines.order_id));  -- follows the orders rule

create policy receipts_read on public.receipts for select to authenticated
  using (public.is_sdsi_staff() or (public.app_role() = 'merchant' and merchant_id = public.app_merchant_id()));

create policy receipt_lines_read on public.receipt_lines for select to authenticated
  using (exists (select 1 from public.receipts r where r.id = receipt_lines.receipt_id));

create policy reversals_read on public.reversals for select to authenticated
  using (public.is_sdsi_staff() or (public.app_role() = 'merchant' and merchant_id = public.app_merchant_id()));

-- Payouts: admin and cashier (the cashier releases them), and the merchant sees their own.
create policy remittances_read on public.remittances for select to authenticated
  using (
    public.app_role() in ('admin', 'cashier')
    or (public.app_role() = 'merchant' and merchant_id = public.app_merchant_id())
  );

create policy remittance_orders_read on public.remittance_orders for select to authenticated
  using (exists (select 1 from public.remittances r where r.id = remittance_orders.remittance_id));

-- counters: no policy, so nobody but the server can touch them.

-- ---------------------------------------------------------------------------
-- Safe views: what every signed-in role may see without cost or margin.
-- ---------------------------------------------------------------------------

-- The product list with stock, what is already promised, and the live pickup price (HKD).
create view public.catalog as
select
  i.id, i.merchant_id, i.sku, i.name, i.category,
  i.unit_price, i.stock, i.reorder_level, i.expiry_date, i.disabled,
  coalesce((
    select sum(l.quantity)::integer
    from public.order_lines l
    join public.orders o on o.id = l.order_id
    where l.item_id = i.id and o.status in ('pending', 'packed')
  ), 0) as reserved,
  (c.live ->> 'pickupPriceHkd')::numeric as live_pickup_hkd,
  c.qty as live_qty
from public.items i
left join public.costing_rows c on c.item_id = i.id and c.live is not null
where public.app_role() is not null
  and (
    public.is_sdsi_staff()
    or public.app_role() = 'customer'
    or (public.app_role() = 'merchant' and i.merchant_id = public.app_merchant_id())
  );

-- Fees shown on orders. No mark-up and no exchange rate (that is SDSI's margin).
create view public.pricing_settings as
select shipping_fee_hkd, cf_rate_pct, cf_min_hkd, reseller_discount_pct
from public.costing_settings
where public.app_role() is not null;

-- ---------------------------------------------------------------------------
-- Privileges: sign-in users may only SELECT (and only where the rules above allow it).
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;

grant usage on schema public to authenticated;
grant select on
  public.merchants, public.profiles, public.items,
  public.costing_settings, public.costing_rows, public.costing_log,
  public.orders, public.order_lines, public.receipts, public.receipt_lines,
  public.reversals, public.remittances, public.remittance_orders,
  public.catalog, public.pricing_settings
to authenticated;

grant execute on function public.app_role(), public.app_merchant_id(), public.is_sdsi_staff() to authenticated;
