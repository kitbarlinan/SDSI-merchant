-- Step 3: reseller program (discount for resellers + unilevel commission for the sponsor).
-- Run once in the Supabase SQL Editor after 0001 and 0002.

-- Merchants in the program (the discount and the commission are charged to them).
alter table public.merchants add column reseller_program boolean not null default false;

-- A SKU can be switched off inside a merchant that is in the program.
alter table public.items add column reseller_off boolean not null default false;

-- Who brought a reseller in.
alter table public.profiles add column sponsor_id uuid references public.profiles (id);
alter table public.profiles add constraint no_self_sponsor check (sponsor_id is null or sponsor_id <> id);

-- The unilevel rate: a percent of the SRP (PHP) of the program products.
alter table public.costing_settings add column unilevel_pct numeric not null default 5
  check (unilevel_pct between 0 and 50);

-- Frozen on the order when it is placed.
alter table public.orders add column sponsor_id uuid references public.profiles (id);
alter table public.orders add column commission_pct numeric;
alter table public.orders add column commission_php numeric(12, 2);

-- Resellers may see which products are in the program (no cost, no margin).
drop view public.catalog;
create view public.catalog as
select
  i.id, i.merchant_id, i.sku, i.name, i.category,
  i.unit_price, i.stock, i.reorder_level, i.expiry_date, i.disabled,
  (m.reseller_program and not i.reseller_off) as in_reseller_program,
  coalesce((
    select sum(l.quantity)::integer
    from public.order_lines l
    join public.orders o on o.id = l.order_id
    where l.item_id = i.id and o.status in ('pending', 'packed')
  ), 0) as reserved,
  (c.live ->> 'pickupPriceHkd')::numeric as live_pickup_hkd,
  c.qty as live_qty
from public.items i
join public.merchants m on m.id = i.merchant_id
left join public.costing_rows c on c.item_id = i.id and c.live is not null
where public.app_role() is not null
  and (
    public.is_sdsi_staff()
    or public.app_role() = 'customer'
    or (public.app_role() = 'merchant' and i.merchant_id = public.app_merchant_id())
  );

drop view public.pricing_settings;
create view public.pricing_settings as
select shipping_fee_hkd, cf_rate_pct, cf_min_hkd, reseller_discount_pct, unilevel_pct
from public.costing_settings
where public.app_role() is not null;

grant select on public.catalog, public.pricing_settings to authenticated;

-- A sponsor sees the commission on the orders of the resellers they brought in,
-- and nothing else about those orders (no products, no customer details, no prices).
create view public.my_commissions as
select o.id as order_id, o.created_at, o.status, o.customer_name, o.commission_pct, o.commission_php
from public.orders o
where o.sponsor_id = auth.uid() and o.commission_php > 0;

grant select on public.my_commissions to authenticated;
