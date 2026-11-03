/**
 * The server's brain: who is acting, run the rule, save what changed, send back only their part.
 * Takes its database and its sign-in/invite helpers as arguments so it can be tested without Supabase.
 */
import type { Actor, AppState } from '../engine';
import type { Merchant, MerchantProfile, Role, User } from '../types';
import { ACTIONS, PUBLIC_ACTIONS, actorOf } from './actions';
import type { TxDb } from './db';
import { loadAll, lockWriters, saveDiff, type Loaded } from './repo';
import { scopeFor, redactOrder, stockOnly, type Scoped } from './scope';

export interface Deps {
  /** Supabase: send the invite email and return the new auth user's id. */
  invite(email: string, name: string, redirectTo: string): Promise<string>;
  /** Hong Kong and the Philippines are both UTC+8. YYYY-MM-DDTHH:mm */
  now(): string;
}

export interface AuthedUser {
  authId: string;
  email?: string;
}

export type Reply =
  | { ok: true; value?: unknown; me?: User; data?: Scoped; warnings?: string[] }
  | { ok: false; error: string; status: number };

export const clockHk = (): string => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16);

const bad = (status: number, error: string): Reply => ({ ok: false, error, status });

/** Removes anything that must never be stored: temporary passwords and the text of invite emails. */
function clean(state: AppState, before: AppState): AppState {
  const knownMail = new Set(before.outbox.map((mail) => mail.id));
  return {
    ...state,
    users: state.users.map((user) => {
      const { password: _password, ...rest } = user;
      void _password;
      return { ...rest, username: undefined, mustChange: undefined };
    }),
    outbox: state.outbox.map((mail) =>
      knownMail.has(mail.id) ? mail : { ...mail, body: 'Sign-in invitation sent by the sign-in service.' },
    ),
  };
}

async function findUser(db: TxDb, auth: AuthedUser): Promise<User | null> {
  return db.tx(async (q) => {
    await lockWriters(q);
    const loaded = await loadAll(q);
    const found = loaded.state.users.find((user) => user.authId === auth.authId);
    if (found) return found;
    // The very first sign-in: the admin made by 0002 (a row in profiles) becomes the first user.
    if (loaded.state.users.length > 0) return null;
    const profile = await q.query<{ name: string; role: string }>(
      'select name, role from public.profiles where id = $1 and active is not false',
      [auth.authId],
    );
    const row = profile.rows[0];
    if (!row || row.role !== 'admin') return null;
    const admin: User = { id: 'usr-admin', name: row.name, role: 'admin', email: auth.email, authId: auth.authId };
    const next: Loaded = { ...loaded, state: { ...loaded.state, users: [admin] } };
    await saveDiff(q, loaded, next);
    return admin;
  });
}

type Staffing = { name?: string; role?: string; email?: string; branchId?: string; merchantId?: string };
const STAFF_ROLES: Role[] = ['cashier', 'clerk', 'merchant', 'admin'];

export async function dataFor(db: TxDb, auth: AuthedUser): Promise<Reply> {
  const me = await findUser(db, auth);
  if (!me) return bad(403, 'This sign-in has no account in the app yet. Ask the admin to invite you.');
  const loaded = await db.tx(async (q) => loadAll(q));
  return { ok: true, me: stripAuth(me), data: scopeFor(me, loaded.state, loaded.merchants) };
}

const stripAuth = (user: User): User => {
  const { authId: _authId, ...rest } = user;
  void _authId;
  return rest;
};

/** Everything a visitor who is not signed in may see: the packages and what is on the shelves. */
export async function publicCatalog(db: TxDb): Promise<Scoped> {
  const { state, merchants } = await db.tx(async (q) => loadAll(q));
  return {
    merchants: [],
    state: {
      ...state,
      items: state.items.filter((item) => item.package && !item.disabled).map((item) => ({ ...item, unitCost: 0 })),
      products: state.products.map(stockOnly),
      orders: state.orders.filter((order) => ['pending', 'packed', 'shipped'].includes(order.status)).map(redactOrder),
      receipts: [],
      reversals: [],
      remittances: [],
      packageSales: [],
      users: [],
      outbox: [],
      poSeq: 0,
      costing: { ...state.costing, settings: { ...state.costing.settings, markupPct: 0 }, log: [], rows: state.costing.rows },
    },
  };
  void merchants;
}

