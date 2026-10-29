/**
 * Business rules as pure functions: (state, actor, input) -> new state or an error.
 * The React store just calls these, and they can be tested without any UI.
 *
 * NOTE: the permission checks here only protect the demo. Once this moves to Supabase the same
 * rules must be enforced on the server (row level security / server actions).
 */
import { roundMoney } from './format';
import {
  computeCosting,
  orderCharges,
  isSellable,
  snapshotLive,
  validateSkuCode,
  validatePickupPrice,
  validateSettings,
  SETTING_LABEL,
  type CostingLogEntry,
  type CostingRow,
  type CostingSettings,
  type CostingState,
} from './costing';
import { availableOf, reservedByItem } from './orders';
import {
  PAYMENT_METHODS,
  type InventoryItem,
  type Order,
  type OrderLine,
  type OrderTerms,
  type PaymentMethod,
  type ReceiptLine,
  type Role,
  type StockReceipt,
} from './types';

export interface AppState {
  items: InventoryItem[];
  orders: Order[];
  receipts: StockReceipt[];
  /** Pickup-price costing. Admin only. */
  costing: CostingState;
  /** Last PO number handed out. Only ever goes up, so a POID is never reused. */
  poSeq: number;
}

export interface Actor {
  id: string;
  role: Role;
  merchantId?: string;
}

export type Outcome<T> = { ok: true; state: AppState; value: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

/** Handles orders and the counter. */
const isStaff = (actor: Actor): boolean => actor.role === 'admin' || actor.role === 'cashier';

/** Approves received stock. */
const canApprove = (actor: Actor): boolean => actor.role === 'admin' || actor.role === 'clerk';

const dateOf = (dateTime: string): string => dateTime.slice(0, 10);

export const formatPoid = (sequence: number): string => `POID-${String(sequence).padStart(6, '0')}`;

/** Hands out the next unique POIDs and the counter value to store afterwards. */
function nextPoids(state: AppState, count: number): { ids: string[]; poSeq: number } {
  const ids = Array.from({ length: count }, (_, index) => formatPoid(state.poSeq + index + 1));
  return { ids, poSeq: state.poSeq + count };
}

const formatReceiptId = (sequence: number): string => `RCV-${String(sequence).padStart(6, '0')}`;

const WALK_IN_DEFAULT_NAME = 'Walk-in client';

function mergeLines(lines: { itemId: string; quantity: number }[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.itemId, (merged.get(line.itemId) ?? 0) + line.quantity);
  }
  return merged;
}

/** Validates quantities against what is available and snapshots price and cost into order lines. */
function buildLines(
  state: AppState,
  requested: { itemId: string; quantity: number }[],
  today: string,
  merchantId?: string,
): { ok: true; lines: OrderLine[] } | { ok: false; error: string } {
  if (requested.length === 0) return fail('Add at least one product.');
  const reserved = reservedByItem(state.orders);
  const lines: OrderLine[] = [];

  for (const [itemId, quantity] of mergeLines(requested)) {
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item || (merchantId && item.merchantId !== merchantId)) return fail('Product not found.');
    if (!isSellable(item, state.costing)) return fail(`"${item.name}" is not on sale.`);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail('Quantities must be whole numbers of at least 1.');
    }
    if (item.expiryDate < today) return fail(`"${item.name}" is past its expiry date.`);
    const available = availableOf(item, reserved);
    if (quantity > available) {
      return fail(`Only ${available} of "${item.name}" available.`);
    }
    lines.push({
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      total: roundMoney(quantity * item.unitPrice),
    });
  }
  return { ok: true, lines };
}

export interface PlaceOrderInput {
  customerName: string;
  contactNo: string;
  address: string;
  notes: string;
  terms: OrderTerms;
  lines: { itemId: string; quantity: number }[];
}

