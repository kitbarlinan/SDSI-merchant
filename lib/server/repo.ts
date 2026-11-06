/**
 * Loads the whole app state from `app_records` and saves only what changed.
 * Server only. Runs inside a transaction that holds an advisory lock, so two people acting at the
 * same moment are handled one after the other and never overwrite each other.
 */
import { DEFAULT_COSTING_SETTINGS, normalizeSettings } from '../costing';
import type { AppState } from '../engine';
import { normalizeCategory, type Merchant } from '../types';
import { normalizeProduct } from '../stock';
import type { Db } from './db';

type Rec = Record<string, unknown> & { id: string };

/** One array of AppState per kind, newest first where the app prepends. */
const LISTS = {
  item: { key: 'items', order: 'asc' },
  product: { key: 'products', order: 'asc' },
  order: { key: 'orders', order: 'desc' },
  receipt: { key: 'receipts', order: 'desc' },
  reversal: { key: 'reversals', order: 'desc' },
  remittance: { key: 'remittances', order: 'desc' },
  packageSale: { key: 'packageSales', order: 'desc' },
  user: { key: 'users', order: 'asc' },
  outbox: { key: 'outbox', order: 'desc' },
} as const;
type ListKind = keyof typeof LISTS;

export const emptyState = (): AppState => ({
  items: [],
  products: [],
  orders: [],
  receipts: [],
  reversals: [],
  remittances: [],
  packageSales: [],
  users: [],
  outbox: [],
  costing: { settings: { ...DEFAULT_COSTING_SETTINGS }, rows: [], log: [], programMerchantIds: [] },
  poSeq: 0,
});

export interface Loaded {
  state: AppState;
  merchants: Merchant[];
}

const byId = (direction: 'asc' | 'desc') => (a: Rec, b: Rec) =>
  direction === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);

/** Serialises writers. The number is arbitrary but fixed for this app. */
export const lockWriters = (q: Db) => q.query('select pg_advisory_xact_lock(7701)');

export async function loadAll(q: Db): Promise<Loaded> {
  const { rows } = await q.query<{ kind: string; id: string; data: unknown }>('select kind, id, data from public.app_records');
  const state = emptyState();
  const merchants: Merchant[] = [];
  const buckets = new Map<string, Rec[]>();
  for (const row of rows) {
    const data = row.data as Rec;
    if (row.kind === 'merchant') merchants.push(data as unknown as Merchant);
    else if (row.kind === 'costing') { const c = data as unknown as AppState['costing']; state.costing = { ...c, settings: normalizeSettings(c.settings as unknown as Record<string, unknown>) }; }
    else if (row.kind === 'meta' && row.id === 'poSeq') state.poSeq = Number((data as { value?: number }).value ?? 0);
    else if (row.kind in LISTS) buckets.set(row.kind, [...(buckets.get(row.kind) ?? []), data]);
  }
  for (const kind of Object.keys(LISTS) as ListKind[]) {
    const { key, order } = LISTS[kind];
    (state as unknown as Record<string, unknown>)[key] = (buckets.get(kind) ?? []).sort(byId(order));
  }
  state.products = state.products.map(normalizeProduct);
  // Data saved before there were two categories.
  state.items = state.items.map((item) => ({ ...item, category: normalizeCategory(item.category) }));
  state.orders = state.orders.map((order) => ({ ...order, lines: order.lines.map((line) => ({ ...line, category: normalizeCategory(line.category) })) }));
  merchants.sort((a, b) => a.id.localeCompare(b.id));
  return { state, merchants };
}

/** The records of a state, by kind and id, as comparable strings. */
function flatten(state: AppState, merchants: Merchant[]): Map<string, { kind: string; id: string; json: string }> {
  const map = new Map<string, { kind: string; id: string; json: string }>();
  const put = (kind: string, id: string, data: unknown) => map.set(`${kind}|${id}`, { kind, id, json: JSON.stringify(data) });
  for (const kind of Object.keys(LISTS) as ListKind[]) {
    for (const record of (state as unknown as Record<string, Rec[]>)[LISTS[kind].key]) put(kind, record.id, record);
  }
  for (const merchant of merchants) put('merchant', merchant.id, merchant);
  put('costing', 'main', state.costing);
  put('meta', 'poSeq', { value: state.poSeq });
  return map;
}

/** Writes only the records that were added, changed or removed. Returns how many. */
export async function saveDiff(q: Db, before: Loaded, after: Loaded): Promise<number> {
  const a = flatten(before.state, before.merchants);
  const b = flatten(after.state, after.merchants);
  let writes = 0;
  for (const [key, next] of b) {
    if (a.get(key)?.json === next.json) continue;
    await q.query(
      `insert into public.app_records (kind, id, data) values ($1, $2, $3::jsonb)
       on conflict (kind, id) do update set data = excluded.data, updated_at = now()`,
      [next.kind, next.id, next.json],
    );
    writes += 1;
  }
  for (const [key, old] of a) {
    if (b.has(key)) continue;
    await q.query('delete from public.app_records where kind = $1 and id = $2', [old.kind, old.id]);
    writes += 1;
  }
  return writes;
}