export async function act(db: TxDb, deps: Deps, auth: AuthedUser | null, name: string, args: Record<string, unknown>, origin: string): Promise<Reply> {
  const publicHandler = PUBLIC_ACTIONS[name];
  if (publicHandler) return runPublic(db, deps, publicHandler, args);
  if (!auth) return bad(401, 'Please sign in.');

  const me = await findUser(db, auth);
  if (!me) return bad(403, 'This sign-in has no account in the app yet.');
  const actor: Actor = actorOf(me);

  const result = await db.tx(async (q) => {
    await lockWriters(q);
    const before = await loadAll(q);

    // Account management belongs to the admin and is done here, not in the shared rules.
    if (['addMerchant', 'updateMerchant', 'deleteMerchant', 'addUser', 'resendInvite', 'deleteUser'].includes(name)) {
      if (actor.role !== 'admin') return { error: 'Only the admin can do this.' as const, status: 403 };
      return adminAction(q, before, name, args, me.id);
    }
    if (name === 'finishSetup') return { done: true as const, after: before, invites: [] as User[], value: true };

    const handler = ACTIONS[name];
    if (!handler) return { error: 'Unknown action.' as const, status: 400 };
    let outcome;
    try {
      outcome = handler(before.state, actor, args, deps.now());
    } catch {
      return { error: 'That request could not be read.' as const, status: 400 };
    }
    if (!outcome.ok) return { error: outcome.error, status: 422 };
    const afterState = clean(outcome.state, before.state);
    const after: Loaded = { merchants: before.merchants, state: afterState };
    await saveDiff(q, before, after);
    const known = new Set(before.state.users.map((user) => user.id));
    const invites = afterState.users.filter((user) => !known.has(user.id) && user.email && user.role === 'customer');
    return { done: true as const, after, invites, value: outcome.value };
  });

  if ('error' in result) return bad(result.status, result.error);
  const warnings = await sendInvites(db, deps, result.invites, origin);
  const loaded = await db.tx(async (q) => loadAll(q));
  const fresh = loaded.state.users.find((user) => user.id === me.id) ?? me;
  return { ok: true, value: result.value, me: stripAuth(fresh), data: scopeFor(fresh, loaded.state, loaded.merchants), warnings };
}

async function runPublic(
  db: TxDb,
  deps: Deps,
  handler: (state: AppState, a: Record<string, unknown>, now: string) => ReturnType<(typeof PUBLIC_ACTIONS)[string]>,
  args: Record<string, unknown>,
): Promise<Reply> {
  const result = await db.tx(async (q) => {
    await lockWriters(q);
    const before = await loadAll(q);
    let outcome;
    try {
      outcome = handler(before.state, args, deps.now());
    } catch {
      return { error: 'That request could not be read.', status: 400 };
    }
    if (!outcome.ok) return { error: outcome.error, status: 422 };
    await saveDiff(q, before, { merchants: before.merchants, state: clean(outcome.state, before.state) });
    return { value: outcome.value };
  });
  return 'error' in result ? bad(result.status ?? 400, result.error ?? 'Failed.') : { ok: true, value: result.value };
}

/** The owner and bank details typed by the admin. Nothing here is required, but what is typed must make sense. */
function readProfile(args: Record<string, unknown>): { profile?: MerchantProfile; error?: string } {
  const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const profile: MerchantProfile = {
    ownerName: text(args.ownerName),
    bankName: text(args.bankName),
    bankAccountName: text(args.bankAccountName),
    bankAccountNo: text(args.bankAccountNo),
  };
  if (Object.values(profile).some((value) => value.length > 80)) return { error: 'Each detail is limited to 80 characters.' };
  if (profile.bankAccountNo && !/^[0-9][0-9 -]{4,28}[0-9]$/.test(profile.bankAccountNo)) return { error: 'The account number should be digits only (spaces and dashes are fine), 6 to 30 characters.' };
  const anyBank = profile.bankName || profile.bankAccountName || profile.bankAccountNo;
  if (anyBank && !(profile.bankName && profile.bankAccountName && profile.bankAccountNo)) return { error: 'Fill in all three bank details (bank, account name, account number), or leave them all empty.' };
  const empty = Object.values(profile).every((value) => value === '');
  return empty ? {} : { profile };
}