/** A merchant places an order for their own customer. It starts Pending and waits for the cashier. */
export function placeMerchantOrder(
  state: AppState,
  actor: Actor,
  input: PlaceOrderInput,
  now: string,
): Outcome<Order> {
  if (actor.role !== 'merchant' || !actor.merchantId) return fail('Only merchants can place orders.');
  if (input.customerName.trim().length < 2) return fail('Enter the customer name.');
  if (input.terms === 'COD' && input.address.trim().length < 5) {
    return fail('A delivery address is required for cash on delivery.');
  }

  const built = buildLines(state, input.lines, dateOf(now), actor.merchantId);
  if (!built.ok) return fail(built.error);

  const { ids, poSeq } = nextPoids(state, 1);
  const order: Order = {
    id: ids[0],
    merchantId: actor.merchantId,
    source: 'merchant',
    createdBy: actor.id,
    createdAt: now,
    customerName: input.customerName.trim(),
    contactNo: input.contactNo.trim(),
    address: input.terms === 'COD' ? input.address.trim() : '',
    notes: input.notes.trim(),
    terms: input.terms,
    lines: built.lines,
    status: 'pending',
  };
  const charges = orderCharges(
    built.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
    state.costing,
  );
  if (!charges) return fail('This order has no live price.');
  order.pickupHkd = charges.pickupHkd;
  if (input.terms === 'COD') {
    order.sfHkd = charges.sfHkd;
    order.collectionFeeHkd = charges.cfHkd;
    order.netCodHkd = charges.netCodHkd;
    order.amountHkd = charges.netCodHkd;
  } else {
    order.amountHkd = charges.pickupHkd;
  }
  return {
    ok: true,
    state: { ...state, poSeq, orders: [order, ...state.orders] },
    value: order,
  };
}

/**
 * Counter sale: the customer name is optional. Paid on the spot, so it is delivered immediately.
 * Items from different merchants become separate orders because each sale belongs to one merchant.
 */
export function checkoutWalkIn(
  state: AppState,
  actor: Actor,
  input: {
    lines: { itemId: string; quantity: number }[];
    paymentMethod: PaymentMethod;
    /** Optional. Defaults to "Walk-in client". */
    customerName?: string;
  },
  now: string,
): Outcome<Order[]> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can run the counter.');
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return fail('Choose a payment method.');

  const built = buildLines(state, input.lines, dateOf(now));
  if (!built.ok) return fail(built.error);

  const merchantOf = (itemId: string) =>
    state.items.find((item) => item.id === itemId)!.merchantId;
  const byMerchant = new Map<string, OrderLine[]>();
  for (const line of built.lines) {
    const merchantId = merchantOf(line.itemId);
    byMerchant.set(merchantId, [...(byMerchant.get(merchantId) ?? []), line]);
  }

  const { ids, poSeq } = nextPoids(state, byMerchant.size);
  const customerName = input.customerName?.trim() || WALK_IN_DEFAULT_NAME;
  const created: Order[] = [...byMerchant.entries()].map(([merchantId, lines], index) => {
    const charges = orderCharges(
      lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
      state.costing,
    )!;
    return {
    id: ids[index],
    merchantId,
    source: 'walk-in',
    createdBy: actor.id,
    createdAt: now,
    customerName,
    contactNo: '',
    address: '',
    notes: '',
    terms: 'COP',
    lines,
    status: 'delivered',
    packedAt: now,
    deliveredAt: now,
    handledBy: actor.id,
    paymentMethod: input.paymentMethod,
    topUpRate: state.costing.settings.markupPct,
    pickupHkd: charges.pickupHkd,
    amountHkd: charges.pickupHkd,
    };
  });

  const sold = new Map<string, number>();
  for (const line of built.lines) sold.set(line.itemId, line.quantity);

  return {
    ok: true,
    state: {
      ...state,
      poSeq,
      items: state.items.map((item) =>
        sold.has(item.id) ? { ...item, stock: item.stock - sold.get(item.id)! } : item,
      ),
      orders: [...created.reverse(), ...state.orders],
    },
    value: created,
  };
}

function updateOrder(state: AppState, orderId: string, change: Partial<Order>): AppState {
  return {
    ...state,
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, ...change } : order)),
  };
}

