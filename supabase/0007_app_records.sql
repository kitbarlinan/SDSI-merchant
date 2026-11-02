-- Step 7: where the app's data lives once it is real. Safe to run again.
-- Run in the Supabase SQL Editor after 0001-0006.
--
-- The app's rules (orders, stock per branch, payouts, reseller tiers) run on the server and save every
-- record here as one row: kind (item, order, receipt, ...), id and the record itself as JSON.
-- The browser can NOT read or write this table. Only the server (DATABASE_URL) can.
-- The browser asks the server for its data, and the server sends each person only their own part.

create table if not exists public.app_records (
  kind       text   not null,
  id         text   not null,
  data       jsonb  not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
create index if not exists app_records_kind on public.app_records (kind);

alter table public.app_records enable row level security;
revoke all on public.app_records from anon, authenticated;
-- No policies on purpose: with RLS on and no policy, anon and signed-in browsers get nothing.
