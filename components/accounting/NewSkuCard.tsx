'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { SheetPicker } from '@/components/ui/SheetPicker';
import { useAuth } from '@/lib/auth';
import { planSkuImport, type SkuRow } from '@/lib/engine';
import { formatCurrency } from '@/lib/format';
import { describeParts } from '@/lib/inventory';
import { downloadCsv, readColumns, SKU_COLUMNS } from '@/lib/spreadsheet';
import { useAppData } from '@/lib/store';
import { CATEGORIES, type Category } from '@/lib/types';

interface Line {
  productId: string;
  qty: string;
  free: string;
}
const blankLine = (): Line => ({ productId: '', qty: '1', free: '0' });
const btn = 'rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';

/** New SKU or bundle, built from the master list: pick the products, the qty of each and any free pieces. */
export function NewSkuCard({ onAdded }: { onAdded: (message: string) => void }) {
  const { user } = useAuth();
  const { merchants, products, addSku } = useAppData();
  const [merchantId, setMerchantId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);

  const own = useMemo(() => products.filter((product) => product.merchantId === merchantId).sort((a, b) => a.code.localeCompare(b.code)), [products, merchantId]);
  const parts = lines.filter((line) => line.productId).map((line) => ({ productId: line.productId, qty: Number(line.qty || 0), free: Number(line.free || 0) }));
  const srp = parts.reduce((sum, part) => sum + (products.find((p) => p.id === part.productId)?.srp ?? 0) * part.qty, 0);
  const pieces = parts.reduce((sum, part) => sum + part.qty + part.free, 0);
  const patch = (index: number, change: Partial<Line>) => setLines((current) => current.map((line, at) => (at === index ? { ...line, ...change } : line)));

  async function submit() {
    if (!user) return;
    const result = await addSku(user, { merchantId, sku, name, category, parts });
    if (!result.ok) return setError(result.error);
    setError(null);
    onAdded(`${result.value.sku} added as draft (${formatCurrency(result.value.unitPrice)} SRP, ${pieces} pc${pieces === 1 ? '' : 's'}). Approve and go live a package to put it on sale. Receive stock in Inventory.`);
    setSku('');
    setName('');
    setLines([blankLine()]);
  }

  return (
    <Card
      title="New SKU or bundle"
      subtitle="Pick the products from the master list, with the qty of each and any free pieces. The SRP and the number of pieces are worked out for you. The SKU code must be new and is never reused. It goes on sale only after a package is approved and live."
    >
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-500">
          Merchant
          <select
            value={merchantId}
            onChange={(event) => {
              setMerchantId(event.target.value);
              setLines([blankLine()]);
            }}
            className={`mt-1 ${inputClass(false)}`}
          >
            <option value="">Choose merchant…</option>
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>{merchant.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          SKU code
          <input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="UPG-CSNVIP26-001" className={`mt-1 ${inputClass(Boolean(error))}`} />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Bundle name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Empty = the product's own name" className={`mt-1 ${inputClass(false)}`} />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value as Category)} className={`mt-1 ${inputClass(false)}`}>
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-slate-500">What is inside</p>
        {merchantId && own.length === 0 ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">This merchant has no products yet. Add them in Inventory → Master list first.</p>
        ) : null}
        <ul className="mt-2 space-y-2">
          {lines.map((line, index) => (
            <li key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]" data-testid="sku-line">
              <label className="text-xs text-slate-500">
                <span className="sr-only">Product</span>
                <select
                  aria-label={`Product ${index + 1}`}
                  value={line.productId}
                  disabled={!merchantId}
                  onChange={(event) => patch(index, { productId: event.target.value })}
                  className={inputClass(false)}
                >
                  <option value="">{merchantId ? 'Choose product…' : 'Choose the merchant first'}</option>
                  {own.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} · {product.name} · {formatCurrency(product.srp)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Qty
                <input aria-label={`Qty ${index + 1}`} type="number" min={0} max={99} value={line.qty} onChange={(event) => patch(index, { qty: event.target.value })} className={`mt-0.5 ${inputClass(false)}`} />
              </label>
              <label className="text-xs text-slate-500">
                Free
                <input aria-label={`Free ${index + 1}`} type="number" min={0} max={99} value={line.free} onChange={(event) => patch(index, { free: event.target.value })} className={`mt-0.5 ${inputClass(false)}`} />
              </label>
              <button
                type="button"
                aria-label={`Remove product ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button type="button" disabled={!merchantId} onClick={() => setLines((current) => [...current, blankLine()])} className="mt-2 text-sm font-medium text-emerald-700 underline disabled:opacity-40">
          + Add another product
        </button>
      </div>

      <p className="mt-3 text-sm text-slate-700" data-testid="sku-summary">
        Net SRP <strong>{formatCurrency(srp)}</strong> · <strong>{pieces}</strong> piece{pieces === 1 ? '' : 's'} inside
        <span className="text-slate-500"> (free pieces cost nothing but still count as pieces). This is the master-list total; if the real SRP is lower, change it in the Costing table after adding.</span>
      </p>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <button type="button" onClick={submit} disabled={!merchantId || !sku || parts.length === 0} className={`mt-3 bg-emerald-600 text-emerald-950 hover:bg-emerald-500 ${btn}`}>
        Add SKU as draft
      </button>
    </Card>
  );
}

/** Many SKUs at once from a sheet: SKU CODE, BUNDLE NAME, PRODUCT, QTY, FREE. Rows with the same SKU code are one bundle. */
export function SkuImportCard({ onAdded }: { onAdded: (message: string) => void }) {
  const { user } = useAuth();
  const { items, products, costing, importSkus } = useAppData();
  const [rows, setRows] = useState<SkuRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = useMemo(
    () => (rows && user ? planSkuImport({ items, products, costing } as never, { id: user.id, role: user.role }, rows, '2000-01-01T00:00') : null),
    [rows, items, products, costing, user],
  );

  function onSheet(cells: string[][]) {
    const read = readColumns(cells, SKU_COLUMNS);
    setProblem(read.problem);
    setRows(read.problem ? null : read.rows.map((row) => ({ row: row.row, sku: row.sku, bundleName: row.bundleName, product: row.product, qty: row.qty, free: row.free, category: row.category })));
  }

  async function run() {
    if (!user || !rows) return;
    setBusy(true);
    const result = await importSkus(user, rows);
    setBusy(false);
    if (!result.ok) return setProblem(result.error);
    onAdded(`${result.value.created} SKU${result.value.created === 1 ? '' : 's'} added as draft. Approve and go live a package to put them on sale.`);
    setRows(null);
    setProblem(null);
  }

  return (
    <Card
      title="Import SKUs from Excel"
      subtitle="Columns: SKU CODE, BUNDLE NAME, PRODUCT, QTY, FREE. PRODUCT is the INV code or the product name from the master list, so the merchant is found automatically. Put each product of a bundle on its own row with the same SKU code. FREE is the number of free pieces of that product (or write yes if the whole qty is free)."
    >
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SheetPicker label="Choose Excel / CSV file" onRead={onSheet} onError={(text) => { setRows(null); setProblem(text); }} />
        <button
          type="button"
          onClick={() => downloadCsv('sku-template.csv', [['SKU CODE', 'BUNDLE NAME', 'PRODUCT', 'QTY', 'FREE', 'CATEGORY'], ['UPG-CSNVIP26-001', 'UPGRADE VIP COSMETIC', 'Shantahl Premium Night Cream', '5', '', 'Beauty Products'], ['UPG-CSNVIP26-001', 'UPGRADE VIP COSMETIC', 'Shantahl Premium Kojic Acid Soap', '5', '1', 'Beauty Products']])}
          className="text-xs font-medium text-emerald-700 underline"
        >
          Download template
        </button>
      </div>
      {problem ? <p role="alert" className="mt-3 whitespace-pre-line text-sm text-rose-700">{problem}</p> : null}
      {plan && rows ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm" data-testid="sku-import-preview">
          <p className="text-slate-700">
            {rows.length} row{rows.length === 1 ? '' : 's'} → <strong>{plan.created.length}</strong> SKU{plan.created.length === 1 ? '' : 's'} ready{plan.errors.length > 0 ? `, ${plan.errors.length} problem${plan.errors.length === 1 ? '' : 's'}` : ''}.
          </p>
          {plan.created.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {plan.created.slice(0, 12).map((item) => (
                <li key={item.id}>
                  <span className="font-mono">{item.sku}</span> · {item.name} · {formatCurrency(item.unitPrice)} — {describeParts(item, products)}
                </li>
              ))}
              {plan.created.length > 12 ? <li>…and {plan.created.length - 12} more.</li> : null}
            </ul>
          ) : null}
          {plan.errors.length > 0 ? (
            <>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-rose-700">
                {plan.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
                {plan.errors.length > 8 ? <li>…and {plan.errors.length - 8} more.</li> : null}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Nothing is saved until every row is fine. Fix the sheet and choose it again.</p>
            </>
          ) : null}
          <button type="button" disabled={busy || plan.errors.length > 0 || plan.created.length === 0} onClick={run} className={`mt-3 bg-emerald-600 text-emerald-950 hover:bg-emerald-500 ${btn}`}>
            Add {plan.created.length} SKU{plan.created.length === 1 ? '' : 's'} as draft
          </button>
        </div>
      ) : null}
    </Card>
  );
}