async function adminAction(q: Parameters<Parameters<TxDb['tx']>[0]>[0], before: Loaded, name: string, args: Record<string, unknown>, meId: string) {
  if (name === 'addMerchant') {
    const merchantName = String(args.name ?? '').trim();
    if (merchantName.length < 2) return { error: 'Enter the merchant name.', status: 422 };
    if (before.merchants.some((m) => m.name.toLowerCase() === merchantName.toLowerCase())) return { error: 'That merchant already exists.', status: 422 };
    const read = readProfile(args);
    if (read.error) return { error: read.error, status: 422 };
    const next = before.merchants.reduce((max, m) => Math.max(max, Number(/^mrc-(\d+)$/.exec(m.id)?.[1] ?? 0)), 0) + 1;
    const palette = ['#059669', '#e11d48', '#0284c7', '#7c3aed', '#d97706', '#0f766e'];
    const merchant: Merchant = { id: `mrc-${next}`, name: merchantName, color: String(args.color ?? palette[(next - 1) % palette.length]), ...(read.profile ? { profile: read.profile } : {}) };
    const after: Loaded = { ...before, merchants: [...before.merchants, merchant] };
    await saveDiff(q, before, after);
    return { done: true as const, after, invites: [] as User[], value: merchant };
  }
  if (name === 'updateMerchant') {
    const current = before.merchants.find((m) => m.id === args.id);
    if (!current) return { error: 'Merchant not found.', status: 404 };
    const merchantName = String(args.name ?? '').trim();
    if (merchantName.length < 2) return { error: 'Enter the merchant name.', status: 422 };
    if (before.merchants.some((m) => m.id !== current.id && m.name.toLowerCase() === merchantName.toLowerCase())) return { error: 'Another merchant already has that name.', status: 422 };
    const read = readProfile(args);
    if (read.error) return { error: read.error, status: 422 };
    const { profile: _old, ...rest } = current;
    void _old;
    const merchant: Merchant = { ...rest, name: merchantName, ...(read.profile ? { profile: read.profile } : {}) };
    const after: Loaded = { ...before, merchants: before.merchants.map((m) => (m.id === current.id ? merchant : m)) };
    await saveDiff(q, before, after);
    return { done: true as const, after, invites: [] as User[], value: merchant };
  }
  if (name === 'deleteMerchant') {
    const current = before.merchants.find((m) => m.id === args.id);
    if (!current) return { error: 'Merchant not found.', status: 404 };
    const st = before.state;
    const used: string[] = [];
    const count = (label: string, n: number) => n > 0 && used.push(`${n} ${label}`);
    count('product(s)', st.items.filter((i) => i.merchantId === current.id).length);
    count('order(s)', st.orders.filter((o) => o.merchantId === current.id).length);
    count('stock receipt(s)', st.receipts.filter((r) => r.merchantId === current.id).length);
    count('payout(s)', st.remittances.filter((r) => r.merchantId === current.id).length);
    count('login(s)', st.users.filter((u) => u.merchantId === current.id).length);
    if (used.length > 0) return { error: `${current.name} cannot be deleted because it already has ${used.join(', ')}. These records stay so the books are complete. A merchant can be deleted only while it has no products, orders, stock, payouts or logins.`, status: 422 };
    const after: Loaded = {
      merchants: before.merchants.filter((m) => m.id !== current.id),
      state: { ...st, costing: { ...st.costing, programMerchantIds: st.costing.programMerchantIds.filter((id) => id !== current.id) } },
    };
    await saveDiff(q, before, after);
    return { done: true as const, after, invites: [] as User[], value: true };
  }
  if (name === 'addUser') {
    const a = args as Staffing;
    const role = a.role as Role;
    const userName = String(a.name ?? '').trim();
    const email = String(a.email ?? '').trim().toLowerCase();
    if (!STAFF_ROLES.includes(role)) return { error: 'Choose a role: cashier, clerk, merchant or admin.', status: 422 };
    if (userName.length < 2) return { error: 'Enter the name.', status: 422 };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email. The invitation goes there.', status: 422 };
    if (before.state.users.some((user) => user.email?.toLowerCase() === email)) return { error: 'That email already has an account.', status: 422 };
    if (role === 'cashier' && !['shueng-wan', 'central'].includes(String(a.branchId))) return { error: 'Choose the cashier\'s branch.', status: 422 };
    if (role === 'merchant' && !before.merchants.some((m) => m.id === a.merchantId)) return { error: 'Choose the merchant this login belongs to.', status: 422 };
    const prefix = role === 'merchant' ? 'usr-m' : role === 'cashier' ? 'usr-cashier' : role === 'clerk' ? 'usr-clerk' : 'usr-admin';
    let id = prefix;
    for (let i = 2; before.state.users.some((user) => user.id === id); i += 1) id = `${prefix}${i}`;
    const user: User = {
      id,
      name: userName,
      role,
      email,
      ...(role === 'cashier' ? { branchId: a.branchId as User['branchId'] } : {}),
      ...(role === 'merchant' ? { merchantId: a.merchantId } : {}),
    };
    const after: Loaded = { ...before, state: { ...before.state, users: [...before.state.users, user] } };
    await saveDiff(q, before, after);
    return { done: true as const, after, invites: [user], value: stripAuth(user) };
  }
  if (name === 'deleteUser') {
    const target = before.state.users.find((user) => user.id === args.userId);
    if (!target || target.role === 'customer') return { error: 'Account not found.', status: 404 };
    if (target.id === meId) return { error: 'You cannot delete your own account.', status: 422 };
    if (target.role === 'admin' && before.state.users.filter((user) => user.role === 'admin').length < 2) return { error: 'The last admin cannot be deleted.', status: 422 };
    // Anyone who already did something in the books stays, so the history keeps its names.
    const { users: _users, ...records } = before.state;
    void _users;
    if (JSON.stringify(records).includes(`"${target.id}"`)) {
      return { error: `${target.name} already has activity in the records (orders, stock or approvals), so the account stays to keep the books complete.`, status: 422 };
    }
    const after: Loaded = { ...before, state: { ...before.state, users: before.state.users.filter((user) => user.id !== target.id) } };
    await saveDiff(q, before, after);
    return { done: true as const, after, invites: [] as User[], value: true };
  }
  // resendInvite
  const target = before.state.users.find((user) => user.id === args.userId);
  if (!target?.email) return { error: 'That account has no email.', status: 422 };
  return { done: true as const, after: before, invites: [target], value: true };
}

