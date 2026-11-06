import { roundMoney } from './format';
import { orderTotal, tierIncome } from './orders';
import type { InventoryItem, Order, PackageSale, TierShare, User } from './types';

/** One purchase in the reseller program, with what SDSI keeps out of its top-up. */
export interface LedgerRow {
  kind: 'Package' | 'Order';
  ref: string;
  date: string;
  buyerId: string;
  buyerName: string;
  status: string;
  srpPhp: number;
  /** SDSI's top-up (50% of the SRP). */
  topUpPhp: number;
  /** The reseller's 15%: the discount on an order, the reseller share on a package. */
  discountPhp: number;
  tiers: TierShare[];
  netPhp: number;
  /** Delivered orders and packages count in the totals. Pending ones are shown but not counted. */
  counted: boolean;
}

const sumTiers = (tiers: TierShare[]) => roundMoney(tiers.reduce((total, tier) => total + tier.php, 0));

export function resellerLedger(orders: Order[], sales: PackageSale[], items: InventoryItem[], markupPct: number, extraPct = 0): LedgerRow[] {
  const packageIds = new Set(items.filter((item) => item.package).map((item) => item.id));
  const rows: LedgerRow[] = sales.map((sale) => ({
    kind: 'Package',
    ref: sale.id,
    date: sale.createdAt.slice(0, 10),
    buyerId: sale.resellerId,
    buyerName: sale.resellerName,
    status: 'Paid',
    srpPhp: sale.srpPhp,
    topUpPhp: sale.grossPhp,
    discountPhp: sale.resellerPhp,
    tiers: sale.tiers,
    netPhp: sale.netPhp,
    counted: true,
  }));
  for (const order of orders) {
    if (order.source !== 'reseller' || order.status === 'cancelled' || order.status === 'rts') continue;
    if (order.lines.some((line) => packageIds.has(line.itemId))) {
      // A delivered package order is already a package sale above. A waiting one is shown as pending.
      if (order.status === 'delivered') continue;
    }
    const srp = orderTotal(order);
    const topUp = roundMoney((srp * (order.topUpRate ?? markupPct)) / 100);
    const tiers = order.tiers ?? [];
    const discount = order.discountPhp ?? 0;
    rows.push({
      kind: 'Order',
      ref: order.id,
      date: order.createdAt.slice(0, 10),
      buyerId: order.buyerId ?? order.createdBy,
      buyerName: order.customerName ?? '',
      status: order.status === 'delivered' ? 'Delivered' : 'Pending',
      srpPhp: srp,
      topUpPhp: topUp,
      discountPhp: discount,
      tiers,
      netPhp: roundMoney(topUp - discount - sumTiers(tiers) - (srp * extraPct) / 100),
      counted: order.status === 'delivered',
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
}

export interface ResellerSummary {
  user: User;
  active: boolean;
  packageDate: string | null;
  orders: number;
  purchasesPhp: number;
  /** Discount received on delivered orders. */
  discountPhp: number;
  /** Tier income earned as an upline, per level. */
  tierByLevel: [number, number, number];
  tierTotal: number;
}

export function resellerSummaries(users: User[], rows: LedgerRow[], sales: PackageSale[], orders: Order[]): ResellerSummary[] {
  return users
    .filter((user) => user.role === 'customer')
    .map((user) => {
      const mine = rows.filter((row) => row.buyerId === user.id && row.counted && row.kind === 'Order');
      const income = tierIncome(sales, orders, user.id);
      const byLevel: [number, number, number] = [0, 0, 0];
      for (const row of income.rows) if (row.earned) byLevel[row.level - 1] = roundMoney(byLevel[row.level - 1] + row.php);
      const sale = sales.find((candidate) => candidate.resellerId === user.id);
      return {
        user,
        active: Boolean(sale),
        packageDate: sale ? sale.createdAt.slice(0, 10) : null,
        orders: mine.length,
        purchasesPhp: roundMoney(mine.reduce((total, row) => total + row.srpPhp, 0)),
        discountPhp: roundMoney(mine.reduce((total, row) => total + row.discountPhp, 0)),
        tierByLevel: byLevel,
        tierTotal: income.total,
      };
    });
}
