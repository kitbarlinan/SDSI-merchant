'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { InviteActions } from '@/components/team/InviteActions';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatHkd } from '@/lib/format';
import { refCodeOf } from '@/lib/accounts';
import { referralRows } from '@/lib/referral';
import { resellerLedger, resellerSummaries } from '@/lib/reseller';
import { useAppData } from '@/lib/store';

/** Admin and cashier: every reseller, what they got in discount and tier income, and the split of each purchase. */
export function ResellersView() {
  const { user } = useAuth();
  const { users, items, orders, packageSales, costing, outbox, merchants, setMerchantReferrer, setReferralLinks } = useAppData();
  const { settings } = costing;
  const nameOf = (id: string) => users.find((candidate) => candidate.id === id)?.name ?? id;
  const ledger = useMemo(() => resellerLedger(orders, packageSales, items, settings.markupPct, settings.referrerPct + settings.systemFeePct), [orders, packageSales, items, settings.markupPct, settings.referrerPct, settings.systemFeePct]);
  const summaries = useMemo(() => resellerSummaries(users, ledger, packageSales, orders), [users, ledger, packageSales, orders]);
  if (!user) return null;
  const showPeso = user.role === 'admin';

  const counted = ledger.filter((row) => row.counted);
  const sum = (pick: (row: (typeof ledger)[number]) => number) => counted.reduce((total, row) => total + pick(row), 0);
  const tierPaid = sum((row) => row.tiers.reduce((t, tier) => t + tier.php, 0));
  const tierPct = settings.tierL1Pct + settings.tierL2Pct;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resellers"
        description={`Buying the reseller package (${formatHkd(settings.packageHkd)}) makes someone a reseller. Every purchase after that has ${settings.resellerDiscountPct}% off, and ${tierPct}% of the SRP goes to the 2 sponsors above (L1 ${settings.tierL1Pct}% · L2 ${settings.tierL2Pct}%). All of it is charged to the merchant. TheYellowBasket keeps its ${settings.markupPct}% top-up as is.`}
      />

      {showPeso ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="TheYellowBasket top-up" value={formatCurrency(sum((row) => row.topUpPhp))} hint={`${settings.markupPct}% of the SRP`} />
          <StatCard label="Reseller discount" value={formatCurrency(sum((row) => row.discountPhp))} hint={`${settings.resellerDiscountPct}% of the SRP`} />
          <StatCard label="Tier income paid" value={formatCurrency(tierPaid)} hint={`up to ${tierPct}% of the SRP`} />
          <StatCard label="Charged to merchants" value={formatCurrency(sum((row) => row.discountPhp) + tierPaid)} hint="discount + tier income" variant="primary" />
        </div>
      ) : null}

      {user.role === 'admin' ? (
        <Card title="Referral links" subtitle="Who invites resellers. A reseller with no sponsor lands under the top sponsor, so they always have an upline. Everyone listed gets their own code and link, and earns tier income on the resellers who join through them.">
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-500">
              Top sponsor (default upline)
              <select
                aria-label="Top sponsor"
                value={costing.rootSponsorId ?? ''}
                onChange={(event) => void setReferralLinks(user, { rootSponsorId: event.target.value || null, linkHolderIds: costing.linkHolderIds ?? [] })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
              >
                <option value="">Nobody</option>
                {users.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.role === 'customer' ? 'reseller' : candidate.role})</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Add a person with their own link
              <select
                aria-label="Add link holder"
                value=""
                onChange={(event) => event.target.value && void setReferralLinks(user, { rootSponsorId: costing.rootSponsorId ?? null, linkHolderIds: [...(costing.linkHolderIds ?? []), event.target.value] })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
              >
                <option value="">Choose…</option>
                {users.filter((candidate) => !(costing.linkHolderIds ?? []).includes(candidate.id)).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.role === 'customer' ? 'reseller' : candidate.role})</option>
                ))}
              </select>
            </label>
          </div>
          {(() => {
            const holders = [...new Set([...(costing.rootSponsorId ? [costing.rootSponsorId] : []), ...(costing.linkHolderIds ?? [])])]
              .map((id) => users.find((candidate) => candidate.id === id))
              .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
            return holders.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No one yet. Pick a top sponsor or add a person above.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
                {holders.map((holder) => (
                  <li key={holder.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <span className="font-medium text-slate-800">{holder.name}</span>
                      {costing.rootSponsorId === holder.id ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Top sponsor</span> : null}
                      <span className="ml-2 text-xs text-slate-500">{users.filter((candidate) => candidate.sponsorId === holder.id).length} invited</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-700">{refCodeOf(holder)}</span>
                      <span className="font-mono text-xs text-slate-500">/become-a-reseller?ref={refCodeOf(holder)}</span>
                      {(costing.linkHolderIds ?? []).includes(holder.id) ? (
                        <button type="button" onClick={() => void setReferralLinks(user, { rootSponsorId: costing.rootSponsorId ?? null, linkHolderIds: (costing.linkHolderIds ?? []).filter((id) => id !== holder.id) })} className="text-xs font-semibold text-rose-600 hover:underline">Remove</button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </Card>
      ) : null}

      {user.role === 'admin' ? (
        <Card title="Referral bonus" subtitle={`Whoever brought a merchant in earns ${settings.referrerPct}% of that merchant's Net SRP on every delivered order. Pick the referrer of each merchant.`}>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Merchant</th>
                  <th className="py-2 pr-4 font-medium">Referrer</th>
                  <th className="py-2 pr-4 text-right font-medium">Delivered orders</th>
                  <th className="py-2 pr-4 text-right font-medium">Bonus earned</th>
                  <th className="py-2 text-right font-medium">On the way</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {merchants.map((merchant) => {
                  const link = (costing.referrals ?? []).find((candidate) => candidate.merchantId === merchant.id);
                  const row = link ? referralRows(costing, merchants, orders, link.userId).find((r) => r.merchantId === merchant.id) : undefined;
                  return (
                    <tr key={merchant.id}>
                      <td className="py-2 pr-4 font-medium text-slate-800">{merchant.name}</td>
                      <td className="py-2 pr-4">
                        <select
                          aria-label={`Referrer of ${merchant.name}`}
                          value={link?.userId ?? ''}
                          onChange={(event) => void setMerchantReferrer(user, merchant.id, event.target.value || null)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                        >
                          <option value="">No referrer</option>
                          {users.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.role === 'customer' ? 'reseller' : candidate.role})</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4 text-right">{row?.orders ?? '—'}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-emerald-700">{row ? formatCurrency(row.earnedPhp) : '—'}</td>
                      <td className="py-2 text-right text-slate-500">{row ? formatCurrency(row.pendingPhp) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card title="Resellers" subtitle="Delivered orders only. The package counts once it is paid.">
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Reseller</th>
                <th className="py-2 pr-4 font-medium">Sponsor</th>
                <th className="py-2 pr-4 font-medium">Package</th>
                <th className="py-2 pr-4 text-right font-medium">Orders</th>
                {user.role === 'admin' ? <th className="py-2 pr-4 font-medium">Login email</th> : null}
                {showPeso ? (
                  <>
                    <th className="py-2 pr-4 text-right font-medium">Bought (SRP)</th>
                    <th className="py-2 pr-4 text-right font-medium">Discount received</th>
                    <th className="py-2 pr-4 text-right font-medium">Tier L1</th>
                    <th className="py-2 pr-4 text-right font-medium">Tier L2</th>
                    <th className="py-2 text-right font-medium">Tier total</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map((row) => (
                <tr key={row.user.id}>
                  <td className="py-2 pr-4 font-medium text-slate-900">{row.user.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{row.user.sponsorId ? nameOf(row.user.sponsorId) : '—'}</td>
                  <td className="py-2 pr-4">
                    {row.active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active · {formatDate(row.packageDate!)}</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Not bought yet</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.orders}</td>
                  {user.role === 'admin' ? (
                    <td className="py-2 pr-4">
                      {row.user.joined ? <span className="text-xs font-medium text-emerald-700">Active</span> : <InviteActions userId={row.user.id} email={row.user.email} />}
                      {row.user.email ? <span className="block text-xs text-slate-500">{row.user.email}</span> : null}
                    </td>
                  ) : null}
                  {showPeso ? (
                    <>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.purchasesPhp)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-emerald-700">{formatCurrency(row.discountPhp)}</td>
                      {row.tierByLevel.map((value, index) => (
                        <td key={index} className="py-2 pr-4 text-right tabular-nums">{formatCurrency(value)}</td>
                      ))}
                      <td className="py-2 text-right font-semibold tabular-nums text-emerald-700">{formatCurrency(row.tierTotal)}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showPeso ? (
        <Card title="Emails sent (demo)" subtitle="When the cashier delivers a package, the buyer gets their temporary username and password by email. In the demo nothing is really sent, so you can read it here. Real sending comes with the database.">
          {outbox.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing sent yet. Apply on /become-a-reseller, then deliver the order as the cashier.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {outbox.map((mail) => (
                <li key={mail.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">
                    To {mail.to} · {mail.subject}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-600">{mail.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {showPeso ? (
        <Card title="Breakdown per purchase" subtitle="Where the top-up goes on each purchase. Pending orders are shown but not counted.">
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Purchase</th>
                  <th className="py-2 pr-4 font-medium">Reseller</th>
                  <th className="py-2 pr-4 text-right font-medium">SRP</th>
                  <th className="py-2 pr-4 text-right font-medium">Top-up</th>
                  <th className="py-2 pr-4 text-right font-medium">Reseller {settings.resellerDiscountPct}%</th>
                  <th className="py-2 pr-4 font-medium">Tier income</th>
                  <th className="py-2 text-right font-medium">TheYellowBasket top-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((row) => (
                  <tr key={`${row.kind}-${row.ref}`} className={row.counted ? '' : 'text-slate-400'}>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(row.date)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="font-mono text-xs">{row.ref}</span> · {row.kind}
                      {row.counted ? '' : ' · pending'}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{row.buyerName}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.srpPhp)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.topUpPhp)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.discountPhp)}</td>
                    <td className="py-2 pr-4 text-xs">
                      {row.tiers.length === 0
                        ? 'none'
                        : row.tiers.map((tier) => `L${tier.level} ${nameOf(tier.userId)} ${formatCurrency(tier.php)}`).join(' · ')}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(row.netPhp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
