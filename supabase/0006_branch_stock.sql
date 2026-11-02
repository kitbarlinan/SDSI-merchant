-- Step 6: stock per branch, branch addresses, final names. Safe to run again.
-- Run in the Supabase SQL Editor after 0001-0005.

alter table public.branches add column if not exists address text not null default '';
update public.branches set name = 'SDSI Sheung Wan', address = '7/F, Room 704, 60-66 Cheong Tai Building, Wing Lok Street, Sheung Wan, Hong Kong' where id = 'shueng-wan';
update public.branches set address = '3/F, Shop 345, Worldwide Plaza, 19 Des Voeux Road Central, Hong Kong' where id = 'central';

-- Stock on each branch's shelf. items.stock stays as the total (the sum of both branches).
create table if not exists public.item_branch_stock (
  item_id   text not null references public.items (id) on delete cascade,
  branch_id text not null references public.branches (id),
  stock     integer not null default 0 check (stock >= 0),
  primary key (item_id, branch_id)
);

-- Everything that was on hand so far is at SDSI Sheung Wan (the default branch).
insert into public.item_branch_stock (item_id, branch_id, stock)
select i.id, b.id, case when b.id = 'shueng-wan' then i.stock else 0 end
from public.items i cross join public.branches b
on conflict (item_id, branch_id) do nothing;

-- Stock in / out / returns say which branch they are for. Missing = SDSI Sheung Wan.
alter table public.receipts add column if not exists branch_id text not null default 'shueng-wan' references public.branches (id);

-- Keep the total equal to the branch shelves.
create or replace function public.sync_item_total() returns trigger language plpgsql as $$
begin
  update public.items
     set stock = (select coalesce(sum(stock), 0) from public.item_branch_stock where item_id = coalesce(new.item_id, old.item_id))
   where id = coalesce(new.item_id, old.item_id);
  return null;
end $$;
drop trigger if exists item_branch_stock_total on public.item_branch_stock;
create trigger item_branch_stock_total after insert or update or delete on public.item_branch_stock
  for each row execute function public.sync_item_total();

-- Same visibility as the products themselves.
alter table public.item_branch_stock enable row level security;
revoke all on public.item_branch_stock from anon, authenticated;
grant select on public.item_branch_stock to authenticated;
drop policy if exists item_branch_stock_read on public.item_branch_stock;
create policy item_branch_stock_read on public.item_branch_stock for select to authenticated
  using (exists (select 1 from public.items i where i.id = item_id));

-- What a buyer may see: is there stock on this branch? (no cost, no other merchants' detail)
create or replace view public.branch_availability with (security_invoker = false) as
select s.item_id, s.branch_id, s.stock > 0 as in_stock
from public.item_branch_stock s join public.items i on i.id = s.item_id and not i.disabled;
revoke all on public.branch_availability from anon, authenticated;
grant select on public.branch_availability to authenticated;