export function markPacked(
  state: AppState,
  actor: Actor,
  orderId: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can pack orders.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (order.status !== 'pending') return fail('Only pending orders can be marked as packed.');
  const next = updateOrder(state, orderId, { status: 'packed', packedAt: now, handledBy: actor.id });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/** Takes the goods of an order off the shelf. Fails if the shelf does not have enough. */
function releaseStock(state: AppState, order: Order): { ok: true; items: InventoryItem[] } | { ok: false; error: string } {
  for (const line of order.lines) {
    const item = state.items.find((candidate) => candidate.id === line.itemId);
    if (!item || item.stock < line.quantity) {
      return fail(`Not enough "${line.name}" on hand. Receive stock first.`);
    }
  }
  const out = new Map(order.lines.map((line) => [line.itemId, line.quantity] as const));
  return {
    ok: true,
    items: state.items.map((item) =>
      out.has(item.id) ? { ...item, stock: item.stock - out.get(item.id)! } : item,
    ),
  };
}

/**
 * COD only: the order is handed to the courier. The waybill is the tracking number the merchant
 * sees. The goods leave the warehouse now, so on-hand stock drops here.
 */
export function shipOrder(
  state: AppState,
  actor: Actor,
  orderId: string,
  waybill: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can ship orders.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (order.terms !== 'COD') return fail('Only cash on delivery orders are shipped.');
  if (order.status !== 'packed') return fail('Pack the order before shipping it.');
  const code = waybill.trim();
  if (code.length < 4) return fail('Enter the waybill number.');
  if (state.orders.some((other) => other.waybill?.toLowerCase() === code.toLowerCase())) {
    return fail('That waybill number is already used on another order.');
  }
  const released = releaseStock(state, order);
  if (!released.ok) return fail(released.error);

  const next = updateOrder({ ...state, items: released.items }, orderId, {
    status: 'shipped',
    shippedAt: now,
    waybill: code,
    handledBy: actor.id,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/**
 * Payment is in hand and the sale counts. COD orders must have been shipped first.
 * COP orders are handed over now, so their stock leaves the shelf at this moment.
 */
export function markDelivered(
  state: AppState,
  actor: Actor,
  orderId: string,
  paymentMethod: PaymentMethod,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can mark orders as delivered.');
  if (!PAYMENT_METHODS.includes(paymentMethod)) return fail('Choose how the payment was collected.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');

  let base = state;
  if (order.terms === 'COD') {
    if (order.status !== 'shipped') return fail('Ship the order with a waybill before marking it delivered.');
  } else {
    if (order.status !== 'packed') return fail('Pack the order before marking it as delivered.');
    const released = releaseStock(state, order);
    if (!released.ok) return fail(released.error);
    base = { ...state, items: released.items };
  }

  const next = updateOrder(base, orderId, {
    status: 'delivered',
    deliveredAt: now,
    handledBy: actor.id,
    paymentMethod,
    topUpRate: state.costing.settings.markupPct,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/** A shipped order came back (customer refused, unreachable...). No sale; goods return via receiving. */
export function markRts(
  state: AppState,
  actor: Actor,
  orderId: string,
  reason: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can mark an order as RTS.');
  if (reason.trim().length < 2) return fail('Select or enter a reason.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (order.status !== 'shipped') return fail('Only shipped orders can be returned to sender.');
  const next = updateOrder(state, orderId, {
    status: 'rts',
    rtsAt: now,
    rtsReason: reason.trim(),
    handledBy: actor.id,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/** "Not delivered" before the goods left: the reserved stock is released and no sale is recorded. */
export function cancelOrder(
  state: AppState,
  actor: Actor,
  orderId: string,
  reason: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can close an order as not delivered.');
  if (reason.trim().length < 2) return fail('Select or enter a reason.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (order.status !== 'pending' && order.status !== 'packed') {
    return fail('Only orders that have not shipped can be closed. Use RTS for shipped orders.');
  }
  const next = updateOrder(state, orderId, {
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: reason.trim(),
    handledBy: actor.id,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

// ---------------------------------------------------------------------------
// Receiving: the cashier records what arrived, admin or the inventory clerk approves.
// Stock only changes when a receipt is approved.
// ---------------------------------------------------------------------------

function validReceivedDate(date: string, now: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter the date the goods were received.';
  if (date > dateOf(now)) return 'The received date cannot be in the future.';
  return null;
}

export function createStockInReceipt(
  state: AppState,
  actor: Actor,
  input: {
    merchantId: string;
    receivedDate: string;
    note: string;
    lines: { itemId: string; quantity: number }[];
  },
  now: string,
): Outcome<StockReceipt> {
  if (actor.role !== 'cashier') return fail('Only the cashier can receive stock.');
  const dateError = validReceivedDate(input.receivedDate, now);
  if (dateError) return fail(dateError);
  if (!state.items.some((item) => item.merchantId === input.merchantId)) {
    return fail('Choose the merchant the stock belongs to.');
  }
  const lines: ReceiptLine[] = [];
  for (const [itemId, quantity] of mergeLines(input.lines)) {
    if (quantity === 0) continue;
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item || item.merchantId !== input.merchantId) return fail('Product not found for this merchant.');
    if (!Number.isInteger(quantity) || quantity < 1) return fail('Quantities must be whole numbers.');
    lines.push({ itemId, sku: item.sku, name: item.name, quantity });
  }
  if (lines.length === 0) return fail('Enter the quantity received for at least one product.');

  const receipt: StockReceipt = {
    id: formatReceiptId(state.receipts.length + 1),
    kind: 'stock-in',
    merchantId: input.merchantId,
    receivedDate: input.receivedDate,
    lines,
    note: input.note.trim(),
    receivedBy: actor.id,
    createdAt: now,
    status: 'pending',
  };
  return { ok: true, state: { ...state, receipts: [receipt, ...state.receipts] }, value: receipt };
}

/** The courier brought an RTS order back. The cashier logs it; approval puts it back on the shelf. */
export function createReturnReceipt(
  state: AppState,
  actor: Actor,
  input: { orderId: string; receivedDate: string; note: string },
  now: string,
): Outcome<StockReceipt> {
  if (actor.role !== 'cashier') return fail('Only the cashier can receive returned goods.');
  const dateError = validReceivedDate(input.receivedDate, now);
  if (dateError) return fail(dateError);
  const order = state.orders.find((candidate) => candidate.id === input.orderId);
  if (!order) return fail('Order not found.');
  if (order.status !== 'rts') return fail('Only RTS orders can be received back.');
  if (order.returnReceiptId) return fail('These goods were already received back.');

  const receipt: StockReceipt = {
    id: formatReceiptId(state.receipts.length + 1),
    kind: 'rts',
    merchantId: order.merchantId,
    orderId: order.id,
    receivedDate: input.receivedDate,
    lines: order.lines.map((line) => ({
      itemId: line.itemId,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
    })),
    note: input.note.trim(),
    receivedBy: actor.id,
    createdAt: now,
    status: 'pending',
  };
  return {
    ok: true,
    state: updateOrder(
      { ...state, receipts: [receipt, ...state.receipts] },
      order.id,
      { returnReceiptId: receipt.id },
    ),
    value: receipt,
  };
}

function decide(
  state: AppState,
  actor: Actor,
  receiptId: string,
  status: 'approved' | 'rejected',
  now: string,
  rejectReason?: string,
): Outcome<StockReceipt> {
  if (!canApprove(actor)) return fail('Only the admin or inventory clerk can approve received stock.');
  const receipt = state.receipts.find((candidate) => candidate.id === receiptId);
  if (!receipt) return fail('Receipt not found.');
  if (receipt.status !== 'pending') return fail('This receipt was already reviewed.');

  const decided: StockReceipt = {
    ...receipt,
    status,
    decidedBy: actor.id,
    decidedAt: now,
    ...(status === 'rejected' ? { rejectReason } : {}),
  };

  let items = state.items;
  if (status === 'approved') {
    const add = new Map(receipt.lines.map((line) => [line.itemId, line.quantity] as const));
    items = state.items.map((item) =>
      add.has(item.id) ? { ...item, stock: item.stock + add.get(item.id)! } : item,
    );
  }

  let next: AppState = {
    ...state,
    items,
    receipts: state.receipts.map((candidate) => (candidate.id === receiptId ? decided : candidate)),
  };
  // A rejected return can be received again.
  if (status === 'rejected' && receipt.kind === 'rts' && receipt.orderId) {
    next = {
      ...next,
      orders: next.orders.map((order) =>
        order.id === receipt.orderId ? { ...order, returnReceiptId: undefined } : order,
      ),
    };
  }
  return { ok: true, state: next, value: decided };
}

export const approveReceipt = (
  state: AppState,
  actor: Actor,
  receiptId: string,
  now: string,
): Outcome<StockReceipt> => decide(state, actor, receiptId, 'approved', now);

export function rejectReceipt(
  state: AppState,
  actor: Actor,
  receiptId: string,
  reason: string,
  now: string,
): Outcome<StockReceipt> {
  if (reason.trim().length < 2) return fail('Enter the reason for rejecting.');
  return decide(state, actor, receiptId, 'rejected', now, reason.trim());
}


// ---------------------------------------------------------------------------
// Costing: admin only. Every change is written to the change log, nothing is edited silently.
// ---------------------------------------------------------------------------

const hk = (value: number | null): string => (value === null ? 'not set' : `HK$${value.toFixed(2)}`);

function logged(
  state: AppState,
  actor: Actor,
  now: string,
  summary: string,
  details: string[],
  change: Partial<CostingState>,
): AppState {
  const entry: CostingLogEntry = {
    id: `CL-${String(state.costing.log.length + 1).padStart(6, '0')}`,
    at: now,
    by: actor.id,
    summary,
    details,
  };
  return { ...state, costing: { ...state.costing, ...change, log: [entry, ...state.costing.log] } };
}

const costingGuard = (actor: Actor) =>
  actor.role === 'admin' ? null : fail('Only the admin can change the costing.');

/** Sets the pickup price (HKD) of one or more packages. All changes are checked first, then saved together. */
export function setPickupPrices(
  state: AppState,
  actor: Actor,
  changes: { rowId: string; pickupPriceHkd: number }[],
  now: string,
): Outcome<number> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  if (changes.length === 0) return fail('There is nothing to save.');

  const details: string[] = [];
  const priceOf = new Map<string, number>();
  for (const change of changes) {
    const row = state.costing.rows.find((candidate) => candidate.id === change.rowId);
    if (!row) return fail('Costing row not found.');
    const problem = validatePickupPrice(change.pickupPriceHkd);
    if (problem) return fail(problem);
    if (priceOf.has(row.id)) return fail('The same row was changed twice.');
    if (change.pickupPriceHkd === row.pickupPriceHkd) return fail('A price was not changed.');
    priceOf.set(row.id, change.pickupPriceHkd);
    const item = state.items.find((candidate) => candidate.id === row.itemId);
    details.push(`${item?.sku ?? row.itemId}: ${hk(row.pickupPriceHkd)} -> ${hk(change.pickupPriceHkd)}`);
  }

  // A new price is a new draft. Any earlier approval no longer counts. The live version stays in use until the new one goes live.
  const rows = state.costing.rows.map((row) =>
    priceOf.has(row.id)
      ? { ...row, pickupPriceHkd: priceOf.get(row.id)!, status: 'draft' as const, approvedBy: undefined, approvedAt: undefined }
      : row,
  );
  return {
    ok: true,
    state: logged(
      state,
      actor,
      now,
      `Pickup price changed on ${changes.length} package${changes.length === 1 ? '' : 's'}`,
      details,
      { rows },
    ),
    value: changes.length,
  };
}

export function setCostingSettings(
  state: AppState,
  actor: Actor,
  patch: Partial<CostingSettings>,
  now: string,
): Outcome<CostingSettings> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const keys = (Object.keys(patch) as (keyof CostingSettings)[]).filter(
    (key) => patch[key] !== state.costing.settings[key],
  );
  if (keys.length === 0) return fail('No setting was changed.');
  const problem = validateSettings(patch);
  if (problem) return fail(problem);

  const settings = { ...state.costing.settings, ...patch };
  const details = keys.map((key) => `${SETTING_LABEL[key]}: ${state.costing.settings[key]} -> ${patch[key]}`);
  return {
    ok: true,
    state: logged(state, actor, now, 'Costing settings changed', details, { settings }),
    value: settings,
  };
}

export function removeCostingRow(
  state: AppState,
  actor: Actor,
  rowId: string,
  now: string,
): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.live) return fail('This package has been live. Disable the SKU instead of removing it.');
  const item = state.items.find((candidate) => candidate.id === row.itemId);
  return {
    ok: true,
    state: logged(
      state,
      actor,
      now,
      'Costing row removed',
      [`${item?.sku ?? row.itemId} (pickup ${hk(row.pickupPriceHkd)})`],
      { rows: state.costing.rows.filter((candidate) => candidate.id !== rowId) },
    ),
    value: row,
  };
}

const rowLabel = (state: AppState, row: CostingRow) =>
  state.items.find((candidate) => candidate.id === row.itemId)?.sku ?? row.itemId;

const replaceRow = (state: AppState, rowId: string, patch: Partial<CostingRow>): CostingRow[] =>
  state.costing.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));

/** Step 1: the draft is checked and approved. Needs a pickup price. */
export function approveCostingRow(state: AppState, actor: Actor, rowId: string, now: string): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.status !== 'draft') return fail('Only a draft can be approved.');
  if (row.pickupPriceHkd === null) return fail('Set the pickup price before approving.');
  const next = { ...row, status: 'approved' as const, approvedBy: actor.id, approvedAt: now };
  return {
    ok: true,
    state: logged(state, actor, now, 'Package approved', [`${rowLabel(state, row)}: pickup ${hk(row.pickupPriceHkd)}`], {
      rows: replaceRow(state, rowId, next),
    }),
    value: next,
  };
}

/** Takes an approved package back to draft, for example when a mistake is found before going live. */
export function revokeApproval(state: AppState, actor: Actor, rowId: string, now: string): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.status !== 'approved') return fail('Only an approved package can go back to draft.');
  const next = { ...row, status: 'draft' as const, approvedBy: undefined, approvedAt: undefined };
  return {
    ok: true,
    state: logged(state, actor, now, 'Approval removed', [rowLabel(state, row)], { rows: replaceRow(state, rowId, next) }),
    value: next,
  };
}

/** Step 2: an approved package goes live. Orders use its frozen price, SF and CF from now on. */
export function goLiveCostingRow(state: AppState, actor: Actor, rowId: string, now: string): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.status !== 'approved') return fail('Approve the package before going live.');
  const item = state.items.find((candidate) => candidate.id === row.itemId);
  if (!item) return fail('Product not found.');
  const live = snapshotLive(item.unitPrice, row, state.costing.settings, actor.id, now);
  if (!live) return fail('Set the pickup price first.');
  const next = { ...row, status: 'live' as const, live };
  const before = row.live ? `was ${hk(row.live.pickupPriceHkd)}, ` : 'first time live, ';
  return {
    ok: true,
    state: logged(
      state,
      actor,
      now,
      'Package went live',
      [`${rowLabel(state, row)}: ${before}now pickup ${hk(live.pickupPriceHkd)}, SF ${hk(live.sfHkd)}, CF ${hk(live.cfHkd)}, net COD ${hk(live.netCodHkd)}`],
      { rows: replaceRow(state, rowId, next) },
    ),
    value: next,
  };
}

/** Disable or re-enable a whole SKU. Open orders are not touched; new orders cannot include it. */
export function setSkuDisabled(
  state: AppState,
  actor: Actor,
  itemId: string,
  disabled: boolean,
  now: string,
): Outcome<InventoryItem> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail('Product not found.');
  if (Boolean(item.disabled) === disabled) return fail(disabled ? 'This SKU is already disabled.' : 'This SKU is already enabled.');
  const next = { ...item, disabled };
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, disabled ? 'SKU disabled' : 'SKU enabled', [`${item.sku} ${item.name}`], {}),
      items: state.items.map((candidate) => (candidate.id === itemId ? next : candidate)),
    },
    value: next,
  };
}

