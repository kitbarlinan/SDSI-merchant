import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import * as M from '../../lib/mock-data';
import { emptyState, loadAll, saveDiff } from '../../lib/server/repo';
import { act, dataFor, publicCatalog } from '../../lib/server/service';
import type { TxDb } from '../../lib/server/db';

let fails = 0;
const check = (n: string, c: boolean, extra = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', n, c ? '' : extra); };

async function newDb() {
  const pg = new PGlite();
  await pg.exec("create role anon; create role authenticated; create schema if not exists auth; create table public.profiles (id uuid primary key, name text, role text, active boolean default true);");
  await pg.exec(fs.readFileSync('../0007_app_records.sql', 'utf8'));
  await pg.exec(fs.readFileSync('../0007_app_records.sql', 'utf8')); // twice
  const db: TxDb = {
    query: (sql, params) => pg.query(sql, params as any[]) as any,
    tx: (fn) => pg.transaction((t) => fn({ query: (sql: string, params?: unknown[]) => t.query(sql, params as any[]) as any })),
  };
  return { pg, db };
}

const stateOfMock = () => ({
  ...emptyState(),
  items: M.MOCK_INVENTORY.map((i) => ({ ...i })),
  orders: M.MOCK_ORDERS.map((o) => ({ ...o })),
  receipts: M.MOCK_RECEIPTS.map((r) => ({ ...r })),
  reversals: JSON.parse(JSON.stringify(M.MOCK_REVERSALS)),
  remittances: JSON.parse(JSON.stringify(M.MOCK_REMITTANCES)),
  packageSales: JSON.parse(JSON.stringify(M.MOCK_PACKAGE_SALES)),
  users: M.MOCK_USERS.map((u) => ({ ...u, authId: 'auth-' + u.id })),
  costing: JSON.parse(JSON.stringify(M.MOCK_COSTING)),
  poSeq: M.MOCK_PO_SEQ,
});

const invited: { email: string; name: string }[] = [];
const deps = { invite: async (email: string, name: string) => { invited.push({ email, name }); return 'auth-new-' + invited.length; }, now: () => '2026-10-29T10:00' };
const A = (id: string) => ({ authId: 'auth-' + id });

(async () => {
  const { db, pg } = await newDb();
  // ---- seed and round trip
  await db.tx(async (q) => { const empty = await loadAll(q); await saveDiff(q, empty, { state: stateOfMock() as any, merchants: M.MOCK_MERCHANTS }); });
  const back = await db.tx((q) => loadAll(q));
  const mock = stateOfMock();
  const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, canon(v[k])])) : v;
  const cs = (x: any) => JSON.stringify(canon(x));
  const same = (a: any[], b: any[]) => JSON.stringify(a.map(cs).sort()) === JSON.stringify(b.map(cs).sort());
  check('round trip: items, orders, receipts, reversals, remittances, users, sales all come back identical',
    same(back.state.items, mock.items) && same(back.state.orders, mock.orders) && same(back.state.receipts, mock.receipts) && same(back.state.reversals, mock.reversals) && same(back.state.remittances, mock.remittances) && same(back.state.users, mock.users) && same(back.state.packageSales, mock.packageSales));
  check('round trip: costing, merchants and the PO counter', cs(back.state.costing) === cs(mock.costing) && back.merchants.length === M.MOCK_MERCHANTS.length && back.state.poSeq === M.MOCK_PO_SEQ);
  const zero = await db.tx(async (q) => { const l = await loadAll(q); return saveDiff(q, l, l); });
  check('saving an unchanged state writes nothing', zero === 0);

  // ---- who sees what
  const admin = await dataFor(db, A('usr-admin')) as any;
  const m1 = await dataFor(db, A('usr-m1')) as any;
  const c1 = await dataFor(db, A('usr-c1')) as any;
  const cash2 = await dataFor(db, A('usr-cashier2')) as any;
  const clerk = await dataFor(db, A('usr-clerk')) as any;
  check('admin sees everything', admin.ok && admin.data.state.orders.length === mock.orders.length && admin.data.state.costing.settings.markupPct === mock.costing.settings.markupPct);
  check('nobody receives a password or a sign-in id', [admin, m1, c1, cash2, clerk].every((r) => !JSON.stringify(r).includes('"password"') && !JSON.stringify(r).includes('"authId"')));
  check('merchant: only own items, orders, receipts, remittances', m1.data.state.items.every((i: any) => i.merchantId === 'mrc-1') && m1.data.state.orders.length > 0 && m1.data.state.orders.every((o: any) => o.merchantId === 'mrc-1') && m1.data.state.receipts.every((r: any) => r.merchantId === 'mrc-1') && m1.data.state.remittances.every((r: any) => r.merchantId === 'mrc-1'));
  check('merchant: no mark-up, no costing log, no other users, no reseller sales', m1.data.state.costing.settings.markupPct === 0 && m1.data.state.costing.log.length === 0 && m1.data.state.users.length === 1 && m1.data.state.packageSales.length === 0);
  check('reseller: no mark-up, no payouts, no receipts, item cost hidden', c1.data.state.costing.settings.markupPct === 0 && c1.data.state.remittances.length === 0 && c1.data.state.receipts.length === 0 && c1.data.state.items.every((i: any) => i.unitCost === 0));
  const others = c1.data.state.orders.filter((o: any) => o.createdBy !== 'usr-c1' && o.buyerId !== 'usr-c1' && !(o.tiers ?? []).some((t: any) => t.userId === 'usr-c1'));
  check('reseller: other people\'s orders are only anonymous stock holds', others.length > 0 && others.every((o: any) => o.customerName === null && o.contactNo === '' && o.lines.every((l: any) => l.unitPrice === 0 && l.total === 0) && ['pending', 'packed', 'shipped'].includes(o.status)));
  check('reseller: sees own downline order for tier income, with only own tier line', c1.data.state.orders.some((o: any) => (o.tiers ?? []).some((t: any) => t.userId === 'usr-c1') && o.tiers.every((t: any) => t.userId === 'usr-c1')));
  check('reseller: people shown by name only (no email), linked chain only', c1.data.state.users.length >= 2 && c1.data.state.users.filter((u: any) => u.id !== 'usr-c1').every((u: any) => !u.email && !u.username) && !c1.data.state.users.some((u: any) => u.role === 'admin'));
  check('Central cashier: own branch orders in full, Sheung Wan ones only as holds', cash2.data.state.orders.filter((o: any) => (o.branch ?? 'shueng-wan') !== 'central').every((o: any) => o.customerName === null) && cash2.data.state.orders.some((o: any) => o.branch === 'central'));
  check('clerk: no payouts, no sales, no mark-up', clerk.data.state.remittances.length === 0 && clerk.data.state.packageSales.length === 0 && clerk.data.state.costing.settings.markupPct === 0);
  const unknown = await dataFor(db, { authId: 'auth-stranger' }) as any;
  check('a sign-in with no account gets nothing', !unknown.ok && unknown.status === 403);

  // ---- acting
  const none = await act(db, deps, null, 'markPacked', { orderId: 'x' }, 'https://x') as any;
  check('not signed in: refused', !none.ok && none.status === 401);
  const weird = await act(db, deps, A('usr-admin'), 'dropEverything', {}, 'https://x') as any;
  check('unknown action refused', !weird.ok && weird.status === 400);
  const merchantApproves = await act(db, deps, A('usr-m1'), 'approveCostingRow', { rowId: back.state.costing.rows[0].id }, 'https://x') as any;
  check('merchant cannot approve costing (rule enforced on the server)', !merchantApproves.ok && merchantApproves.status === 422);
  const pend = back.state.orders.find((o) => o.status === 'pending' && (o.branch ?? 'shueng-wan') === 'central')
    ?? back.state.orders.find((o) => o.status === 'packed' && o.branch === 'central');
  const swCashierOnCentral = pend ? await act(db, deps, A('usr-cashier'), 'markPacked', { orderId: pend.id, actor: { id: 'usr-admin', role: 'admin' } }, 'https://x') as any : null;
  check('Sheung Wan cashier cannot touch a Central order, even if the request claims to be admin', !!pend && !swCashierOnCentral.ok);
  const before = await db.tx((q) => loadAll(q));
  const toPack = before.state.orders.find((o) => o.status === 'pending' && (o.branch ?? 'shueng-wan') === 'shueng-wan' && !o.applicant);
  const packed = toPack ? await act(db, deps, A('usr-cashier'), 'markPacked', { orderId: toPack.id }, 'https://x') as any : null;
  const after = await db.tx((q) => loadAll(q));
  check('own-branch cashier packs it; reply carries only their scoped data', !!packed?.ok && after.state.orders.find((o) => o.id === toPack!.id)!.status === 'packed' && packed.me.id === 'usr-cashier');
  const changed = after.state.orders.filter((o) => JSON.stringify(o) !== JSON.stringify(before.state.orders.find((x) => x.id === o.id))).length;
  check('one action changes one order record', changed === 1);

  // ---- landing page application -> cashier delivers -> invite email, no password stored
  const cat = await publicCatalog(db);
  const pkg = cat.state.items.find((i) => i.package)!;
  check('public catalog: packages and anonymous holds only', cat.state.items.every((i) => i.package) && cat.state.orders.every((o) => o.customerName === null) && cat.state.users.length === 0 && cat.state.costing.settings.markupPct === 0);
  const app = await act(db, deps, null, 'applyForReseller', { input: { name: 'Maria Santos', email: 'maria@example.com', mobile: '+852 9123 4567', branch: 'central', itemId: pkg.id, refCode: '' } }, 'https://x') as any;
  check('landing page application is saved without signing in', app.ok && app.value.applicant.email === 'maria@example.com');
  const bogus = await act(db, deps, null, 'applyForReseller', { input: { name: 'x', email: 'bad', mobile: '1', branch: 'central', itemId: pkg.id } }, 'https://x') as any;
  check('bad application refused with the rule\'s message', !bogus.ok && bogus.status === 422);
  const packedApp = await act(db, deps, A('usr-cashier2'), 'markPacked', { orderId: app.value.id }, 'https://x') as any;
  const delivered = await act(db, deps, A('usr-cashier2'), 'markDelivered', { orderId: app.value.id, paymentMethod: 'Cash' }, 'https://shop.example') as any;
  check('Central cashier delivers it: account created and invite email requested', packedApp.ok && delivered.ok && invited.length === 1 && invited[0].email === 'maria@example.com', JSON.stringify(delivered).slice(0, 200));
  const raw = await pg.query<{ data: any }>("select data from public.app_records where kind = 'user' and data->>'email' = 'maria@example.com'");
  check('new reseller is linked to the sign-in id and has no stored password', raw.rows.length === 1 && raw.rows[0].data.authId === 'auth-new-1' && !('password' in raw.rows[0].data) && raw.rows[0].data.role === 'customer');
  const dump = JSON.stringify((await pg.query("select data from public.app_records")).rows);
  check('no temporary password anywhere in the database', !/Sdsi-/.test(dump) && !/Temporary password/.test(dump));
  const noInvite = await act(db, { ...deps, invite: async () => { throw new Error('smtp down'); } }, A('usr-admin'), 'addUser', { name: 'Ben Two', role: 'cashier', email: 'ben2@example.com', branchId: 'central' }, 'https://x') as any;
  check('if the email service is down the account is still made and the admin is warned', noInvite.ok && noInvite.warnings.length === 1 && /resend/i.test(noInvite.warnings[0]));

  // ---- admin accounts
  const asCashier = await act(db, deps, A('usr-cashier'), 'addUser', { name: 'Evil', role: 'admin', email: 'e@x.com' }, 'https://x') as any;
  check('only the admin can add accounts', !asCashier.ok && asCashier.status === 403);
  const addM = await act(db, deps, A('usr-admin'), 'addMerchant', { name: 'New Merchant Co' }, 'https://x') as any;
  const addMU = await act(db, deps, A('usr-admin'), 'addUser', { name: 'Nina Merchant', role: 'merchant', email: 'nina@example.com', merchantId: addM.value.id }, 'https://x') as any;
  check('admin adds a merchant and its login', addM.ok && addMU.ok && addMU.value.merchantId === addM.value.id && !('authId' in addMU.value));
  const dup = await act(db, deps, A('usr-admin'), 'addUser', { name: 'Nina Again', role: 'merchant', email: 'NINA@example.com', merchantId: addM.value.id }, 'https://x') as any;
  check('same email cannot be added twice', !dup.ok);

  // ---- first admin bootstrap on an empty database
  const fresh = await newDb();
  await fresh.pg.exec("insert into public.profiles values ('11111111-1111-1111-1111-111111111111', 'Kit', 'admin', true), ('22222222-2222-2222-2222-222222222222', 'Sneaky', 'cashier', true)");
  const sneaky = await dataFor(fresh.db, { authId: '22222222-2222-2222-2222-222222222222' }) as any;
  const kit = await dataFor(fresh.db, { authId: '11111111-1111-1111-1111-111111111111', email: 'kit@x.com' }) as any;
  check('empty database: only the admin from 0002 can get in, and becomes the first user', !sneaky.ok && kit.ok && kit.me.role === 'admin' && kit.data.state.users.length === 1);
  const second = await dataFor(fresh.db, { authId: '22222222-2222-2222-2222-222222222222' }) as any;
  check('once an admin exists, others are refused until invited', !second.ok);
  console.log(fails ? fails + ' FAILED' : 'ALL SERVER CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})();
