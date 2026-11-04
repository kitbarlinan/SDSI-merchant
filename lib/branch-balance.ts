/**
 * Branch check and balances. Pure helpers, no UI.
 *
 * Payouts to a merchant are ONE consolidated remittance per week, whichever branch delivered the
 * order. This only splits the same numbers by the branch of each order, so the two branches can be
 * checked against the single payout: Sheung Wan + Central = the merchant's total.
 */
import { roundMoney } from './format';
import { orderTotal } from './orders';
import { remittedOrderIds, walletOf } from './remittance';
import { BRANCHES, LEGACY_BRANCH, type BranchId, type Merchant, type Order, type Remittance } from './types';

export type BranchAmounts = Record<BranchId, number>;

const zero = (): BranchAmounts => Object.fromEntries(BRANCHES.map((branch) => [branch.id, 0])) as BranchAmounts;
const sumOf = (amounts: BranchAmounts): number => roundMoney(Object.values(amounts).reduce((total, value) => total + value, 0));

/** Net SRP of the given orders per branch (the branch that handled each order). */
export function netByBranch(orders: Order[]): BranchAmounts {
  const result = zero();
  for (const order of orders) {
    const branch = order.branch ?? LEGACY_BRANCH;
    result[branch] = roundMoney(result[branch] + orderTotal(order));
  }
  return result;
}

/** One remittance split by branch. The parts always add up to its net payable. */
export function remittanceByBranch(remittance: Remittance, orders: Order[]): BranchAmounts {
  const ids = new Set(remittance.orderIds);
  return netByBranch(orders.filter((order) => ids.has(order.id)));
}

export interface MerchantBalance {
  merchantId: string;
  /** Delivered Net SRP per branch, since the start. */
  earnedByBranch: BranchAmounts;
  /** Both branches together: what the merchant has earned. */
  earned: number;
  /** In weekly remittances already closed. */
  closed: number;
  /** Delivered but the week is not closed yet. */
  open: number;
  /** Of the closed ones, per branch. */
  closedByBranch: BranchAmounts;
  openByBranch: BranchAmounts;
  /** SF advance deducted and corrections on released payouts. */
  deducted: number;
  adjustments: number;
  /** Cash really paid out, and what SDSI still owes. */
  paidOut: number;
  owed: number;
  /** Each check: the two sides agree to the centavo. */
  checks: { label: string; ok: boolean; detail: string }[];
}

export function merchantBalances(merchants: Merchant[], orders: Order[], remittances: Remittance[]): MerchantBalance[] {
  const taken = remittedOrderIds(remittances);
  return merchants.map((merchant) => {
    const delivered = orders.filter((order) => order.merchantId === merchant.id && order.status === 'delivered');
    const closedOrders = delivered.filter((order) => taken.has(order.id));
    const openOrders = delivered.filter((order) => !taken.has(order.id));
    const earnedByBranch = netByBranch(delivered);
    const closedByBranch = netByBranch(closedOrders);
    const openByBranch = netByBranch(openOrders);
    const wallet = walletOf(merchant.id, orders, remittances);
    const mine = remittances.filter((remittance) => remittance.merchantId === merchant.id);
    const remittanceNet = roundMoney(mine.reduce((total, remittance) => total + remittance.netPayable, 0));
    const splitTotal = roundMoney(mine.reduce((total, remittance) => total + sumOf(remittanceByBranch(remittance, orders)), 0));
    const earned = sumOf(earnedByBranch);
    const releasedNet = roundMoney(mine.filter((r) => r.status === 'released').reduce((t, r) => t + r.netPayable, 0));
    const closed = sumOf(closedByBranch);
    const open = sumOf(openByBranch);
    const checks = [
      { label: 'Sheung Wan + Central = merchant earned', ok: Math.abs(earned - wallet.earned) < 0.005, detail: `${earned} vs ${wallet.earned}` },
      { label: 'Closed weeks + open week = earned', ok: Math.abs(closed + open - earned) < 0.005, detail: `${closed} + ${open} vs ${earned}` },
      { label: 'Each remittance split by branch = its net payable', ok: Math.abs(splitTotal - remittanceNet) < 0.005, detail: `${splitTotal} vs ${remittanceNet}` },
      {
        label: 'Paid out = released net − SF advance ± adjustments',
        ok: Math.abs(wallet.paidOut - (releasedNet - wallet.deducted + wallet.adjustments)) < 0.005,
        detail: `${wallet.paidOut} vs ${roundMoney(releasedNet - wallet.deducted + wallet.adjustments)}`,
      },
    ];
    return {
      merchantId: merchant.id,
      earnedByBranch,
      earned,
      closed,
      open,
      closedByBranch,
      openByBranch,
      deducted: wallet.deducted,
      adjustments: wallet.adjustments,
      paidOut: wallet.paidOut,
      owed: wallet.balance,
      checks,
    };
  });
}