export interface NewSkuInput {
  merchantId: string;
  sku: string;
  name: string;
  category: InventoryItem['category'];
  /** Merchant SRP per unit, PHP. */
  unitPrice: number;
  /** Pieces inside the SKU: 1 for solo, 2 for a twin pack. Each piece adds the +5 HKD SF. */
  qty: number;
}

/**
 * Adds a new SKU. It exists in Inventory (so stock can be received) but cannot be sold until
 * one of its packages is approved and goes live. The SKU code must be new.
 */
export function addSku(state: AppState, actor: Actor, input: NewSkuInput, now: string): Outcome<InventoryItem> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const sku = input.sku.trim().toUpperCase();
  const problem = validateSkuCode(sku, state.items);
  if (problem) return fail(problem);
  if (input.name.trim().length < 2) return fail('Enter the product name.');
  if (!input.merchantId) return fail('Choose a merchant.');
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0 || input.unitPrice > 1_000_000) {
    return fail('Enter the merchant SRP (PHP) above 0.');
  }
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 99) {
    return fail('Pieces in the SKU must be a whole number from 1 to 99.');
  }

  const next = state.items.reduce((max, item) => Math.max(max, Number(item.id.replace('itm-', '')) || 0), 0) + 1;
  const id = `itm-${String(next).padStart(3, '0')}`;
  const item: InventoryItem = {
    id,
    merchantId: input.merchantId,
    sku,
    name: input.name.trim(),
    category: input.category,
    unitCost: 0,
    unitPrice: roundMoney(input.unitPrice),
    stock: 0,
    reorderLevel: 10,
    expiryDate: '2099-12-31',
  };
  const row: CostingRow = {
    id: `cst-${String(next).padStart(3, '0')}`,
    itemId: id,
    qty: input.qty,
    pickupPriceHkd: null,
    status: 'draft',
    live: null,
  };
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, 'New SKU added', [`${sku} ${item.name}, SRP ${item.unitPrice}, ${input.qty} pc${input.qty === 1 ? '' : 's'}`], {
        rows: [...state.costing.rows, row],
      }),
      items: [...state.items, item],
    },
    value: item,
  };
}

/** Convenience for the UI: the full computed line for one costing row. */
export const costingLine = (state: AppState, row: CostingRow) => {
  const item = state.items.find((candidate) => candidate.id === row.itemId);
  return item ? computeCosting(item.unitPrice, row.qty, row.pickupPriceHkd, state.costing.settings) : null;
};
