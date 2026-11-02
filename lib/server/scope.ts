/**
 * What each person may receive from the server. The browser only ever gets the result of scopeFor,
 * so a merchant never holds another merchant's orders and a reseller never holds the costing.
 * Server only.
 */
import type { AppState } from '../engine';
import { DEFAULT_BRANCH, type InventoryItem, type Merchant, type Order, type PackageSale, type User } from '../types';

export interface Scoped {
  state: AppState;
  merchants: Merchant[];
}

const reserving = (order: Order) => order.status === 'pending' || order.status === 'packed' || order.status === 'shipped';

/** Enough to count stock on hold, nothing about the buyer or the money. */
export function redactOrder(order: Order): Order {
  return {
    id: order.id,
    merchantId: order.merchantId,
    source: order.source,
    createdBy: '',
    createdAt: order.createdAt,
    customerName: null,
    contactNo: '',
    address: '',
    notes: '',
    terms: order.terms,
    status: order.status,
    branch: order.branch,
    lines: order.lines.map((line) => ({ ...line, unitPrice: 0, unitCost: 0, total: 0 })),
  };
}

const noPassword = (user: User): User => {
  const { password: _password, authId: _authId, ...rest } = user;
  void _password;
  void _authId;
  return rest;
};

/** Names only: for people the viewer is linked to but must not read contact details of. */
const publicUser = (user: User): User => ({ id: user.id, name: user.name, role: user.role, sponsorId: user.sponsorId, refCode: user.refCode });

/** Reseller: the people above (sponsors) and below (up to 3 levels) are visible by name. */
function chainOf(users: User[], meId: string): Set<string> {
  const ids = new Set<string>([meId]);
  let current = users.find((user) => user.id === meId);
  for (let level = 0; level < 3 && current?.sponsorId; level += 1) {
    ids.add(current.sponsorId);
    current = users.find((user) => user.id === current?.sponsorId);
  }
  let frontier = [meId];
  for (let level = 0; level < 3; level += 1) {
    frontier = users.filter((user) => user.sponsorId && frontier.includes(user.sponsorId)).map((user) => user.id);
    frontier.forEach((id) => ids.add(id));
  }
  return ids;
}

const stripCost = (item: InventoryItem): InventoryItem => ({ ...item, unitCost: 0 });

export function scopeFor(me: User, state: AppState, merchants: Merchant[]): Scoped {
  const base: AppState = { ...state, outbox: [], poSeq: 0 };

  if (me.role === 'admin') {
    return { merchants, state: { ...state, users: state.users.map((user) => ({ ...noPassword(user), hasLogin: !!user.authId })) } };
  }

  // Everyone but the admin gets the costing without the mark-up and its change log.
  const costing = { ...state.costing, settings: { ...state.costing.settings, markupPct: 0 }, log: [] };

  if (me.role === 'merchant') {
    const mine = (merchantId: string) => merchantId === me.merchantId;
    return {
      merchants,
      state: {
        ...base,
        costing,
        items: state.items.filter((item) => mine(item.merchantId)),
        orders: state.orders.filter((order) => mine(order.merchantId)),
        receipts: state.receipts.filter((receipt) => mine(receipt.merchantId)),
        reversals: state.reversals.filter((request) => mine(request.merchantId)),
        remittances: state.remittances.filter((remittance) => mine(remittance.merchantId)),
        packageSales: [],
        users: state.users.filter((user) => user.id === me.id).map(noPassword),
      },
    };
  }

  if (me.role === 'customer') {
    const linked = chainOf(state.users, me.id);
    const orders: Order[] = [];
    for (const order of state.orders) {
      const mineOrder = order.createdBy === me.id || order.buyerId === me.id;
      const earns = (order.tiers ?? []).some((tier) => tier.userId === me.id);
      if (mineOrder || earns) {
        orders.push({ ...order, tiers: order.tiers?.filter((tier) => tier.userId === me.id || mineOrder), applicant: undefined });
      } else if (reserving(order)) {
        orders.push(redactOrder(order));
      }
    }
    return {
      merchants,
      state: {
        ...base,
        costing,
        items: state.items.map(stripCost),
        orders,
        receipts: [],
        reversals: [],
        remittances: [],
        packageSales: state.packageSales
          .filter((sale) => sale.resellerId === me.id || sale.tiers.some((tier) => tier.userId === me.id))
          .map((sale): PackageSale => ({ ...sale, tiers: sale.tiers.filter((tier) => tier.userId === me.id || sale.resellerId === me.id) })),
        users: state.users.filter((user) => linked.has(user.id)).map((user) => (user.id === me.id ? noPassword(user) : publicUser(user))),
      },
    };
  }

  // Staff: the cashier works one branch, the clerk sees all orders but no payouts.
  const branch = me.branchId ?? DEFAULT_BRANCH;
  const orders =
    me.role === 'cashier'
      ? state.orders.flatMap((order) =>
          (order.branch ?? DEFAULT_BRANCH) === branch ? [order] : reserving(order) ? [redactOrder(order)] : [],
        )
      : state.orders;
  return {
    merchants,
    state: {
      ...base,
      costing,
      items: state.items,
      orders,
      receipts: state.receipts,
      reversals: state.reversals,
      remittances: me.role === 'cashier' ? state.remittances : [],
      packageSales: me.role === 'cashier' ? state.packageSales : [],
      users: state.users.map(noPassword).map((user) => (me.role === 'cashier' || user.role !== 'customer' ? user : publicUser(user))),
    },
  };
}
