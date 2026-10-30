/**
 * Weekly remittances. Pure helpers, no UI.
 *
 * The cutoff is weekly, Monday to Sunday. A week can be closed once it is over. Closing it lists every
 * delivered order of the week under its merchant and locks those orders. The admin then releases the
 * payout, with the actual SF (PH to HK) SDSI advanced deducted.
 *
 * The merchant's wallet is not their sales. It is what SDSI still owes them: the net payable of
 * delivered orders minus what has been released.
 */
import { roundMoney } from './format';
import { addDays, weekdayOf } from './period';
import { orderTotal } from './orders';
import type { Order, Remittance } from './types';

/** Monday of the week that contains the date. */
export const weekStartOf = (date: string): string => addDays(date, -((weekdayOf(date) + 6) % 7));
export const weekEndOf = (weekStart: string): string => addDays(weekStart, 6);
/** The payout of a week is due the Monday after it ends (week Oct 12 to 18 is paid on Oct 19). */
export const payoutDueDate = (weekStart: string): string => addDays(weekStart, 7);

const deliveredDay = (order: Order): string | null =>
  order.status === 'delivered' && order.deliveredAt ? order.deliveredAt.slice(0, 10) : null;

export const deliveredInWeek = (orders: Order[], weekStart: string): Order[] => {
  const end = weekEndOf(weekStart);
  return orders.filter((order) => {
    const day = deliveredDay(order);
    return day !== null && day >= weekStart && day <= end;
  });
};

/** Orders already listed in a remittance (closed or released). They can no longer be reversed. */
export const remittedOrderIds = (remittances: Remittance[]): Set<string> =>
  new Set(remittances.flatMap((remittance) => remittance.orderIds));

/** Completed weeks (Monday starts) that have delivered orders and were not closed yet, oldest first. */
export function closableWeeks(orders: Order[], remittances: Remittance[], today: string): string[] {
  const closed = new Set(remittances.map((remittance) => remittance.weekStart));
  const weeks = new Set<string>();
  for (const order of orders) {
    const day = deliveredDay(order);
    if (!day) continue;
    const start = weekStartOf(day);
    if (weekEndOf(start) < today && !closed.has(start)) weeks.add(start);
  }
  return [...weeks].sort();
}

/** One remittance per merchant that had deliveries in the week. */
export function buildWeekRemittances(
  orders: Order[],
  weekStart: string,
  firstNumber: number,
  closedBy: string,
  closedAt: string,
): Remittance[] {
  const byMerchant = new Map<string, Order[]>();
  for (const order of deliveredInWeek(orders, weekStart)) {
    byMerchant.set(order.merchantId, [...(byMerchant.get(order.merchantId) ?? []), order]);
  }
  return [...byMerchant.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([merchantId, list], index) => {
      const netPayable = roundMoney(list.reduce((sum, order) => sum + orderTotal(order), 0));
      return {
        id: `RMT-${String(firstNumber + index).padStart(6, '0')}`,
        merchantId,
        weekStart,
        weekEnd: weekEndOf(weekStart),
        orderIds: list.map((order) => order.id).sort(),
        netPayable,
        deductionPhp: 0,
        deductionNote: '',
        adjustmentPhp: 0,
        adjustmentNote: '',
        payoutPhp: netPayable,
        status: 'pending' as const,
        closedBy,
        closedAt,
      };
    });
}

export interface Wallet {
  /** Net payable of every delivered order, since the start. */
  earned: number;
  /** What SDSI still owes: earned minus what was released (deductions included). */
  balance: number;
  /** Cash actually paid out to the merchant. */
  paidOut: number;
  /** SF advanced by SDSI and deducted so far. */
  deducted: number;
  /** Corrections of earlier payouts, added or taken away. */
  adjustments: number;
  /** Payouts closed but not released yet. */
  awaitingRelease: number;
}

export function walletOf(merchantId: string, orders: Order[], remittances: Remittance[]): Wallet {
  const earned = roundMoney(
    orders
      .filter((order) => order.merchantId === merchantId && order.status === 'delivered')
      .reduce((sum, order) => sum + orderTotal(order), 0),
  );
  const mine = remittances.filter((remittance) => remittance.merchantId === merchantId);
  const released = mine.filter((remittance) => remittance.status === 'released');
  const releasedNet = released.reduce((sum, remittance) => sum + remittance.netPayable, 0);
  return {
    earned,
    balance: roundMoney(earned - releasedNet),
    paidOut: roundMoney(released.reduce((sum, remittance) => sum + remittance.payoutPhp, 0)),
    deducted: roundMoney(released.reduce((sum, remittance) => sum + remittance.deductionPhp, 0)),
    adjustments: roundMoney(released.reduce((sum, remittance) => sum + remittance.adjustmentPhp, 0)),
    awaitingRelease: roundMoney(
      mine.filter((remittance) => remittance.status !== 'released').reduce((sum, remittance) => sum + remittance.payoutPhp, 0),
    ),
  };
}

/** A week that is not closed yet: still running, or finished and waiting for the cutoff. */
export interface OpenWeek {
  merchantId: string;
  weekStart: string;
  weekEnd: string;
  orderIds: string[];
  /** Net SRP so far. The SF advance is not deducted yet. */
  netPayable: number;
  /** True for the week that is still going on. */
  running: boolean;
}

/** Delivered orders not in any remittance yet, grouped by merchant and week. Newest first. */
export function openWeeks(orders: Order[], remittances: Remittance[], today: string): OpenWeek[] {
  const taken = remittedOrderIds(remittances);
  const groups = new Map<string, Order[]>();
  for (const order of orders) {
    const day = deliveredDay(order);
    if (!day || taken.has(order.id)) continue;
    const key = `${order.merchantId}|${weekStartOf(day)}`;
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const [merchantId, weekStart] = key.split('|');
      return {
        merchantId,
        weekStart,
        weekEnd: weekEndOf(weekStart),
        orderIds: list.map((order) => order.id).sort(),
        netPayable: roundMoney(list.reduce((sum, order) => sum + orderTotal(order), 0)),
        running: weekEndOf(weekStart) >= today,
      };
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.merchantId.localeCompare(b.merchantId));
}
