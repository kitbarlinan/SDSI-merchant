'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { IncomeWalletCard } from '@/components/orders/IncomeWalletCard';
import { refCodeOf } from '@/lib/accounts';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { formatDate, formatHkd } from '@/lib/format';
import { useAppData } from '@/lib/store';

/** Income wallet: tier income and referral bonus. The admin can open anyone's wallet. */
export function WalletView() {
  const { user } = useAuth();
  const { users, packageSales, orders, costing, earningPayouts, markEarningPaid } = useAppData();
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  // Only people who are a referrer of a merchant have a wallet to open here.
  const referrerIds = new Set([
    ...(costing.referrals ?? []).map((link) => link.userId),
    ...(costing.linkHolderIds ?? []),
    ...(costing.rootSponsorId ? [costing.rootSponsorId] : []),
  ]);
  const [who, setWho] = useState('');
  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const shown = isAdmin && who ? users.find((candidate) => candidate.id === who) ?? user : user;

  return (
    <div className="space-y-6">
      <PageHeader title="My income" description="Your referral bonus and tier income, and where each peso comes from." />
      {isAdmin ? (
        <label className="block text-xs font-medium text-slate-500">
          Whose wallet
          <select value={who} onChange={(event) => setWho(event.target.value)} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            <option value="">Mine ({user.name})</option>
            {users.filter((candidate) => candidate.id !== user.id && referrerIds.has(candidate.id)).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.role === 'customer' ? 'reseller' : candidate.role})</option>
            ))}
          </select>
        </label>
      ) : null}
      {isAdmin ? (
        <Card title="Payout requests" subtitle="Resellers and referrers who asked for their wallet money in the weekly payout. Send the money, then mark it paid.">
          {earningPayouts.filter((payout) => payout.status === 'requested').length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No requests waiting.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
              {earningPayouts.filter((payout) => payout.status === 'requested').map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>{payout.userName}<span className="ml-2 text-xs text-slate-500">{payout.id} · {formatDate(payout.requestedAt)}</span></span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{formatHkd(payout.amountHkd)}</span>
                    <input placeholder="Bank reference" value={refs[payout.id] ?? ''} onChange={(event) => setRefs({ ...refs, [payout.id]: event.target.value })} className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                    <button type="button" onClick={async () => { const result = await markEarningPaid(user, payout.id, refs[payout.id] ?? ''); setError(result.ok ? '' : result.error); }} className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">Mark paid</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
          {earningPayouts.some((payout) => payout.status === 'paid') ? (
            <p className="mt-3 text-xs text-slate-500">Paid so far: {formatHkd(earningPayouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amountHkd, 0))} in {earningPayouts.filter((payout) => payout.status === 'paid').length} payout(s).</p>
          ) : null}
        </Card>
      ) : null}
      <IncomeWalletCard userId={shown.id} sales={packageSales} orders={orders} refCode={referrerIds.has(shown.id) || shown.refCode ? refCodeOf(shown) : undefined} />
    </div>
  );
}
