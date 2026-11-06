import { roundMoney } from './format';
import type { CostingState } from './costing';
import { referralStats } from './referral';
import type { EarningPayout, Order, PackageSale } from './types';

export interface ResellerWallet {
  /** Income that came in, HKD: tier income and referral bonus, once delivered. */
  tierHkd: number;
  referralHkd: number;
  /** Paid with the wallet on delivered orders. */
  spentHkd: number;
  /** Cashed out: payouts already paid. */
  paidOutHkd: number;
  /** Payouts asked for and not paid yet. They are already taken out of what can be used. */
  payoutPendingHkd: number;
  /** Held for open orders the buyer chose to pay from the wallet. */
  heldHkd: number;
  balanceHkd: number;
  /** What can still be used for a new order. */
  availableHkd: number;
}

/**
 * The wallet of a person, in HKD. Credits are the tier income and the referral bonus (turned into HKD at the rate
 * of each order, or today's rate for older records). Debits are orders paid from the wallet.
 */
export function walletHkd(
  userId: string,
  orders: Order[],
  sales: PackageSale[],
  costing: CostingState,
  payouts: EarningPayout[] = [],
  /** An order that is being paid now is not held against the balance twice. */
  ignoreOrderId?: string,
): ResellerWallet {
  const fx = costing.settings.payoutFxPhpPerHkd;
  let tier = 0;
  for (const sale of sales) {
    for (const t of sale.tiers) if (t.userId === userId) tier += t.php / (sale.fxRate ?? fx);
  }
  let spent = 0;
  let held = 0;
  for (const order of orders) {
    if (order.status === 'delivered') {
      for (const t of order.tiers ?? []) if (t.userId === userId) tier += t.php / (order.fxRate ?? fx);
    }
    const mine = (order.buyerId ?? order.createdBy) === userId;
    if (!mine) continue;
    if (order.status === 'delivered' && order.paymentMethod === 'Wallet') spent += order.amountHkd ?? 0;
    else if (order.payFromWallet && order.id !== ignoreOrderId && (order.status === 'pending' || order.status === 'packed')) held += order.amountHkd ?? 0;
  }
  let referral = 0;
  for (const link of costing.referrals ?? []) {
    if (link.userId !== userId) continue;
    referral += (link.stats ?? referralStats(orders, link.merchantId, costing.settings.referrerPct, fx)).earnedHkd;
  }
  const tierHkd = roundMoney(tier);
  const referralHkd = roundMoney(referral);
  const spentHkd = roundMoney(spent);
  const heldHkd = roundMoney(held);
  const mine = payouts.filter((payout) => payout.userId === userId);
  const paidOutHkd = roundMoney(mine.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amountHkd, 0));
  const payoutPendingHkd = roundMoney(mine.filter((payout) => payout.status === 'requested').reduce((sum, payout) => sum + payout.amountHkd, 0));
  const balanceHkd = roundMoney(tierHkd + referralHkd - spentHkd - paidOutHkd);
  return { tierHkd, referralHkd, spentHkd, paidOutHkd, payoutPendingHkd, heldHkd, balanceHkd, availableHkd: roundMoney(balanceHkd - heldHkd - payoutPendingHkd) };
}