/** What to check for the usual reasons an invitation fails. */
export function inviteHint(reason: string): string {
  if (/rate limit|too many|exceeded/i.test(reason)) return 'Supabase limits how many emails it sends per hour (very few without your own SMTP). Wait an hour, or set up SMTP in Supabase → Authentication → Emails → SMTP Settings.';
  if (/sending|smtp|mail|confirmation|535|authentication/i.test(reason)) return 'Supabase could not send the email through your SMTP. Check Supabase → Authentication → Emails → SMTP Settings (host, port 587, the SMTP login and key, and a verified sender address).';
  if (/service_role|SUPABASE_SERVICE_ROLE_KEY|api key|jwt|invalid/i.test(reason)) return 'Check the SUPABASE_SERVICE_ROLE_KEY in Vercel (Environment Variables), then redeploy.';
  if (/redirect|url/i.test(reason)) return 'Add your site address under Supabase → Authentication → URL Configuration (Site URL and Redirect URLs).';
  return 'Check the Supabase project settings under Authentication → Emails.';
}

/** After the records are saved: ask the sign-in service to email each new account. Never blocks the action. */
async function sendInvites(db: TxDb, deps: Deps, users: User[], origin: string): Promise<string[]> {
  const warnings: string[] = [];
  for (const user of users) {
    if (!user.email) continue;
    try {
      const authId = await deps.invite(user.email, user.name, `${origin}/`);
      await db.tx(async (q) => {
        await lockWriters(q);
        const loaded = await loadAll(q);
        const next: Loaded = {
          ...loaded,
          state: { ...loaded.state, users: loaded.state.users.map((u) => (u.id === user.id ? { ...u, authId } : u)) },
        };
        await saveDiff(q, loaded, next);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      warnings.push(`Could not email ${user.email}: ${reason}. ${inviteHint(reason)} After fixing it, press "Send invitation again".`);
    }
  }
  return warnings;
}
