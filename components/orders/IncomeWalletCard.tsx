'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { bankTransfer } from '@/lib/costing';
import { Card } from '@/components/ui/Card';
import { formatDate, formatHkd } from '@/lib/format';
import { tierIncome } from '@/lib/orders';
import { referralRows } from '@/lib/referral';
import { useAppData } from '@/lib/store';
import { walletHkd } from '@/lib/wallet';
import type { Order, PackageSale } from '@/lib/types';

/** A reseller's income wallet: the total, and where each peso came from (tier income, referral bonus). */
export function IncomeWalletCard({ userId, sales, orders, refCode }: { userId: string; sales: PackageSale[]; orders: Order[]; refCode?: string }) {
  const { costing, merchants, earningPayouts, requestEarningPayout, cancelEarningPayout } = useAppData();
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const tier = useMemo(() => tierIncome(sales, orders, userId, costing.settings.payoutFxPhpPerHkd), [sales, orders, userId, costing.settings.payoutFxPhpPerHkd]);
  const wallet = useMemo(() => walletHkd(userId, orders, sales, costing, earningPayouts), [userId, orders, sales, costing, earningPayouts]);
  const mine = user?.id === userId;
  const payouts = earningPayouts.filter((payout) => payout.userId === userId);
  const cashOut = async () => {
    if (!user) return;
    const result = await requestEarningPayout(user, Number(amount));
    setMessage(result.ok ? { ok: true, text: 'Requested. It will be sent in the weekly payout.' } : { ok: false, text: result.error });
    if (result.ok) setAmount('');
  };
  const referral = useMemo(() => referralRows(costing, merchants, orders, userId), [costing, merchants, orders, userId]);
  const referralPending = referral.reduce((n, r) => n + r.pendingHkd, 0);
  const pending = tier.pendingHkd + referralPending;
  const { tierL1Pct, tierL2Pct, referrerPct } = costing.settings;

  const source = (title: string, hint: string, earned: number, onTheWay: number, tone: string) => (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500">{hint}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{formatHkd(earned)}</p>
      <p className="text-xs text-slate-500">+ {formatHkd(onTheWay)} on the way</p>
    </div>
  );

  return (
    <Card title="My income" subtitle="Everything you earn, and where it comes from. Orders count once delivered.">
      {refCode ? (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Your referral code: <span className="font-mono font-semibold">{refCode}</span>. Share{' '}
          <span className="font-mono">/become-a-reseller?ref={refCode}</span> so new resellers land under you.
        </p>
      ) : null}

      <div className="mt-3 rounded-2xl bg-emerald-500 px-5 py-4 text-emerald-950">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-950/70">Wallet balance</p>
        <p className="text-3xl font-semibold text-emerald-950">{formatHkd(wallet.balanceHkd)}</p>
        <p className="text-xs text-emerald-950/70">
          Earned {formatHkd(wallet.tierHkd + wallet.referralHkd)}
          {wallet.spentHkd > 0 ? ` − paid from wallet ${formatHkd(wallet.spentHkd)}` : ''}
          {wallet.paidOutHkd > 0 ? ` − cashed out ${formatHkd(wallet.paidOutHkd)}` : ''} · + {formatHkd(pending)} on the way (not delivered yet)
          {wallet.payoutPendingHkd > 0 ? ` · ${formatHkd(wallet.payoutPendingHkd)} waiting for the weekly payout` : ''}
          {wallet.heldHkd > 0 ? ` · ${formatHkd(wallet.heldHkd)} held for open orders` : ''}
        </p>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-800">Weekly payout</p>
        <p className="text-xs text-slate-500">
          Leave your balance here to buy products, or ask for part of it in the weekly payout. What you spent from the wallet is already taken out.
          You can cash out up to {formatHkd(Math.max(0, wallet.availableHkd))}. Minimum {formatHkd(costing.settings.payoutMinHkd)}; the bank charge of {formatHkd(costing.settings.bankFeeHkd)} per transfer (up to {formatHkd(costing.settings.bankMaxHkd)} each) is taken out of the payout. Request before Sunday: it is sent the Monday after.
        </p>
        {mine && user && user.role !== 'customer' ? (
          <Link href="/wallet/buy" className="mt-2 inline-block rounded-xl border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700">
            Buy for myself (pay from wallet)
          </Link>
        ) : null}
        {mine ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-500">
              Amount (HKD)
              <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-36 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            </label>
            <button type="button" onClick={() => setAmount(String(Math.max(0, wallet.availableHkd)))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">All</button>
            <button type="button" disabled={!(Number(amount) >= costing.settings.payoutMinHkd)} onClick={() => void cashOut()} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Request payout</button>
          </div>
        ) : null}
        {mine && Number(amount) >= costing.settings.payoutMinHkd ? (
          <p className="mt-2 text-xs text-slate-600">
            You receive <strong>{formatHkd(bankTransfer(Number(amount), costing.settings).netHkd)}</strong> (bank charge {formatHkd(bankTransfer(Number(amount), costing.settings).feeHkd)}).
          </p>
        ) : null}
        {message ? <p className={`mt-2 text-sm ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{message.text}</p> : null}
        {payouts.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {payouts.slice(0, 10).map((payout) => (
              <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {payout.id} · {formatDate(payout.requestedAt)}
                  <span className="ml-2 text-xs text-slate-500">
                    {payout.status === 'requested' ? `Sent ${payout.releaseOn ? formatDate(payout.releaseOn) : 'in the weekly payout'}${payout.netHkd !== undefined ? ` · you receive ${formatHkd(payout.netHkd)} after the bank charge` : ''}` : payout.status === 'paid' ? `Paid ${payout.paidAt ? formatDate(payout.paidAt) : ''}${payout.reference ? ` · ${payout.reference}` : ''}` : 'Cancelled'}
                  </span>
                </span>
                <span className="flex items-center gap-3 font-semibold text-slate-900">
                  {formatHkd(payout.amountHkd)}
                  {payout.status === 'requested' && user && (mine || user.role === 'admin') ? (
                    <button type="button" onClick={() => void cancelEarningPayout(user, payout.id)} className="text-xs font-normal text-rose-600 underline">Cancel</button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {source('Tier income', `${tierL1Pct}% from your direct team, ${tierL2Pct}% from the level below`, wallet.tierHkd, tier.pendingHkd, 'border-sky-200 bg-sky-50/60')}
        {source('Referral bonus', `${referrerPct}% of the sales of merchants you brought in`, wallet.referralHkd, referralPending, 'border-amber-200 bg-amber-50/60')}
      </div>

      {referral.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-800">Merchants you brought in</p>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {referral.map((row) => (
              <li key={row.merchantId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {row.merchantName}
                  <span className="ml-2 text-xs text-slate-500">{row.orders} delivered order{row.orders === 1 ? '' : 's'}</span>
                </span>
                <span className="font-semibold text-emerald-700">
                  {formatHkd(row.earnedHkd)}
                  {row.pendingHkd > 0 ? <span className="ml-2 text-xs font-normal text-slate-500">+ {formatHkd(row.pendingHkd)} on the way</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-800">Tier income from your team</p>
        {tier.rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No purchases in your team yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {tier.rows.slice(0, 10).map((row) => (
              <li key={`${row.ref}-${row.level}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {row.name}
                  <span className="ml-2 text-xs text-slate-500">
                    {row.kind === 'package' ? 'Package' : row.ref} · Level {row.level} · {formatDate(row.date)}
                    {row.earned ? '' : ' · on the way'}
                  </span>
                </span>
                <span className={`font-semibold ${row.earned ? 'text-emerald-700' : 'text-slate-500'}`}>{formatHkd(row.hkd)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
