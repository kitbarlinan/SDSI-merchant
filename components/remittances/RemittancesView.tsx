'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { MerchantFilter } from '@/components/ui/MerchantFilter';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { MOCK_TODAY } from '@/lib/mock-data';
import { orderTotal } from '@/lib/orders';
import { closableWeeks, openWeeks, walletOf, weekEndOf } from '@/lib/remittance';
import { useAppData } from '@/lib/store';
import type { Remittance } from '@/lib/types';
import { useToday } from '@/lib/use-today';

const weekLabel = (start: string, end: string) => `${formatDate(start)} to ${formatDate(end)}`;

function RemittanceRow({ remittance, showMerchant }: { remittance: Remittance; showMerchant: boolean }) {
  const { user } = useAuth();
  const { orders, merchants, releaseRemittance } = useAppData();
  const today = useToday() || MOCK_TODAY;
  const [open, setOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [date, setDate] = useState('');
  const [deduction, setDeduction] = useState('');
  const [note, setNote] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const merchant = merchants.find((candidate) => candidate.id === remittance.merchantId);
  const list = useMemo(
    () => remittance.orderIds.map((id) => orders.find((order) => order.id === id)).filter((order) => !!order),
    [remittance.orderIds, orders],
  );
  const released = remittance.status === 'released';
  const deductionValue = deduction.trim() === '' ? 0 : Number(deduction);
  const adjustmentValue = adjustment.trim() === '' ? 0 : Number(adjustment);
  const payoutPreview =
    remittance.netPayable -
    (Number.isFinite(deductionValue) ? deductionValue : 0) +
    (Number.isFinite(adjustmentValue) ? adjustmentValue : 0);

  if (!user) return null;

  function release() {
    if (!user) return;
    const result = releaseRemittance(user, remittance.id, {
      releasedDate: date || today,
      deductionPhp: deductionValue,
      deductionNote: note,
      adjustmentPhp: adjustmentValue,
      adjustmentNote,
      reference,
    });
    if (!result.ok) return setError(result.error);
    setError(null);
    setReleasing(false);
  }

  return (
    <li className="px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            Week {weekLabel(remittance.weekStart, remittance.weekEnd)}
            {showMerchant && merchant ? (
              <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-normal text-slate-600">
                <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
                {merchant.name}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-slate-500">
            <span className="font-mono">{remittance.id}</span> · {formatNumber(remittance.orderIds.length)} delivered orders
            {released && remittance.releasedDate
              ? ` · released ${formatDate(remittance.releasedDate)} · ref ${remittance.reference}`
              : ' · closed, waiting for release'}
          </p>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-xs text-slate-500">Net payable</p>
            <p className="font-medium">{formatCurrency(remittance.netPayable)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">SF advance</p>
            <p className="font-medium text-rose-700">
              {remittance.deductionPhp > 0 ? `− ${formatCurrency(remittance.deductionPhp)}` : released ? '—' : 'not set'}
            </p>
          </div>
          {released && remittance.adjustmentPhp !== 0 ? (
            <div>
              <p className="text-xs text-slate-500">Adjustment</p>
              <p className="font-medium text-blue-700">
                {remittance.adjustmentPhp > 0 ? '+ ' : '− '}
                {formatCurrency(Math.abs(remittance.adjustmentPhp))}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-slate-500">Payout</p>
            <p className="font-semibold text-emerald-700">
              {released ? formatCurrency(remittance.payoutPhp) : formatCurrency(remittance.netPayable)}
              {released ? '' : '*'}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              released ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {released ? 'Released' : 'Pending release'}
          </span>
        </div>
      </div>

      {remittance.deductionNote ? (
        <p className="mt-1 text-xs text-slate-500">SF advance: {remittance.deductionNote}</p>
      ) : null}

      {remittance.adjustmentNote ? (
        <p className="mt-1 text-xs text-slate-500">Adjustment: {remittance.adjustmentNote}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <button type="button" onClick={() => setOpen((current) => !current)} className="font-medium text-emerald-700 hover:underline">
          {open ? 'Hide orders' : 'Show orders'}
        </button>
        {user.role === 'admin' && !released && !releasing ? (
          <button type="button" onClick={() => setReleasing(true)} className="font-semibold text-blue-700 hover:underline">
            Release payout
          </button>
        ) : null}
      </div>

      {releasing ? (
        <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-slate-600">
              Release date
              <input
                type="date"
                value={date || today}
                min={weekEndOf(remittance.weekStart)}
                max={today}
                onChange={(event) => setDate(event.target.value)}
                className={`mt-1 ${inputClass(false)}`}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              SF advance to deduct (PHP)
              <input
                type="number"
                min={0}
                step="0.01"
                value={deduction}
                onChange={(event) => setDeduction(event.target.value)}
                placeholder="0"
                className={`mt-1 ${inputClass(false)}`}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 lg:col-span-2">
              What is it? (actual SF PH to HK advanced)
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Freight Manila to HK, 3 batches"
                className={`mt-1 ${inputClass(false)}`}
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Adjustment of an earlier payout (PHP, + or −)
              <input
                type="number"
                step="0.01"
                value={adjustment}
                onChange={(event) => setAdjustment(event.target.value)}
                placeholder="0"
                className={`mt-1 ${inputClass(false)}`}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 lg:col-span-3">
              Adjustment note (which payout is being corrected)
              <input
                type="text"
                value={adjustmentNote}
                onChange={(event) => setAdjustmentNote(event.target.value)}
                placeholder="e.g. SF advance of RMT-000012 was ₱20 too high"
                className={`mt-1 ${inputClass(false)}`}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">
              Payment reference
              <input
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Bank reference no."
                className={`mt-1 ${inputClass(false)}`}
              />
            </label>
          </div>
          <p className="text-sm text-slate-700">
            Net payable {formatCurrency(remittance.netPayable)} − SF advance {formatCurrency(Number.isFinite(deductionValue) ? deductionValue : 0)} ± adjustment {formatCurrency(Number.isFinite(adjustmentValue) ? adjustmentValue : 0)} ={' '}
            <span className="font-semibold text-emerald-700">payout {formatCurrency(payoutPreview)}</span>
          </p>
          {error ? (
            <p role="alert" className="text-xs text-rose-600">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={release}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Release payout
            </button>
            <button type="button" onClick={() => setReleasing(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <ul className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 text-xs">
          {list.map((order) => (
            <li key={order!.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="font-mono">{order!.id}</span>
              <span className="text-slate-500">{order!.customerName ?? 'Walk-in client'}</span>
              <span className="text-slate-500">{order!.deliveredAt ? formatDate(order!.deliveredAt.slice(0, 10)) : ''}</span>
              <span className="font-medium">{formatCurrency(orderTotal(order!))}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function RemittancesView() {
  const { user } = useAuth();
  const { orders, merchants, remittances, closeWeek } = useAppData();
  const today = useToday() || MOCK_TODAY;
  const isMerchant = user?.role === 'merchant';
  const [merchantId, setMerchantId] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const scopeId = isMerchant ? (user?.merchantId ?? '') : merchantId;
  const scopedRemittances = useMemo(
    () => (scopeId === 'all' ? remittances : remittances.filter((remittance) => remittance.merchantId === scopeId)),
    [remittances, scopeId],
  );

  const wallet = useMemo(() => {
    const ids = scopeId === 'all' ? merchants.map((merchant) => merchant.id) : [scopeId];
    const total = { earned: 0, balance: 0, paidOut: 0, deducted: 0, adjustments: 0, awaitingRelease: 0 };
    for (const id of ids) {
      const w = walletOf(id, orders, remittances);
      total.earned += w.earned;
      total.balance += w.balance;
      total.paidOut += w.paidOut;
      total.deducted += w.deducted;
      total.adjustments += w.adjustments;
      total.awaitingRelease += w.awaitingRelease;
    }
    return total;
  }, [scopeId, merchants, orders, remittances]);

  const open = useMemo(
    () => openWeeks(orders, remittances, today).filter((week) => scopeId === 'all' || week.merchantId === scopeId),
    [orders, remittances, today, scopeId],
  );
  const toClose = useMemo(() => closableWeeks(orders, remittances, today), [orders, remittances, today]);

  if (!user) return null;
  const actor = user;

  function close(weekStart: string) {
    const result = closeWeek(actor, weekStart);
    if (!result.ok) {
      setError(result.error);
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(`Week closed. ${result.value.length} remittance${result.value.length === 1 ? '' : 's'} created. Those orders are now locked.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isMerchant ? 'My Remittances' : 'Remittances'}
        description="Weekly payout, cutoff Monday to Sunday. The wallet is what SDSI still owes the merchant. It is not the merchant's sales."
      />

      {!isMerchant ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <MerchantFilter merchants={merchants} value={merchantId} onChange={setMerchantId} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="wallet"
          label="Wallet balance"
          value={formatCurrency(wallet.balance)}
          hint="Net payable not yet released"
        />
        <StatCard
          icon="clock"
          label="Closed, awaiting release"
          value={formatCurrency(wallet.awaitingRelease)}
          hint="Payout after the SF advance"
        />
        <StatCard
          icon="check"
          label="Total paid out"
          value={formatCurrency(wallet.paidOut)}
          hint="Released to the merchant"
        />
        <StatCard
          icon="truck"
          label="SF advance deducted"
          value={formatCurrency(wallet.deducted)}
          hint="Actual SF PH to HK, advanced by SDSI"
        />
      </div>

      {user.role === 'admin' ? (
        <Card title="Weekly cutoff" subtitle="Close a finished week to create each merchant's remittance. Closed weeks are locked: no undo.">
          {toClose.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">All finished weeks are closed.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {toClose.map((weekStart) => (
                <li key={weekStart} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>Week {weekLabel(weekStart, weekEndOf(weekStart))}</span>
                  <button
                    type="button"
                    onClick={() => close(weekStart)}
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Close week
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-rose-600">
              {error}
            </p>
          ) : null}
          {notice ? <p className="mt-2 text-xs text-emerald-700">{notice}</p> : null}
        </Card>
      ) : null}

      <Card
        flush
        title="Open"
        subtitle="Delivered orders not closed yet. The SF advance is not deducted here; it is set when the payout is released."
      >
        {open.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">Nothing open.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map((week) => {
              const merchant = merchants.find((candidate) => candidate.id === week.merchantId);
              return (
                <li key={`${week.merchantId}-${week.weekStart}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">
                      Week {weekLabel(week.weekStart, week.weekEnd)}
                      {!isMerchant && merchant ? (
                        <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-normal text-slate-600">
                          <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
                          {merchant.name}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">{formatNumber(week.orderIds.length)} delivered orders</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-slate-500">Net payable so far</p>
                      <p className="font-medium">{formatCurrency(week.netPayable)}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {week.running ? 'Week running' : 'Ready to close'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        flush
        title="Closed"
        subtitle="Closed weeks, newest first. * Pending payouts show the net payable until the SF advance is set at release."
      >
        {scopedRemittances.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No remittances yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {scopedRemittances.map((remittance) => (
              <RemittanceRow key={remittance.id} remittance={remittance} showMerchant={!isMerchant} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
