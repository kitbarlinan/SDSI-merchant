/**
 * Business rules as pure functions: (state, actor, input) -> new state or an error.
 * The React store just calls these, and they can be tested without any UI.
 *
 * NOTE: the permission checks here only protect the demo. Once this moves to Supabase the same
 * rules must be enforced on the server (row level security / server actions).
 */
import { roundMoney } from './format';
import { availableOf, isOpen, reservedByItem } from './orders';
import {
  PAYMENT_METHODS,
  type InventoryItem,
  type Order,
  type OrderLine,
  type OrderTerms,
  type PaymentMethod,
  type Role,
} from './types';

export interface AppState {
  items: InventoryItem[];
  orders: Order[];
  /** Current SDSI top-up, percent of merchant sales. Applied to orders delivered from now on. */
  topUpPercent: number;
}

export interface Actor {
  id: string;
  role: Role;
  merchantId?: string;
}

export type Outcome<T> = { ok: true; state: AppState; value: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

const isStaff = (actor: Actor): boolean => actor.role === 'admin' || actor.role === 'cashier';

const dateOf = (dateTime: string): string => dateTime.slice(0, 10);

function nextOrderIds(orders: Order[], count: number): string[] {
  const last = orders.reduce(
    (max, order) => Math.max(max, Number(order.id.replace(/\D/g, '')) || 0),
    1000,
  );
  return Array.from({ length: count }, (_, index) => `ORD-${last + index + 1}`);
}

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

  const [id] = nextOrderIds(state.orders, 1);
  const order: Order = {
    id,
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
  return { ok: true, state: { ...state, orders: [order, ...state.orders] }, value: order };
}

/**
 * Counter sale: no customer details. Paid on the spot, so it is delivered immediately.
 * Items from different merchants become separate orders because each sale belongs to one merchant.
 */
export function checkoutWalkIn(
  state: AppState,
  actor: Actor,
  input: { lines: { itemId: string; quantity: number }[]; paymentMethod: PaymentMethod },
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

  const ids = nextOrderIds(state.orders, byMerchant.size);
  const created: Order[] = [...byMerchant.entries()].map(([merchantId, lines], index) => ({
    id: ids[index],
    merchantId,
    source: 'walk-in',
    createdBy: actor.id,
    createdAt: now,
    customerName: null,
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
    topUpRate: state.topUpPercent,
  }));

  const sold = new Map<string, number>();
  for (const line of built.lines) sold.set(line.itemId, line.quantity);

  return {
    ok: true,
    state: {
      ...state,
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

/** Payment is in hand: stock leaves the shelf and the sale counts. */
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
  if (order.status !== 'packed') return fail('Pack the order before marking it as delivered.');

  for (const line of order.lines) {
    const item = state.items.find((candidate) => candidate.id === line.itemId);
    if (!item || item.stock < line.quantity) {
      return fail(`Not enough "${line.name}" on hand to deliver. Receive stock first.`);
    }
  }

  const sold = new Map(order.lines.map((line) => [line.itemId, line.quantity] as const));
  const next = updateOrder(
    {
      ...state,
      items: state.items.map((item) =>
        sold.has(item.id) ? { ...item, stock: item.stock - sold.get(item.id)! } : item,
      ),
    },
    orderId,
    {
      status: 'delivered',
      deliveredAt: now,
      handledBy: actor.id,
      paymentMethod,
      topUpRate: state.topUpPercent,
    },
  );
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/** "Not delivered": the reserved stock is released and no sale is recorded. */
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
  if (!isOpen(order)) return fail('Only open orders can be marked as not delivered.');
  const next = updateOrder(state, orderId, {
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: reason.trim(),
    handledBy: actor.id,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/** A merchant's stock arrived at the warehouse. */
export function receiveStock(
  state: AppState,
  actor: Actor,
  itemId: string,
  quantity: number,
): Outcome<InventoryItem> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can receive stock.');
  if (!Number.isInteger(quantity) || quantity < 1) return fail('Enter a whole number of at least 1.');
  if (!state.items.some((item) => item.id === itemId)) return fail('Product not found.');
  const items = state.items.map((item) =>
    item.id === itemId ? { ...item, stock: item.stock + quantity } : item,
  );
  return {
    ok: true,
    state: { ...state, items },
    value: items.find((item) => item.id === itemId)!,
  };
}

export function setTopUpPercent(state: AppState, actor: Actor, percent: number): Outcome<number> {
  if (actor.role !== 'admin') return fail('Only the admin can change the top-up.');
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return fail('Enter a percentage between 0 and 100.');
  }
  const rounded = Math.round(percent * 100) / 100;
  return { ok: true, state: { ...state, topUpPercent: rounded }, value: rounded };
}
