// Checks the access rules of 0001 + 0003 on a local Postgres (PGlite). Run: npm i @electric-sql/pglite && node supabase/tests/rls.test.mjs
// Checks the access rules of 0001_init.sql on a local Postgres (PGlite). Run: npm i @electric-sql/pglite && node supabase/tests/rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
 create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth;
 create table auth.users (id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
const sql = fs.readFileSync(new URL('../0001_init.sql', import.meta.url), 'utf8');
await db.exec(sql);
await db.exec(fs.readFileSync(new URL('../0003_reseller_program.sql', import.meta.url), 'utf8'));
console.log('schema ok');
const U = { admin: '00000000-0000-0000-0000-000000000001', cashier: '00000000-0000-0000-0000-000000000002', clerk: '00000000-0000-0000-0000-000000000003', m1: '00000000-0000-0000-0000-000000000011', m2: '00000000-0000-0000-0000-000000000012', c1: '00000000-0000-0000-0000-000000000021', c2: '00000000-0000-0000-0000-000000000022' };
await db.exec(`
 insert into auth.users select unnest(array['${Object.values(U).join("','")}']::uuid[]);
 insert into merchants values ('mrc-1','Green Leaf','#0a0'),('mrc-2','Pure Glow','#a00');
 insert into profiles (id,name,role,merchant_id) values
  ('${U.admin}','Kit','admin',null),('${U.cashier}','Ana','cashier',null),('${U.clerk}','Rey','clerk',null),
  ('${U.m1}','Liza','merchant','mrc-1'),('${U.m2}','Bea','merchant','mrc-2'),('${U.c1}','Mei','customer',null),('${U.c2}','Ka Ho','customer',null);
 insert into items (id,merchant_id,sku,name,category,unit_cost,unit_price,stock,expiry_date) values
  ('itm-1','mrc-1','A-1','Barley','Greens',420,690,100,'2027-01-01'),('itm-2','mrc-2','B-1','Collagen','Beauty',500,880,50,'2027-01-01');
 insert into costing_rows (id,item_id,qty,pickup_price_hkd,status,live) values ('cst-1','itm-1',1,133,'live','{"pickupPriceHkd":133}'),('cst-2','itm-2',1,168,'draft',null);
 insert into orders (id,merchant_id,source,created_by,created_at,terms,status) values
  ('POID-1','mrc-1','reseller','${U.c1}','2026-11-01 10:00','COP','pending'),
  ('POID-2','mrc-2','merchant','${U.m2}','2026-11-01 11:00','COP','packed'),
  ('POID-3','mrc-1','reseller','${U.c2}','2026-11-01 12:00','COP','pending');
 insert into order_lines values ('POID-1',1,'itm-1','A-1','Barley','Greens',2,690,420,1380),('POID-2',1,'itm-2','B-1','Collagen','Beauty',1,880,500,880),('POID-3',1,'itm-1','A-1','Barley','Greens',1,690,420,690);
 insert into remittances (id,merchant_id,week_start,week_end,net_payable,payout_php) values ('RMT-1','mrc-1','2026-10-19','2026-10-25',1000,1000);
`);
let fails = 0;
const as = async (user, q) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`); try { const r = await db.query(q); return r.rows; } catch (e) { return 'ERR: ' + e.message; } finally { await db.exec('reset role;'); } };
const check = (n, c, extra) => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', n, c ? '' : JSON.stringify(extra)); };
const n = (r) => Array.isArray(r) ? r.length : r;

check('admin sees all orders', n(await as(U.admin, 'select * from orders')) === 3);
check('cashier sees all orders', n(await as(U.cashier, 'select * from orders')) === 3);
check('merchant sees only own orders', n(await as(U.m1, 'select * from orders')) === 2 && n(await as(U.m2, 'select * from orders')) === 1);
check('reseller sees only own orders', n(await as(U.c1, 'select * from orders')) === 1 && n(await as(U.c2, 'select * from orders')) === 1);
check('order_lines follow orders', n(await as(U.c1, 'select * from order_lines')) === 1 && n(await as(U.m2, 'select * from order_lines')) === 1 && n(await as(U.admin, 'select * from order_lines')) === 3);
check('reseller cannot read items table (has cost)', n(await as(U.c1, 'select * from items')) === 0);
const cat = await as(U.c1, 'select * from catalog order by id');
check('reseller sees catalog, no cost column, with reserved + live price', Array.isArray(cat) && cat.length === 2 && !('unit_cost' in cat[0]) && cat[0].reserved === 3 && Number(cat[0].live_pickup_hkd) === 133 && cat[1].live_pickup_hkd === null, cat);
check('merchant catalog only own products', n(await as(U.m1, 'select * from catalog')) === 1);
check('merchant reads own items, not others', n(await as(U.m1, 'select * from items')) === 1);
check('costing is admin only', n(await as(U.admin, 'select * from costing_rows')) === 2 && n(await as(U.cashier, 'select * from costing_rows')) === 0 && n(await as(U.m1, 'select * from costing_settings')) === 0 && n(await as(U.c1, 'select * from costing_log')) === 0);
const ps = await as(U.m1, 'select * from pricing_settings');
check('pricing_settings has no markup / fx', Array.isArray(ps) && ps.length === 1 && !('markup_pct' in ps[0]) && !('fx_php_per_hkd' in ps[0]), ps);
check('remittances: admin, cashier and own merchant only', n(await as(U.admin, 'select * from remittances')) === 1 && n(await as(U.cashier, 'select * from remittances')) === 1 && n(await as(U.m1, 'select * from remittances')) === 1 && n(await as(U.m2, 'select * from remittances')) === 0 && n(await as(U.clerk, 'select * from remittances')) === 0 && n(await as(U.c1, 'select * from remittances')) === 0);
check('profiles: reseller sees only self; merchant sees staff + self', n(await as(U.c1, 'select * from profiles')) === 1 && n(await as(U.m1, 'select * from profiles')) === 4);
check('counters closed to everyone signed in', typeof (await as(U.admin, 'select * from counters')) === 'string');
for (const [who, q] of [['admin', "insert into orders (id,merchant_id,source,created_by,created_at,terms,status) values ('X','mrc-1','merchant','" + U.admin + "','2026-11-01','COP','pending')"], ['cashier', "update items set stock = 9999"], ['m1', "delete from orders"], ['c1', "update orders set status = 'delivered'"], ['admin', "update remittances set payout_php = 1"]]) {
  const r = await as(U[who], q);
  check(`${who} cannot write: ${q.slice(0, 28)}`, typeof r === 'string' && /permission denied/.test(r), r);
}
// anon sees nothing
await db.exec("set role anon;");
let anonRes; try { await db.query('select * from orders'); anonRes = 'READ'; } catch (e) { anonRes = 'denied'; }
await db.exec('reset role;');
check('anon cannot read', anonRes === 'denied');
// data rules
const bad = async (q) => { try { await db.exec(q); return false; } catch { return true; } };
check('sku unique ignoring capitals', await bad("insert into items (id,merchant_id,sku,name,category,unit_price,expiry_date) values ('itm-9','mrc-1','a-1','x','y',1,'2027-01-01')"));
check('no negative stock', await bad("update items set stock = -1 where id='itm-1'"));
check('waybill unique', await bad("update orders set waybill='W1' where id in ('POID-1','POID-3')"));
check('one pending undo per order', await bad("insert into reversals (id,order_id,merchant_id,from_status,requested_by,requested_at,note) values ('R1','POID-1','mrc-1','packed','" + U.cashier + "','2026-11-01','mistake one'),('R2','POID-1','mrc-1','packed','" + U.cashier + "','2026-11-01','mistake two')"));
check('undo needs a real note', await bad("insert into reversals (id,order_id,merchant_id,from_status,requested_by,requested_at,note) values ('R3','POID-2','mrc-2','packed','" + U.cashier + "','2026-11-01','x')"));
check('week must start Monday', await bad("insert into remittances (id,merchant_id,week_start,week_end,net_payable,payout_php) values ('RMT-2','mrc-2','2026-10-20','2026-10-26',1,1)"));
check('an order is in at most one remittance', await bad("insert into remittances (id,merchant_id,week_start,week_end,net_payable,payout_php) values ('RMT-3','mrc-1','2026-10-26','2026-11-01',1,1); insert into remittance_orders values ('RMT-1','POID-1'),('RMT-3','POID-1')"));
check('merchant profile needs a merchant', await bad("insert into profiles (id,name,role) select '" + U.m1 + "','x','merchant' where false; insert into auth.users values ('00000000-0000-0000-0000-000000000099'); insert into profiles (id,name,role) values ('00000000-0000-0000-0000-000000000099','x','merchant')"));

// ---- reseller program (0003)
await db.exec(`update merchants set reseller_program = true where id = 'mrc-1';
 update items set reseller_off = false;
 update profiles set sponsor_id = '${U.c1}' where id = '${U.c2}';
 update orders set sponsor_id = '${U.c1}', commission_pct = 5, commission_php = 34.5 where id = 'POID-3';`);
const cat2 = await as(U.c2, 'select id, in_reseller_program from catalog order by id');
check('catalog shows which products are in the program', Array.isArray(cat2) && cat2[0].in_reseller_program === true && cat2[1].in_reseller_program === false, cat2);
const mc = await as(U.c1, 'select * from my_commissions');
check('sponsor sees only commission rows of their group, nothing else', Array.isArray(mc) && mc.length === 1 && mc[0].order_id === 'POID-3' && !('address' in mc[0]) && !('amount_hkd' in mc[0]), mc);
check('another reseller sees no commissions', n(await as(U.c2, 'select * from my_commissions')) === 0 && n(await as(U.m1, 'select * from my_commissions')) === 0);
check('pricing_settings still hides markup/fx', !('markup_pct' in (await as(U.m1, 'select * from pricing_settings'))[0]));
check('cannot sponsor yourself', await bad("update profiles set sponsor_id = id where id = '" + U.c1 + "'"));
console.log(fails ? fails + ' FAILED' : 'ALL DB CHECKS PASSED');
