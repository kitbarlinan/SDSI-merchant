/**
 * What each person may receive from the server. The browser only ever gets the result of scopeFor,
 * so a merchant never holds another merchant's orders and a reseller never holds the costing.
 * Server only.
 */
import { referralStats } from '../referral';
import type { AppState } from '../engine';
import { LEGACY_BRANCH, type InventoryItem, type MasterProduct, type Merchant, type Order, type PackageSale, type User } from '../types';

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

/** A reseller needs the stock count to see what is available, not the product's name or the merchant's SRP. */
export const stockOnly = (product: MasterProduct): MasterProduct => ({ id: product.id, merchantId: '', code: '', name: '', srp: 0, stock: product.stock, branchStock: product.branchStock, reorderLevel: product.reorderLevel });

/** Who may read a merchant's owner and bank details: the admin, the cashier who releases payouts, and that merchant. */
const merchantsFor = (me: User, merchants: Merchant[]): Merchant[] =>
  merchants.map((merchant) => {
    if (!merchant.profile) return merchant;
    const allowed = me.role === 'admin' || me.role === 'cashier' || (me.role === 'merchant' && me.merchantId === merchant.id);
    if (allowed) return merchant;
    const { profile: _profile, ...rest } = merchant;
    void _profile;
    return rest;
  });

/** Package sales and orders on which this person earns tier income, with only their own tier line. For people who are not resellers. */
function earningsOf(me: User, state: AppState): { sales: PackageSale[]; orders: Order[] } {
  const mine = <T extends { userId: string }>(tiers: T[] | undefined) => (tiers ?? []).filter((tier) => tier.userId === me.id);
  return {
    sales: state.packageSales.filter((sale) => mine(sale.tiers).length > 0).map((sale): PackageSale => ({ ...sale, tiers: mine(sale.tiers) })),
    orders: state.orders
      .filter((order) => mine(order.tiers).length > 0)
      .map((order): Order => ({ ...redactOrder(order), customerName: order.customerName, tiers: mine(order.tiers) })),
  };
}

export function scopeFor(me: User, state: AppState, merchantList: Merchant[]): Scoped {
  const merchants = merchantsFor(me, merchantList);
  const base: AppState = { ...state, outbox: [], poSeq: 0 };

  if (me.role === 'admin') {
    return { merchants, state: { ...state, users: state.users.map((user) => ({ ...noPassword(user), hasLogin: !!user.authId, joined: !!user.joinedAt })) } };
  }

  // Everyone but the admin gets the costing without the mark-up and its change log.
  // A reseller sees only the merchants they brought in, with the numbers worked out here (they cannot see those orders).
  const referrals = (state.costing.referrals ?? [])
    .filter((link) => link.userId === me.id)
    .map((link) => ({ ...link, stats: referralStats(state.orders, link.merchantId, state.costing.settings.referrerPct, state.costing.settings.payoutFxPhpPerHkd) }));
  const costing = { ...state.costing, settings: { ...state.costing.settings, markupPct: 0 }, log: [], referrals };

  const earnings = earningsOf(me, state);

  if (me.role === 'merchant') {
    const mine = (merchantId: string) => merchantId === me.merchantId;
    return {
      merchants,
      state: {
        ...base,
        costing,
        items: state.items.filter((item) => mine(item.merchantId)),
        products: state.products.filter((product) => mine(product.merchantId)),
        orders: [...state.orders.filter((order) => mine(order.merchantId)), ...earnings.orders.filter((order) => !mine(order.merchantId))],
        receipts: state.receipts.filter((receipt) => mine(receipt.merchantId)),
        reversals: state.reversals.filter((request) => mine(request.merchantId)),
        remittances: state.remittances.filter((remittance) => mine(remittance.merchantId)),
        packageSales: earnings.sales,
        earningPayouts: [],
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
        products: state.products.map(stockOnly),
        orders,
        receipts: [],
        reversals: [],
        remittances: [],
        earningPayouts: state.earningPayouts.filter((payout) => payout.userId === me.id),
        packageSales: state.packageSales
          .filter((sale) => sale.resellerId === me.id || sale.tiers.some((tier) => tier.userId === me.id))
          .map((sale): PackageSale => ({ ...sale, tiers: sale.tiers.filter((tier) => tier.userId === me.id || sale.resellerId === me.id) })),
        users: state.users.filter((user) => linked.has(user.id)).map((user) => (user.id === me.id ? noPassword(user) : publicUser(user))),
      },
    };
  }

  // Staff: the cashier works one branch, the clerk sees all orders but no payouts.
  const branch = me.branchId ?? LEGACY_BRANCH;
  const orders =
    me.role === 'cashier'
      ? state.orders.flatMap((order) =>
          (order.branch ?? LEGACY_BRANCH) === branch ? [order] : reserving(order) ? [redactOrder(order)] : [],
        )
      : state.orders;
  return {
    merchants,
    state: {
      ...base,
      costing,
      items: state.items,
      products: state.products,
      orders,
      receipts: state.receipts,
      reversals: state.reversals,
      remittances: me.role === 'cashier' ? state.remittances : [],
      packageSales: me.role === 'cashier' ? state.packageSales : earnings.sales,
      earningPayouts: state.earningPayouts.filter((payout) => payout.userId === me.id),
      users: state.users.map(noPassword).map((user) => (me.role === 'cashier' || user.role !== 'customer' ? user : publicUser(user))),
    },
  };
}
