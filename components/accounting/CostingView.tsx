'use client';

import { useMemo, useState } from 'react';
import { CostingGate, type CostingSession } from '@/components/accounting/CostingGate';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import {
  SETTING_LABEL,
  computeCosting,
  validatePickupPrice,
  validateSettings,
  type CostingSettings,
} from '@/lib/costing';
import { passwordProblem } from '@/lib/costing-lock';
import { formatCurrency, formatDateTime, formatHkd } from '@/lib/format';
import { useAppData } from '@/lib/store';

const SETTING_KEYS = Object.keys(SETTING_LABEL) as (keyof CostingSettings)[];

function ReviewDialog({
  lines,
  warnings,
  onCancel,
  onConfirm,
}: {
  lines: string[];
  warnings: string[];
  onCancel: () => void;
  onConfirm: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(await onConfirm(password));
    setBusy(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review costing changes"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Review before saving</h2>
        <p className="mt-1 text-sm text-slate-500">
          These changes affect what merchants are paid. Check every line.
        </p>

        <ul className="mt-4 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-sm">
          {lines.map((line) => (
            <li key={line} className="px-3 py-2 text-slate-800">
              {line}
            </li>
          ))}
        </ul>

        {warnings.length > 0 ? (
          <div className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Please double check</p>
            {warnings.map((warning) => (
              <p key={warning}>• {warning}</p>
            ))}
          </div>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Costing password
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && password && submit()}
            className={`mt-1 ${inputClass(Boolean(error))}`}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || password === ''}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Confirm and save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordPanel({ session, onClose }: { session: CostingSession; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    const problem = passwordProblem(next);
    if (problem) return setMessage({ ok: false, text: problem });
    if (next !== again) return setMessage({ ok: false, text: 'The new passwords do not match.' });
    try {
      await session.changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setMessage({ ok: true, text: 'Password changed.' });
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : 'Could not change it.' });
    }
  }

  return (
    <Card title="Change costing password" action={<button type="button" onClick={onClose} className="text-xs font-medium text-slate-500 hover:underline">Close</button>}>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {[
          ['Current password', current, setCurrent],
          ['New password', next, setNext],
          ['Repeat new password', again, setAgain],
        ].map(([label, value, setter]) => (
          <label key={label as string} className="text-xs font-medium text-slate-500">
            {label as string}
            <input
              type="password"
              value={value as string}
              onChange={(event) => (setter as (v: string) => void)(event.target.value)}
              className={`mt-1 ${inputClass(false)}`}
            />
          </label>
        ))}
      </div>
      {message ? (
        <p role="alert" className={`mt-3 text-sm ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
          {message.text}
        </p>
      ) : null}
      <button
        type="button"
        onClick={submit}
        className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        Change password
      </button>
    </Card>
  );
}

function CostingEditor({ session }: { session: CostingSession }) {
  const { user } = useAuth();
  const { items, merchants, users, costing, setPickupPrices, setCostingSettings, addCostingRow, removeCostingRow } =
    useAppData();

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [settingsDraft, setSettingsDraft] = useState<Partial<Record<keyof CostingSettings, string>>>({});
  const [query, setQuery] = useState('');
  const [merchantId, setMerchantId] = useState('all');
  const [reviewing, setReviewing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const saved = costing.settings;

  // Settings as they would be after saving. A box that is empty or not valid keeps the saved value.
  const settingErrors: Partial<Record<keyof CostingSettings, string>> = {};
  const preview: CostingSettings = { ...saved };
  for (const key of SETTING_KEYS) {
    const raw = settingsDraft[key];
    if (raw === undefined) continue;
    const value = raw.trim() === '' ? NaN : Number(raw);
    const problem = validateSettings({ [key]: value });
    if (problem) settingErrors[key] = problem;
    else preview[key] = value;
  }
  const settingChanges = SETTING_KEYS.filter((key) => preview[key] !== saved[key]);

  const rows = useMemo(
    () =>
      costing.rows
        .map((row) => ({ row, item: items.find((item) => item.id === row.itemId) }))
        .filter((entry): entry is { row: typeof entry.row; item: NonNullable<typeof entry.item> } => !!entry.item)
        .filter(({ item }) => {
          if (merchantId !== 'all' && item.merchantId !== merchantId) return false;
          const needle = query.trim().toLowerCase();
          return !needle || item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
        })
        .sort((a, b) => a.item.sku.localeCompare(b.item.sku) || a.row.qty - b.row.qty),
    [costing.rows, items, merchantId, query],
  );

  // Every draft price, checked.
  const priceErrors: Record<string, string> = {};
  const priceChanges: { rowId: string; value: number }[] = [];
  for (const row of costing.rows) {
    const raw = prices[row.id];
    if (raw === undefined) continue;
    if (raw.trim() === '') {
      if (row.pickupPriceHkd !== null) priceErrors[row.id] = 'Enter a pickup price.';
      continue;
    }
    const value = Number(raw);
    const problem = validatePickupPrice(value);
    if (problem) priceErrors[row.id] = problem;
    else if (value !== row.pickupPriceHkd) priceChanges.push({ rowId: row.id, value });
  }
  const errorCount = Object.keys(priceErrors).length + Object.keys(settingErrors).length;
  const changeCount = priceChanges.length + settingChanges.length;

  const nameOf = (id: string) => users.find((candidate) => candidate.id === id)?.name ?? id;
  const itemOf = (id: string) => items.find((item) => item.id === id);

  // Text shown in the review dialog.
  const reviewLines: string[] = [];
  const warnings: string[] = [];
  for (const key of settingChanges) {
    reviewLines.push(`${SETTING_LABEL[key]}: ${saved[key]} → ${preview[key]}`);
  }
  if (settingChanges.length > 0) {
    warnings.push('Changing a setting changes the CF and net COD of every package, even those you did not edit.');
  }
  for (const change of priceChanges) {
    const row = costing.rows.find((candidate) => candidate.id === change.rowId)!;
    const item = itemOf(row.itemId)!;
    const before = computeCosting(item.unitPrice, row.qty, row.pickupPriceHkd, saved);
    const after = computeCosting(item.unitPrice, row.qty, change.value, preview);
    reviewLines.push(
      `${item.sku} ×${row.qty}: pickup ${before.pickupPriceHkd === null ? 'not set' : formatHkd(before.pickupPriceHkd)} → ${formatHkd(change.value)} · net COD ${
        before.netCodHkd === null ? '—' : formatHkd(before.netCodHkd)
      } → ${formatHkd(after.netCodHkd ?? 0)}`,
    );
    if (change.value < after.finalBasisHkd) {
      warnings.push(`${item.sku} ×${row.qty}: pickup ${formatHkd(change.value)} is below the basis ${formatHkd(after.finalBasisHkd)}.`);
    }
    if (row.pickupPriceHkd !== null && Math.abs(change.value - row.pickupPriceHkd) / row.pickupPriceHkd > 0.1) {
      warnings.push(`${item.sku} ×${row.qty}: the price moves by more than 10%.`);
    }
  }

  async function confirm(password: string): Promise<string | null> {
    if (!user) return 'Please sign in again.';
    if (!(await session.confirmPassword(password))) return 'Wrong password.';
    if (settingChanges.length > 0) {
      const patch: Partial<CostingSettings> = {};
      for (const key of settingChanges) patch[key] = preview[key];
      const result = setCostingSettings(user, patch);
      if (!result.ok) return result.error;
    }
    if (priceChanges.length > 0) {
      const result = setPickupPrices(
        user,
        priceChanges.map((change) => ({ rowId: change.rowId, pickupPriceHkd: change.value })),
      );
      if (!result.ok) return result.error;
    }
    setPrices({});
    setSettingsDraft({});
    setReviewing(false);
    setNotice(`Saved ${changeCount} change${changeCount === 1 ? '' : 's'}. It is in the change log below.`);
    return null;
  }

  function addRow() {
    if (!user) return;
    const result = addCostingRow(user, { itemId: newItem, qty: Number(newQty) });
    if (!result.ok) return setAddError(result.error);
    setAddError(null);
    setNewQty('');
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <p>
          <span className="font-semibold">Restricted.</span> Admin only. Every change needs your costing
          password and is written to the change log.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="rounded-xl border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
          >
            Change password
          </button>
          <button
            type="button"
            onClick={session.lock}
            className="rounded-xl bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600"
          >
            Lock now
          </button>
        </div>
      </div>

      {showPassword ? <PasswordPanel session={session} onClose={() => setShowPassword(false)} /> : null}

      {notice ? (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <Card
        title="Formula settings"
        subtitle="Net SRP × (1 + mark-up) ÷ exchange rate = basis. Basis + SF per qty × qty = final basis. Pickup price is set by hand."
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SETTING_KEYS.map((key) => {
            const error = settingErrors[key];
            const changed = preview[key] !== saved[key];
            return (
              <label key={key} className="text-xs font-medium text-slate-500">
                {SETTING_LABEL[key]}
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={settingsDraft[key] ?? String(saved[key])}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, [key]: event.target.value }))
                  }
                  aria-invalid={Boolean(error)}
                  className={`mt-1 ${inputClass(Boolean(error))} ${changed ? 'ring-2 ring-amber-300' : ''}`}
                />
                {error ? <span className="mt-1 block font-normal text-rose-600">{error}</span> : null}
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The exchange rate is the one used to get 182.36 HKD from 1,485 PHP in the sheet. Update it
          whenever the rate changes. The collection fee is (pickup price + SF) × CF rate, rounded to a
          whole HKD, never below the minimum.
        </p>
      </Card>

      <Card
        flush
        title="Costing per package"
        subtitle="Each row is one product at one quantity. Type the pickup price (HKD); everything after it is computed."
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={merchantId}
              onChange={(event) => setMerchantId(event.target.value)}
              aria-label="Filter by merchant"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All merchants</option>
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
            <label className="relative block">
              <span className="sr-only">Search costing</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search SKU or product"
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm sm:w-56"
              />
            </label>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Net SRP (PHP)</th>
                <th className="px-3 py-3 text-right">{preview.markupPct}% MU (PHP)</th>
                <th className="px-3 py-3 text-right">Basis (HKD)</th>
                <th className="px-3 py-3 text-right">Final basis (+{preview.sfPerQtyHkd}/qty)</th>
                <th className="bg-yellow-50 px-3 py-3 text-right">Pickup price (HKD)</th>
                <th className="px-3 py-3 text-right">SF</th>
                <th className="px-3 py-3 text-right">CF ({preview.cfRatePct}%, min {preview.cfMinHkd})</th>
                <th className="px-3 py-3 text-right">Net COD (HKD)</th>
                <th className="px-3 py-3 text-right">Net remittance (PHP)</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-5 py-10 text-center text-slate-500">
                    No costing rows match.
                  </td>
                </tr>
              ) : (
                rows.map(({ row, item }) => {
                  const raw = prices[row.id];
                  const typed = raw === undefined ? row.pickupPriceHkd : raw.trim() === '' ? null : Number(raw);
                  const valid = typed !== null && !Number.isNaN(typed) && !priceErrors[row.id];
                  const result = computeCosting(item.unitPrice, row.qty, valid ? typed : null, preview);
                  const error = priceErrors[row.id];
                  const changed = raw !== undefined && valid && typed !== row.pickupPriceHkd;
                  const below = valid && typed! < result.finalBasisHkd;
                  return (
                    <tr key={row.id} className={changed ? 'bg-amber-50/60' : ''}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{item.sku}</td>
                      <td className="min-w-[12rem] px-3 py-3 text-slate-900">{item.name}</td>
                      <td className="px-3 py-3 text-right font-semibold">{row.qty}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(result.netSrpPhp)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(result.grossPayablePhp)}</td>
                      <td className="px-3 py-3 text-right">{result.basisHkd.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-medium">{result.finalBasisHkd.toFixed(2)}</td>
                      <td className="bg-yellow-50/70 px-3 py-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={raw ?? (row.pickupPriceHkd === null ? '' : String(row.pickupPriceHkd))}
                          onChange={(event) => {
                            setNotice(null);
                            setPrices((current) => ({ ...current, [row.id]: event.target.value }));
                          }}
                          placeholder={String(result.suggestedPickupHkd)}
                          aria-label={`Pickup price for ${item.sku} quantity ${row.qty}`}
                          aria-invalid={Boolean(error)}
                          className={`w-28 rounded-lg border px-2 py-1.5 text-right text-sm font-semibold focus:outline-none focus:ring-2 ${
                            error
                              ? 'border-rose-400 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                          }`}
                        />
                        {error ? <p className="mt-1 max-w-[9rem] text-xs text-rose-600">{error}</p> : null}
                        {!error && row.pickupPriceHkd === null && raw === undefined ? (
                          <p className="mt-1 text-xs text-amber-700">Not set · suggest {result.suggestedPickupHkd}</p>
                        ) : null}
                        {below ? <p className="mt-1 text-xs text-amber-700">Below basis</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right">{result.sfHkd === null ? '—' : result.sfHkd.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right">
                        {result.cfHkd === null ? (
                          '—'
                        ) : (
                          <>
                            <span className="font-semibold">{result.cfHkd.toFixed(2)}</span>
                            <span className="block text-xs text-slate-400">calc {result.cfRawHkd!.toFixed(2)}</span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                        {result.netCodHkd === null ? '—' : result.netCodHkd.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right">{formatCurrency(result.netRemittancePhp)}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remove ${item.sku} ×${row.qty} from the costing?`)) {
                              setPrices((current) => {
                                const next = { ...current };
                                delete next[row.id];
                                return next;
                              });
                              removeCostingRow(user, row.id);
                            }
                          }}
                          aria-label={`Remove ${item.sku} quantity ${row.qty}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Icon name="x" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-500">
              Add package
              <select
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                className={`mt-1 ${inputClass(false)}`}
              >
                <option value="">Choose product…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Qty
              <input
                type="number"
                min={1}
                max={99}
                value={newQty}
                onChange={(event) => setNewQty(event.target.value)}
                className={`mt-1 w-20 ${inputClass(false)}`}
              />
            </label>
            <button
              type="button"
              onClick={addRow}
              disabled={!newItem || !newQty}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
            {addError ? <p className="w-full text-xs text-rose-600">{addError}</p> : null}
          </div>

          <div className="flex items-center gap-3">
            {errorCount > 0 ? (
              <p role="alert" className="text-xs text-rose-600">
                Fix {errorCount} highlighted {errorCount === 1 ? 'box' : 'boxes'} first.
              </p>
            ) : changeCount > 0 ? (
              <p className="text-xs text-amber-700">{changeCount} unsaved change{changeCount === 1 ? '' : 's'}</p>
            ) : null}
            {changeCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setPrices({});
                  setSettingsDraft({});
                }}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Discard
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setReviewing(true)}
              disabled={changeCount === 0 || errorCount > 0}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Review and save
            </button>
          </div>
        </div>
      </Card>

      <Card flush title="Change log" subtitle="Every saved change, newest first. It cannot be edited.">
        {costing.log.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {costing.log.map((entry) => (
              <li key={entry.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">
                    <span className="mr-2 font-mono text-xs text-slate-500">{entry.id}</span>
                    {entry.summary}
                  </p>
                  <p className="text-xs text-slate-500">
                    {nameOf(entry.by)} · {formatDateTime(entry.at)}
                  </p>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {entry.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {reviewing ? (
        <ReviewDialog
          lines={reviewLines}
          warnings={warnings}
          onCancel={() => setReviewing(false)}
          onConfirm={confirm}
        />
      ) : null}
    </div>
  );
}

export function CostingView() {
  return <CostingGate>{(session) => <CostingEditor session={session} />}</CostingGate>;
}
