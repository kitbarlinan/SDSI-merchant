'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { IncomeWalletCard } from '@/components/orders/IncomeWalletCard';
import { refCodeOf } from '@/lib/accounts';
import { useAuth } from '@/lib/auth';
import { useAppData } from '@/lib/store';

/** Income wallet: tier income and referral bonus. The admin can open anyone's wallet. */
export function WalletView() {
  const { user } = useAuth();
  const { users, packageSales, orders, costing } = useAppData();
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
      <IncomeWalletCard userId={shown.id} sales={packageSales} orders={orders} refCode={referrerIds.has(shown.id) || shown.refCode ? refCodeOf(shown) : undefined} />
    </div>
  );
}
