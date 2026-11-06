import { roundMoney } from './format';
import type { CostingState, ReferralLink } from './costing';
import { orderTotal } from './orders';
import type { Merchant, Order } from './types';

export interface ReferralRow {
  merchantId: string;
  merchantName: string;
  orders: number;
  earnedPhp: number;
  pendingPhp: number;
}

/** Stats of one referral link: 5% (or the set %) of the Net SRP of the merchant's orders. Delivered = earned, still open = on the way. */
export function referralStats(orders: Order[], merchantId: string, pct: number): NonNullable<ReferralLink['stats']> {
  let delivered = 0;
  let open = 0;
  let count = 0;
  for (const order of orders) {
    if (order.merchantId !== merchantId || order.status === 'cancelled' || order.status === 'rts') continue;
    if (order.status === 'delivered') {
      delivered += orderTotal(order);
      count += 1;
    } else open += orderTotal(order);
  }
  return { orders: count, earnedPhp: roundMoney((delivered * pct) / 100), pendingPhp: roundMoney((open * pct) / 100) };
}

/** The merchants a person brought in, with what they earned from each. Uses the server's numbers when present. */
export function referralRows(costing: CostingState, merchants: Merchant[], orders: Order[], userId: string): ReferralRow[] {
  return (costing.referrals ?? [])
    .filter((link) => link.userId === userId)
    .map((link) => {
      const stats = link.stats ?? referralStats(orders, link.merchantId, costing.settings.referrerPct);
      return { merchantId: link.merchantId, merchantName: merchants.find((m) => m.id === link.merchantId)?.name ?? link.merchantId, ...stats };
    });
}
