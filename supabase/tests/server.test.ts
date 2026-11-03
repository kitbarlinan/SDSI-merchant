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
  check('if the email service is down the account is still made and the admin is warned', noInvite.ok && noInvite.warnings.length === 1 && /invitation again/i.test(noInvite.warnings[0]));

  // ---- admin accounts
  const asCashier = await act(db, deps, A('usr-cashier'), 'addUser', { name: 'Evil', role: 'admin', email: 'e@x.com' }, 'https://x') as any;
  check('only the admin can add accounts', !asCashier.ok && asCashier.status === 403);
  const addM = await act(db, deps, A('usr-admin'), 'addMerchant', { name: 'New Merchant Co' }, 'https://x') as any;
  const addMU = await act(db, deps, A('usr-admin'), 'addUser', { name: 'Nina Merchant', role: 'merchant', email: 'nina@example.com', merchantId: addM.value.id }, 'https://x') as any;
  check('admin adds a merchant and its login', addM.ok && addMU.ok && addMU.value.merchantId === addM.value.id && !('authId' in addMU.value));
  const dup = await act(db, deps, A('usr-admin'), 'addUser', { name: 'Nina Again', role: 'merchant', email: 'NINA@example.com', merchantId: addM.value.id }, 'https://x') as any;
  check('same email cannot be added twice', !dup.ok);


  // ---- merchant profile, edit, delete
  const prof = { name: 'Bank Test Co', ownerName: 'Juan Dela Cruz', bankName: 'BDO', bankAccountName: 'Bank Test Co', bankAccountNo: '0012 3456 7890' };
  const mp = await act(db, deps, A('usr-admin'), 'addMerchant', prof, 'https://x') as any;
  check('admin adds a merchant with owner and bank details', mp.ok && mp.value.profile.ownerName === 'Juan Dela Cruz' && mp.value.profile.bankAccountNo === '0012 3456 7890');
  const partial = await act(db, deps, A('usr-admin'), 'addMerchant', { name: 'Half Bank Co', bankName: 'BPI' }, 'https://x') as any;
  check('half-filled bank details are refused', !partial.ok && /all three/i.test(partial.error));
  const badNo = await act(db, deps, A('usr-admin'), 'addMerchant', { ...prof, name: 'Bad No Co', bankAccountNo: 'abc' }, 'https://x') as any;
  check('a non-numeric account number is refused', !badNo.ok);
  const noProf = await act(db, deps, A('usr-admin'), 'addMerchant', { name: 'No Bank Yet' }, 'https://x') as any;
  check('details can be left empty and added later', noProf.ok && !noProf.value.profile);
  const upd = await act(db, deps, A('usr-admin'), 'updateMerchant', { id: noProf.value.id, ...prof, name: 'No Bank Yet' }, 'https://x') as any;
  check('edit adds the bank details later', upd.ok && upd.value.profile.bankName === 'BDO');
  const clear = await act(db, deps, A('usr-admin'), 'updateMerchant', { id: noProf.value.id, name: 'Renamed Co' }, 'https://x') as any;
  check('edit can rename and clear the details', clear.ok && clear.value.name === 'Renamed Co' && !clear.value.profile);
  const dupName = await act(db, deps, A('usr-admin'), 'updateMerchant', { id: noProf.value.id, name: 'green leaf naturals' }, 'https://x') as any;
  check('rename to an existing merchant is refused', !dupName.ok);
  const cashierEdit = await act(db, deps, A('usr-cashier'), 'updateMerchant', { id: mp.value.id, name: 'Hacked' }, 'https://x') as any;
  check('only the admin edits merchants', !cashierEdit.ok && cashierEdit.status === 403);
  const delUsed = await act(db, deps, A('usr-admin'), 'deleteMerchant', { id: 'mrc-1' }, 'https://x') as any;
  check('a merchant with products and orders cannot be deleted', !delUsed.ok && /cannot be deleted/.test(delUsed.error));
  const delOk = await act(db, deps, A('usr-admin'), 'deleteMerchant', { id: noProf.value.id }, 'https://x') as any;
  const left = await db.tx((q) => loadAll(q));
  check('an empty merchant can be deleted', delOk.ok && !left.merchants.some((m: any) => m.id === noProf.value.id));
  const seeA = await dataFor(db, A('usr-admin')) as any, seeC = await dataFor(db, A('usr-cashier')) as any, seeM = await dataFor(db, A('usr-m1')) as any, seeK = await dataFor(db, A('usr-clerk')) as any, seeR = await dataFor(db, A('usr-c1')) as any;
  const bankOf = (r: any) => r.data.merchants.find((m: any) => m.id === mp.value.id)?.profile;
  check('bank details: admin and cashier see them; clerk, reseller and other merchants do not', !!bankOf(seeA) && !!bankOf(seeC) && !bankOf(seeK) && !bankOf(seeR) && !bankOf(seeM));
  const own = await db.tx(async (q) => { const l = await loadAll(q); await saveDiff(q, l, { ...l, merchants: l.merchants.map((m: any) => m.id === 'mrc-1' ? { ...m, profile: { ownerName: 'Liza', bankName: 'BPI', bankAccountName: 'Green Leaf', bankAccountNo: '123456' } } : m) }); });
  const seeM2 = await dataFor(db, A('usr-m1')) as any;
  check('a merchant sees their own bank details', !!seeM2.data.merchants.find((m: any) => m.id === 'mrc-1').profile && !seeM2.data.merchants.find((m: any) => m.id === 'mrc-2').profile);
  const pub = await publicCatalog(db);
  check('the public page gets no merchant details at all', pub.merchants.length === 0 && !JSON.stringify(pub).includes('0012 3456'));

  // ---- master list and bundle SKUs on the server
  const addP = await act(db, deps, A('usr-clerk'), 'importProducts', { merchantId: 'mrc-1', rows: [{ row: 2, code: 'GL-1', name: 'Green Leaf Powder', srp: '₱500', expiry: '2027-01-31' }, { row: 3, code: 'GL-2', name: 'Green Leaf Tea', srp: 250, expiry: '' }] }, 'https://x') as any;
  check('the inventory clerk imports products', addP.ok && addP.value.created === 2, addP);
  const cashP = await act(db, deps, A('usr-cashier'), 'addProduct', { input: { merchantId: 'mrc-1', code: 'NOPE', name: 'Nope', srp: 5 } }, 'https://x') as any;
  check('a cashier cannot change the master list', !cashP.ok);
  const bundle = await act(db, deps, A('usr-admin'), 'importSkus', { rows: [{ row: 2, sku: 'GL-BUNDLE', bundleName: 'Green pack', product: 'GL-1', qty: 2, free: '' }, { row: 3, sku: 'GL-BUNDLE', bundleName: '', product: 'Green Leaf Tea', qty: 1, free: 1 }] }, 'https://x') as any;
  check('admin imports a bundle SKU from the master list', bundle.ok && bundle.value.created === 1, bundle);
  const clerkSku = await act(db, deps, A('usr-clerk'), 'importSkus', { rows: [{ row: 2, sku: 'GL-X', bundleName: 'x y', product: 'GL-1', qty: 1 }] }, 'https://x') as any;
  check('the clerk cannot create SKUs', !clerkSku.ok);
  const afterP = await db.tx((q) => loadAll(q));
  const gl = afterP.state.items.find((i: any) => i.sku === 'GL-BUNDLE');
  check('products and the bundle come back from the database', afterP.state.products.length === 2 && gl && gl.unitPrice === 1250 && gl.parts.length === 2 && gl.expiryDate === '2027-01-31', gl);
  const adminP = await dataFor(db, A('usr-admin')) as any, m1P = await dataFor(db, A('usr-m1')) as any, m2P = await dataFor(db, A('usr-m2')) as any, c1P = await dataFor(db, A('usr-c1')) as any, cashP2 = await dataFor(db, A('usr-cashier')) as any;
  check('master list is scoped: admin and cashier all, merchant own only, resellers only stock counts', adminP.data.state.products.length === 2 && cashP2.data.state.products.length === 2 && m1P.data.state.products.length === 2 && m2P.data.state.products.length === 0 && c1P.data.state.products.every((p: any) => p.name === '' && p.srp === 0));
  await pg.exec("update public.app_records set data = jsonb_set(data, '{category}', '\"Beauty & Skin\"') where kind = 'item' and id = 'itm-001'");
  await pg.exec("update public.app_records set data = jsonb_set(data, '{category}', '\"Herbal\"') where kind = 'item' and id = 'itm-002'");
  const legacy = await db.tx((q) => loadAll(q));
  check('older five-category data loads as the two new categories', legacy.state.items.find((i: any) => i.id === 'itm-001')!.category === 'Beauty Products' && legacy.state.items.find((i: any) => i.id === 'itm-002')!.category === 'Food Supplements');

  const smtpFail = await act(db, { ...deps, invite: async () => { throw new Error('Error sending invite email'); } }, A('usr-admin'), 'addUser', { name: 'Smtp Test', role: 'cashier', email: 'smtp@example.com', branchId: 'central' }, 'https://x') as any;
  check('a failed invitation is reported with the reason and what to check', smtpFail.ok && smtpFail.warnings?.length === 1 && /Error sending invite email/.test(smtpFail.warnings[0]) && /SMTP/.test(smtpFail.warnings[0]) && /Send invitation again/.test(smtpFail.warnings[0]), smtpFail.warnings);
  const rateFail = await act(db, { ...deps, invite: async () => { throw new Error('email rate limit exceeded'); } }, A('usr-admin'), 'addUser', { name: 'Rate Test', role: 'cashier', email: 'rate@example.com', branchId: 'central' }, 'https://x') as any;
  check('the hourly email limit is explained', /per hour/.test(rateFail.warnings?.[0] ?? ''), rateFail.warnings);
  // invitation link without email (when SMTP is the problem)
  const linkDeps = { ...deps, invite: async () => { throw new Error('Error sending invite email'); }, inviteLink: async (email: string) => ({ authId: 'auth-link-1', link: `https://proj.supabase.co/auth/v1/verify?token=abc&email=${email}` }) };
  const linkByCashier = await act(db, linkDeps, A('usr-cashier'), 'inviteLink', { userId: smtpFail.value.id }, 'https://x') as any;
  check('only the admin can make an invite link', !linkByCashier.ok && linkByCashier.status === 403);
  const linkOk = await act(db, linkDeps, A('usr-admin'), 'inviteLink', { userId: smtpFail.value.id }, 'https://x') as any;
  const afterLink = await db.tx((q) => loadAll(q));
  check('invite link is made without any email and the person is marked as invited', linkOk.ok && /verify\?token=abc/.test(linkOk.value) && afterLink.state.users.find((u: any) => u.id === smtpFail.value.id).authId === 'auth-link-1', linkOk);
  const linkBroken = await act(db, { ...deps, inviteLink: async () => { throw new Error('boom'); } }, A('usr-admin'), 'inviteLink', { userId: smtpFail.value.id }, 'https://x') as any;
  check('a failing link request is reported, not hidden', !linkBroken.ok && /boom/.test(linkBroken.error));
  // deleting a login that never did anything (the "Testing" cashier)
  const smtpUserId = smtpFail.value.id as string;
  const delByCashier = await act(db, deps, A('usr-cashier'), 'deleteUser', { userId: smtpUserId }, 'https://x') as any;
  check('only the admin can delete a login', !delByCashier.ok && delByCashier.status === 403);
  const delSelf = await act(db, deps, A('usr-admin'), 'deleteUser', { userId: 'usr-admin' }, 'https://x') as any;
  check('the admin cannot delete themselves', !delSelf.ok && /own account/.test(delSelf.error));
  const delBusy = await act(db, deps, A('usr-admin'), 'deleteUser', { userId: 'usr-cashier2' }, 'https://x') as any;
  check('a login with activity in the records stays', !delBusy.ok && /stays/.test(delBusy.error), delBusy);
  const delUserOk = await act(db, deps, A('usr-admin'), 'deleteUser', { userId: smtpUserId }, 'https://x') as any;
  const afterUserDel = await db.tx((q) => loadAll(q));
  check('an unused login whose invitation failed can be deleted', delUserOk.ok && !afterUserDel.state.users.some((u: any) => u.id === smtpUserId), delUserOk);
  const reinvite = await act(db, deps, A('usr-admin'), 'addUser', { name: 'Smtp Test', role: 'cashier', email: 'smtp@example.com', branchId: 'central' }, 'https://x') as any;
  check('the same email can be invited again after deleting', reinvite.ok, reinvite);
  // category per product
  const catSet = await act(db, deps, A('usr-clerk'), 'updateProduct', { id: 'prd-0001', patch: { category: 'Beauty Products' } }, 'https://x') as any;
  const catRow = await db.tx((q) => loadAll(q));
  check('category per product is saved', catSet.ok && catRow.state.products.find((p: any) => p.id === 'prd-0001')!.category === 'Beauty Products', catSet);
  const catClear = await act(db, deps, A('usr-clerk'), 'updateProduct', { id: 'prd-0001', patch: { category: null } }, 'https://x') as any;
  check('category can be cleared again', catClear.ok && catClear.value.category === undefined, catClear);
  // stock per product through the server
  const sIn = await act(db, deps, A('usr-clerk'), 'receiveStock', { input: { merchantId: 'mrc-1', receivedDate: '2026-10-29', note: '', lines: [{ productId: 'prd-0001', quantity: 9 }], branch: 'central' } }, 'https://x') as any;
  const afterS = await db.tx((q) => loadAll(q));
  check('stock in by product is saved per branch', sIn.ok && afterS.state.products.find((p: any) => p.id === 'prd-0001')!.branchStock!.central === 9 && afterS.state.products.find((p: any) => p.id === 'prd-0001')!.stock === 9, sIn);
  const cust = await dataFor(db, A('usr-c1')) as any;
  check('a reseller gets product stock counts but not names or SRP', cust.data.state.products.length === 2 && cust.data.state.products.every((p: any) => p.name === '' && p.srp === 0) && cust.data.state.products.find((p: any) => p.id === 'prd-0001').stock === 9);
  await pg.exec("update public.app_records set data = data - 'stock' - 'branchStock' - 'reorderLevel' where kind = 'product' and id = 'prd-0002'");
  const old = await db.tx((q) => loadAll(q));
  check('products saved before per-product stock load with zero stock', old.state.products.find((p: any) => p.id === 'prd-0002')!.stock === 0 && old.state.products.find((p: any) => p.id === 'prd-0002')!.reorderLevel === 10);

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
