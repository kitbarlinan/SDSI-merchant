'use client';

import { useMemo, useState } from 'react';
import { NewSkuCard, SkuImportCard } from '@/components/accounting/NewSkuCard';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import {
  SETTING_LABEL,
  computeCosting,
  validatePickupPrice,
  validateSettings,
  skuIncome,
  type CostingSettings,
} from '@/lib/costing';
import { formatCurrency, formatDateTime, formatHkd } from '@/lib/format';
import { describeParts } from '@/lib/inventory';
import { CATEGORIES, type Category, type InventoryItem } from '@/lib/types';
import type { CostingRow } from '@/lib/costing';
import { useAppData } from '@/lib/store';

const SETTING_KEYS = Object.keys(SETTING_LABEL) as (keyof CostingSettings)[];

interface DialogState {
  title: string;
  intro: string;
  confirmLabel: string;
  lines: string[];
  warnings: string[];
  /** Runs after the admin confirms. Returns an error text, or null when done. */
  apply: () => string | null | Promise<string | null>;
}

function ReviewDialog({
  title,
  intro,
  confirmLabel,
  lines,
  warnings,
  onCancel,
  onConfirm,
}: {
  title: string;
  intro: string;
  confirmLabel: string;
  lines: string[];
  warnings: string[];
  onCancel: () => void;
  onConfirm: () => string | null | Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit() {
    setBusy(true);
    void Promise.resolve(onConfirm())
      .then(setError)
      .finally(() => setBusy(false));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review costing changes"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{intro}</p>

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
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResellerProgramCard({ onChanged }: { onChanged: (message: string) => void }) {
  const { user } = useAuth();
  const { merchants, items, costing, setProgramMerchant, setSkuReseller } = useAppData();
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const { resellerDiscountPct } = costing.settings;

  return (
    <Card
      title="Reseller program"
      subtitle={`Products in the program give active resellers ${resellerDiscountPct}% off (a percent of the SRP, shown in HKD). The discount comes out of SDSI's top-up, so the merchant still gets the full SRP. Turn a merchant on, then switch single SKUs on or off. Package price and tier income % are in the settings above.`}
    >
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {merchants.map((merchant) => {
          const on = costing.programMerchantIds.includes(merchant.id);
          const own = items.filter((item) => item.merchantId === merchant.id);
          return (
            <li key={merchant.id} className="py-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: merchant.color }} />
                  {merchant.name}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {on ? 'In the program' : 'Not in the program'}
                  <input
                    type="checkbox"
                    checked={on}
                    aria-label={`Reseller program for ${merchant.name}`}
                    onChange={async (event) => {
                      const r = await setProgramMerchant(user, merchant.id, event.target.checked);
                      if (r.ok) {
                        setError(null);
                        onChanged(`${merchant.name} ${event.target.checked ? 'added to' : 'removed from'} the reseller program.`);
                      } else setError(r.error);
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </span>
              </label>
              {on ? (
                <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3">
                  {own.map((item) => (
                    <li key={item.id}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-slate-700">
                          <span className="font-mono text-slate-500">{item.sku}</span> {item.name}
                        </span>
                        <input
                          type="checkbox"
                          checked={!item.resellerOff}
                          aria-label={`Reseller program for ${item.sku}`}
                          onChange={async (event) => {
                            const r = await setSkuReseller(user, item.id, event.target.checked);
                            if (r.ok) {
                              setError(null);
                              onChanged(`${item.sku} ${event.target.checked ? 'switched on' : 'switched off'} for resellers.`);
                            } else setError(r.error);
                          }}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function CostingEditor() {
  const { user } = useAuth();
  const {
    items,
    products,
    merchants,
    users,
    costing,
    setPickupPrices,
    setCostingSettings,
    removeCostingRow,
    approveCostingRow,
    revokeApproval,
    goLiveCostingRow,
    setSkuDisabled,
    setSkuSrp,
    setSkuCategory,
    setSkuPackage,
    addSku,
    orders,
  } = useAppData();

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [settingsDraft, setSettingsDraft] = useState<Partial<Record<keyof CostingSettings, string>>>({});
  const [query, setQuery] = useState('');
  const [merchantId, setMerchantId] = useState('all');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [showNewSku, setShowNewSku] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [srpEdit, setSrpEdit] = useState<{ itemId: string; value: string } | null>(null);
  const [srpError, setSrpError] = useState<string | null>(null);

  const saved = costing.settings;

  // Income earned: every delivered unit of an approved or live SKU brings in its net top-up. Packages count in package sales.
  const earned = useMemo(() => {
    const byItem = new Map<string, { units: number; php: number }>();
    const counted = new Set(costing.rows.filter((r) => r.status !== 'draft').map((r) => r.itemId));
    const packageIds = new Set(items.filter((i) => i.package).map((i) => i.id));
    let total = 0;
    for (const order of orders) {
      if (order.status !== 'delivered') continue;
      for (const line of order.lines) {
        if (!counted.has(line.itemId) || packageIds.has(line.itemId)) continue;
        const php = skuIncome(line.total, costing.settings).netTopUpPhp;
        const cur = byItem.get(line.itemId) ?? { units: 0, php: 0 };
        byItem.set(line.itemId, { units: cur.units + line.quantity, php: cur.php + php });
        total += php;
      }
    }
    return { byItem, total: Math.round(total * 100) / 100 };
  }, [orders, items, costing.rows, costing.settings]);

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
        .sort((a, b) => a.item.sku.localeCompare(b.item.sku)),
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
    warnings.push('SF and the collection fee rate apply to new orders right away. Pickup prices of live packages stay frozen until a new price goes live.');
  }
  for (const change of priceChanges) {
    const row = costing.rows.find((candidate) => candidate.id === change.rowId)!;
    const item = itemOf(row.itemId)!;
    const before = computeCosting(item.unitPrice, row.qty, row.pickupPriceHkd, saved);
    const after = computeCosting(item.unitPrice, row.qty, change.value, preview);
    reviewLines.push(
      `${item.sku}: pickup ${before.pickupPriceHkd === null ? 'not set' : formatHkd(before.pickupPriceHkd)} → ${formatHkd(change.value)} · net COD ${
        before.netCodHkd === null ? '—' : formatHkd(before.netCodHkd)
      } → ${formatHkd(after.netCodHkd ?? 0)}`,
    );
    if (change.value < after.finalBasisHkd) {
      warnings.push(`${item.sku}: pickup ${formatHkd(change.value)} is below the basis ${formatHkd(after.finalBasisHkd)}.`);
    }
    if (row.pickupPriceHkd !== null && Math.abs(change.value - row.pickupPriceHkd) / row.pickupPriceHkd > 0.1) {
      warnings.push(`${item.sku}: the price moves by more than 10%.`);
    }
  }

  async function saveChanges(): Promise<string | null> {
    if (!user) return 'Please sign in again.';
    if (settingChanges.length > 0) {
      const patch: Partial<CostingSettings> = {};
      for (const key of settingChanges) patch[key] = preview[key];
      const result = await setCostingSettings(user, patch);
      if (!result.ok) return result.error;
    }
    if (priceChanges.length > 0) {
      const result = await setPickupPrices(
        user,
        priceChanges.map((change) => ({ rowId: change.rowId, pickupPriceHkd: change.value })),
      );
      if (!result.ok) return result.error;
    }
    setPrices({});
    setSettingsDraft({});
    setNotice(`Saved ${changeCount} change${changeCount === 1 ? '' : 's'} as draft. Approve and go live to use them.`);
    return null;
  }

  function openSaveReview() {
    setDialog({
      title: 'Review before saving',
      intro: 'Saved prices are drafts. They do not touch orders until approved and live.',
      confirmLabel: 'Confirm and save',
      lines: reviewLines,
      warnings,
      apply: saveChanges,
    });
  }

  function askRowAction(kind: 'approve' | 'revoke' | 'live', row: CostingRow, item: InventoryItem) {
    if (!user) return;
    const result = computeCosting(item.unitPrice, row.qty, row.pickupPriceHkd, saved);
    const label = `${item.sku}`;
    const figures = `Pickup ${formatHkd(row.pickupPriceHkd ?? 0)} · SF ${formatHkd(result.sfHkd ?? 0)} · CF ${formatHkd(result.cfHkd ?? 0)} · Net COD ${formatHkd(result.netCodHkd ?? 0)} · Remit ${formatCurrency(result.netRemittancePhp)}`;
    const base = { lines: [label, figures], warnings: [] as string[] };
    if (kind === 'approve') {
      setDialog({
        ...base,
        title: 'Approve this package?',
        intro: 'Approved is not live yet. You still click Go live after.',
        confirmLabel: 'Approve',
        apply: async () => {
          const r = await approveCostingRow(user, row.id);
          if (r.ok) setNotice(`${label} approved. Click Go live when ready.`);
          return r.ok ? null : r.error;
        },
      });
    } else if (kind === 'revoke') {
      setDialog({
        ...base,
        title: 'Take back the approval?',
        intro: 'The package goes back to draft.',
        confirmLabel: 'Back to draft',
        apply: async () => {
          const r = await revokeApproval(user, row.id);
          return r.ok ? null : r.error;
        },
      });
    } else {
      setDialog({
        lines: [label, figures, row.live ? `Replaces the live version: pickup ${formatHkd(row.live.pickupPriceHkd)}, net COD ${formatHkd(row.live.netCodHkd)}` : 'First time live: this SKU becomes available for orders.'],
        warnings: ['From now on new orders and the merchant remittance use these numbers.'],
        title: 'Go live?',
        intro: 'Orders will use this price, SF and CF right away.',
        confirmLabel: 'Go live',
        apply: async () => {
          const r = await goLiveCostingRow(user, row.id);
          if (r.ok) setNotice(`${label} is live.`);
          return r.ok ? null : r.error;
        },
      });
    }
  }

  async function togglePackage(item: InventoryItem, on: boolean) {
    if (!user) return;
    const result = await setSkuPackage(user, item.id, on);
    setNotice(result.ok ? (on ? `${item.sku} is now a reseller package. Approve it and go live, then it shows on the Become a reseller page.` : `${item.sku} is no longer a reseller package.`) : result.error);
  }

  async function changeCategory(itemIds: string[], category: Category) {
    if (!user) return;
    const result = await setSkuCategory(user, itemIds, category);
    setNotice(result.ok ? `${result.value} SKU${result.value === 1 ? '' : 's'} set to ${category}.` : result.error);
  }

  async function saveSrp(item: InventoryItem, value: number) {
    if (!user) return;
    const result = await setSkuSrp(user, item.id, value);
    if (!result.ok) return setSrpError(result.error);
    setSrpError(null);
    setSrpEdit(null);
    setNotice(`${item.sku} Net SRP is now ${formatCurrency(value)}. The package is a draft again: approve it and go live so orders use the new amount. Orders already placed keep their old price.`);
  }

  function askToggleSku(item: InventoryItem) {
    if (!user) return;
    const disabling = !item.disabled;
    setDialog({
      title: disabling ? `Disable ${item.sku}?` : `Enable ${item.sku}?`,
      intro: disabling
        ? 'It can no longer be ordered or sold. Open orders are not affected. The SKU code stays reserved forever.'
        : 'It can be ordered again if it has a live package.',
      confirmLabel: disabling ? 'Disable SKU' : 'Enable SKU',
      lines: [`${item.sku} · ${item.name}`],
      warnings: [],
      apply: async () => {
        const r = await setSkuDisabled(user, item.id, disabling);
        if (r.ok) setNotice(`${item.sku} ${disabling ? 'disabled' : 'enabled'}.`);
        return r.ok ? null : r.error;
      },
    });
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <span className="font-semibold">Restricted.</span> Admin only. Every change is reviewed before saving and
        written to the change log.
      </div>

      {notice ? (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <Card
        title="Formula settings"
        subtitle="SKU SRP × (1 + mark-up) ÷ exchange rate = basis. Basis + SF per qty × pieces = final basis. Pickup price is set by hand."
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

      <div>
        <button
          type="button"
          onClick={() => setShowNewSku((current) => !current)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {showNewSku ? 'Close new SKU' : '+ New SKU'}
        </button>
      </div>
      <ResellerProgramCard onChanged={setNotice} />

      {showNewSku ? (
        <>
          <NewSkuCard onAdded={setNotice} />
          <SkuImportCard onAdded={setNotice} />
        </>
      ) : null}

      <Card
        flush
        title="Costing per package"
        subtitle="Each row is one SKU. Type the pickup price (HKD), save it as a draft, then Approve, then Go live. Only live rows are used by orders and remittance."
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
        <div className="flex flex-wrap items-center gap-2 border-y border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs text-slate-600">
          <span>Set the category of the {rows.length} SKU{rows.length === 1 ? '' : 's'} shown:</span>
          {CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              disabled={rows.length === 0}
              onClick={() => void changeCategory(rows.map(({ item }) => item.id), option)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              All {option}
            </button>
          ))}
          <span className="text-slate-400">Use the merchant filter or search above to pick which SKUs.</span>
        </div>
        <div className="border-b border-slate-100 bg-emerald-50/60 px-5 py-2.5 text-xs text-emerald-800">
          Net income from delivered orders (approved and live SKUs, packages excluded): <strong>{formatCurrency(earned.total)}</strong>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[7.5rem] min-w-[7.5rem] bg-slate-50 px-4 py-3 text-left md:sticky md:left-0 md:z-20">SKU</th>
                <th className="sticky left-0 z-20 min-w-[9rem] bg-slate-50 px-3 py-3 text-left shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)] md:left-[7.5rem] md:w-[12rem] md:min-w-[12rem] md:max-w-[12rem] md:shadow-none">Product</th>
                <th className="bg-slate-50 px-3 py-3 text-right md:sticky md:left-[19.5rem] md:z-20 md:w-[4.5rem] md:min-w-[4.5rem] md:shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)]">Qty (pcs)</th>
                <th className="px-3 py-3 text-right">Net SRP (PHP)</th>
                <th className="px-3 py-3 text-right">{preview.markupPct}% MU (PHP)</th>
                <th className="px-3 py-3 text-right">Basis (HKD)</th>
                <th className="px-3 py-3 text-right">Final basis (+{preview.sfPerQtyHkd}/qty)</th>
                <th className="bg-yellow-50 px-3 py-3 text-right">Pickup price (HKD)</th>
                <th className="px-3 py-3 text-right">SF</th>
                <th className="px-3 py-3 text-right">CF ({preview.cfRatePct}%, min {preview.cfMinHkd})</th>
                <th className="px-3 py-3 text-right">Net COD (HKD)</th>
                <th className="px-3 py-3 text-right">Net remittance (PHP)</th>
                <th className="px-3 py-3 text-right">SDSI gross top-up</th>
                <th className="px-3 py-3 text-right">Reseller discount {preview.resellerDiscountPct}%</th>
                <th className="px-3 py-3 text-right">Referrer {preview.referrerPct}%</th>
                <th className="px-3 py-3 text-right">Tier (1-2) {preview.tierL1Pct + preview.tierL2Pct}%</th>
                <th className="px-3 py-3 text-right">System fees {preview.systemFeePct}%</th>
                <th className="px-3 py-3 text-right">Net top-up (income)</th>
                <th className="px-3 py-3 text-right">Net %</th>
                <th className="px-3 py-3 text-right">Delivered (pcs)</th>
                <th className="px-3 py-3 text-right">Income earned (PHP)</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={23} className="px-5 py-10 text-center text-slate-500">
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
                    <tr key={row.id} className={changed ? 'bg-amber-50' : ''}>
                      <td
                        className={`w-[7.5rem] min-w-[7.5rem] whitespace-nowrap px-4 py-3 font-mono text-xs md:sticky md:left-0 md:z-10 ${
                          changed ? 'bg-amber-50' : 'bg-white'
                        }`}
                      >
                        {item.sku}
                      </td>
                      <td
                        className={`sticky left-0 z-10 min-w-[9rem] px-3 py-3 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)] md:left-[7.5rem] md:w-[12rem] md:min-w-[12rem] md:max-w-[12rem] md:shadow-none ${
                          changed ? 'bg-amber-50' : 'bg-white'
                        } ${item.disabled ? 'text-slate-400' : 'text-slate-900'}`}
                      >
                        {item.name}
                        <select
                          aria-label={`Category of ${item.sku}`}
                          value={item.category}
                          onChange={(event) => void changeCategory([item.id], event.target.value as Category)}
                          className="mt-1 block rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-normal text-slate-600"
                        >
                          {CATEGORIES.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        {item.parts?.length ? (
                          <label className="mt-1 flex items-center gap-1.5 text-[11px] font-normal text-slate-600">
                            <input type="checkbox" checked={Boolean(item.package)} aria-label={`Reseller package ${item.sku}`} onChange={(event) => void togglePackage(item, event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600" />
                            Reseller package
                          </label>
                        ) : null}
                        {item.parts?.length ? <span className="mt-0.5 block text-[11px] font-normal leading-snug text-slate-500">{describeParts(item, products)}</span> : null}
                        {item.disabled ? <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Disabled</span> : null}
                        <button
                          type="button"
                          onClick={() => askToggleSku(item)}
                          className="mt-0.5 block text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
                        >
                          {item.disabled ? 'Enable SKU' : 'Disable SKU'}
                        </button>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-semibold md:sticky md:left-[19.5rem] md:z-10 md:w-[4.5rem] md:min-w-[4.5rem] md:shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)] ${
                          changed ? 'md:bg-amber-50' : 'md:bg-white'
                        }`}
                      >
                        {row.qty}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {srpEdit?.itemId === item.id ? (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              autoFocus
                              aria-label={`Net SRP of ${item.sku}`}
                              value={srpEdit.value}
                              onChange={(event) => setSrpEdit({ itemId: item.id, value: event.target.value })}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void saveSrp(item, Number(srpEdit.value));
                                if (event.key === 'Escape') setSrpEdit(null);
                              }}
                              className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
                            />
                            {srpError ? <p className="max-w-[9rem] text-xs text-rose-600">{srpError}</p> : null}
                            <div className="flex justify-end gap-2 text-xs font-semibold">
                              <button type="button" onClick={() => void saveSrp(item, Number(srpEdit.value))} className="text-emerald-700 underline">Save</button>
                              <button type="button" onClick={() => { setSrpEdit(null); setSrpError(null); }} className="text-slate-500 underline">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {formatCurrency(result.netSrpPhp)}
                            <button
                              type="button"
                              aria-label={`Edit Net SRP of ${item.sku}`}
                              onClick={() => { setSrpEdit({ itemId: item.id, value: String(item.unitPrice) }); setSrpError(null); }}
                              className="ml-1.5 text-xs font-medium text-slate-400 hover:text-emerald-700 hover:underline"
                            >
                              Edit
                            </button>
                            {item.masterSrp !== undefined && item.masterSrp !== item.unitPrice ? (
                              <span className="block text-xs text-amber-700">
                                Master list {formatCurrency(item.masterSrp)} ·{' '}
                                <button type="button" onClick={() => void saveSrp(item, item.masterSrp!)} className="underline">Reset</button>
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
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
                          aria-label={`Pickup price for ${item.sku}`}
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
                      <td className="px-3 py-3 text-right">{formatCurrency(skuIncome(result.netSrpPhp, preview).grossTopUpPhp)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(skuIncome(result.netSrpPhp, preview).resellerPhp)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(skuIncome(result.netSrpPhp, preview).referrerPhp)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(skuIncome(result.netSrpPhp, preview).tierPhp)}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(skuIncome(result.netSrpPhp, preview).systemFeePhp)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatCurrency(skuIncome(result.netSrpPhp, preview).netTopUpPhp)}</td>
                      <td className="px-3 py-3 text-right">{skuIncome(result.netSrpPhp, preview).netPct}%</td>
                      <td className="px-3 py-3 text-right">{item.package ? '—' : earned.byItem.get(item.id)?.units ?? 0}</td>
                      <td className="px-3 py-3 text-right font-semibold">{item.package ? '—' : formatCurrency(earned.byItem.get(item.id)?.php ?? 0)}</td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {(() => {
                          const dirty = changed || Boolean(error);
                          const chip =
                            row.status === 'live'
                              ? 'bg-blue-100 text-blue-700'
                              : row.status === 'approved'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-600';
                          return (
                            <div className="space-y-1">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${chip}`}>
                                {row.status === 'live' ? 'Live' : row.status === 'approved' ? 'Approved' : 'Draft'}
                              </span>
                              {row.status === 'draft' && row.live ? (
                                <p className="text-xs text-blue-700">Live now: {formatHkd(row.live.pickupPriceHkd)}</p>
                              ) : null}
                              {dirty ? (
                                <p className="text-xs text-amber-700">Save the price first</p>
                              ) : row.status === 'draft' ? (
                                <button
                                  type="button"
                                  disabled={row.pickupPriceHkd === null}
                                  onClick={() => askRowAction('approve', row, item)}
                                  className="block rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Approve
                                </button>
                              ) : row.status === 'approved' ? (
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => askRowAction('live', row, item)}
                                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                                  >
                                    Go live
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => askRowAction('revoke', row, item)}
                                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                  >
                                    Undo
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {row.live ? null : <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remove ${item.sku} from the costing?`)) {
                              setPrices((current) => {
                                const next = { ...current };
                                delete next[row.id];
                                return next;
                              });
                              void removeCostingRow(user, row.id);
                            }
                          }}
                          aria-label={`Remove ${item.sku}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Icon name="x" className="h-4 w-4" />
                        </button>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between">
          <span />
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
              onClick={openSaveReview}
              disabled={changeCount === 0 || errorCount > 0}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
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

      {dialog ? (
        <ReviewDialog
          title={dialog.title}
          intro={dialog.intro}
          confirmLabel={dialog.confirmLabel}
          lines={dialog.lines}
          warnings={dialog.warnings}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const error = await dialog.apply();
            if (!error) setDialog(null);
            return error;
          }}
        />
      ) : null}
    </div>
  );
}

export function CostingView() {
  return <CostingEditor />;
}
