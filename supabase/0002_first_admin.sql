-- Step 2: make YOUR login the admin.
-- 1) In Supabase: Authentication -> Users -> Add user -> Create new user.
--    Use your email and a strong password, and tick "Auto Confirm User".
-- 2) Change the email below to the same email, then run this in the SQL Editor.

insert into public.profiles (id, name, role)
select id, 'Kit', 'admin'
from auth.users
where email = 'kitbarlinan@gmail.com'
on conflict (id) do update set role = 'admin', active = true;

-- Check: this should return one row with role = admin.
select id, name, role, active from public.profiles;
