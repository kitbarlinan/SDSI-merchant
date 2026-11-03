'use client';

import { useMemo, useState } from 'react';
import { ExpiryBadge } from '@/components/inventory/ExpiryBadge';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { SheetPicker } from '@/components/ui/SheetPicker';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, type Category } from '@/lib/types';
import { planProductImport, type ProductRow } from '@/lib/engine';
import { formatCurrency, formatDate } from '@/lib/format';
import { getExpiry } from '@/lib/inventory';
import { downloadCsv, PRODUCT_COLUMNS, readColumns } from '@/lib/spreadsheet';
import { useAppData } from '@/lib/store';
import type { MasterProduct } from '@/lib/types';
import { useToday } from '@/lib/use-today';

const NONE = '__none__';
const btn = 'rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60';
const primary = `${btn} bg-emerald-600 text-emerald-950 hover:bg-emerald-500`;
const plain = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

interface Form {
  merchantId: string;
  code: string;
  name: string;
  srp: string;
  expiry: string;
  supplier: string;
  category: string;
}

/** The inventory master list: every product per merchant with its INV code, SRP and optional expiry. SKUs are built from it. */
export function MasterListPanel({ merchantFilter }: { merchantFilter: string }) {
  const { user } = useAuth();
  const { products, items, merchants, addProduct, updateProduct, deleteProduct, importProducts } = useAppData();
  const today = useToday();
  const canEdit = user?.role === 'admin' || user?.role === 'clerk';
  const [query, setQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Import
  const [importMerchant, setImportMerchant] = useState('');
  const [sheet, setSheet] = useState<{ rows: ProductRow[]; problem: string | null; fileName: string } | null>(null);

  const merchantName = (id: string) => merchants.find((merchant) => merchant.id === id)?.name ?? id;
  const usedIn = (id: string) => items.filter((item) => item.parts?.some((part) => part.productId === id)).length;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products
      .filter((product) => merchantFilter === 'all' || product.merchantId === merchantFilter)
      .filter((product) => supplierFilter === 'all' || (supplierFilter === NONE ? !product.supplier : product.supplier === supplierFilter))
      .filter((product) => categoryFilter === 'all' || (categoryFilter === NONE ? !product.category : product.category === categoryFilter))
      .filter((product) => !needle || product.name.toLowerCase().includes(needle) || product.code.toLowerCase().includes(needle))
      .sort((a, b) => merchantName(a.merchantId).localeCompare(merchantName(b.merchantId)) || a.code.localeCompare(b.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, merchantFilter, query, merchants, supplierFilter, categoryFilter]);

  // Suppliers of the merchant being looked at, for the filter.
  const suppliers = useMemo(
    () => [...new Set(products.filter((product) => merchantFilter === 'all' || product.merchantId === merchantFilter).map((product) => product.supplier).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b)),
    [products, merchantFilter],
  );

  const importFor = importMerchant || (merchantFilter !== 'all' ? merchantFilter : '');
  const plan = useMemo(() => (sheet && !sheet.problem ? planProductImport({ products } as never, importFor, sheet.rows) : null), [sheet, products, importFor]);

  if (!user) return null;
  const set = (key: keyof Form, value: string) => setForm((current) => (current ? { ...current, [key]: value } : current));

  async function save() {
    if (!form || !user) return;
    setBusy(true);
    const srp = Number(form.srp);
    const result = editing
      ? await updateProduct(user, editing, { code: form.code, name: form.name, srp, expiryDate: form.expiry || null, supplier: form.supplier || null, category: (form.category as Category) || null })
      : await addProduct(user, { merchantId: form.merchantId || (merchantFilter !== 'all' ? merchantFilter : ''), code: form.code, name: form.name, srp, expiryDate: form.expiry || undefined, supplier: form.supplier || undefined, category: (form.category as Category) || undefined });
    setBusy(false);
    if (!result.ok) return setMessage({ tone: 'bad', text: result.error });
    const sold = editing ? usedIn(editing) : 0;
    setMessage({
      tone: 'ok',
      text: `${result.value.code} ${editing ? 'saved' : 'added'}.${sold > 0 && editing ? ` ${sold} SKU${sold === 1 ? '' : 's'} already use it and keep the SRP they were made with.` : ''}`,
    });
    setForm(null);
    setEditing(null);
  }

  async function remove(product: MasterProduct) {
    if (!user) return;
    setBusy(true);
    const result = await deleteProduct(user, product.id);
    setBusy(false);
    setConfirmDelete(null);
    setMessage({ tone: result.ok ? 'ok' : 'bad', text: result.ok ? `${product.code} deleted.` : result.error });
  }

  function onSheet(cells: string[][], fileName: string) {
    const read = readColumns(cells, PRODUCT_COLUMNS);
    setMessage(null);
    setSheet({ fileName, problem: read.problem, rows: read.rows.map((row) => ({ row: row.row, code: row.code, name: row.name, srp: row.srp, expiry: row.expiry, supplier: row.supplier, category: row.category })) });
  }

  async function runImport() {
    if (!user || !sheet) return;
    setBusy(true);
    const result = await importProducts(user, importFor, sheet.rows);
    setBusy(false);
    if (!result.ok) return setMessage({ tone: 'bad', text: result.error });
    setMessage({ tone: 'ok', text: `Imported for ${merchantName(importFor)}: ${result.value.created} added, ${result.value.updated} updated, ${result.value.unchanged} unchanged.` });
    setSheet(null);
  }

  const startEdit = (product: MasterProduct) => {
    setEditing(product.id);
    setForm({ merchantId: product.merchantId, code: product.code, name: product.name, srp: String(product.srp), expiry: product.expiryDate ?? '', supplier: product.supplier ?? '', category: product.category ?? '' });
    setMessage(null);
  };

  return (
    <div className="space-y-6">
      {message ? (
        <p role="status" className={`whitespace-pre-line rounded-xl px-4 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-800'}`}>
          {message.text}
        </p>
      ) : null}

      {canEdit ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            title={editing ? 'Edit product' : 'Add a product'}
            subtitle="One product, one INV code. SKUs and bundles are built from these, and the SRP here is what the costing starts from."
          >
            {form ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {!editing ? (
                  <label className="text-xs font-medium text-slate-500 sm:col-span-2">
                    Merchant
                    <select value={form.merchantId} onChange={(event) => set('merchantId', event.target.value)} className={`mt-1 ${inputClass(false)}`}>
                      <option value="">Choose merchant…</option>
                      {merchants.map((merchant) => (
                        <option key={merchant.id} value={merchant.id}>{merchant.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="text-xs font-medium text-slate-500">
                  INV code
                  <input value={form.code} onChange={(event) => set('code', event.target.value)} className={`mt-1 ${inputClass(false)}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Product name
                  <input value={form.name} onChange={(event) => set('name', event.target.value)} className={`mt-1 ${inputClass(false)}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  SRP (PHP)
                  <input type="number" min={0} step="0.01" value={form.srp} onChange={(event) => set('srp', event.target.value)} className={`mt-1 ${inputClass(false)}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Expiry (optional)
                  <input type="date" value={form.expiry} onChange={(event) => set('expiry', event.target.value)} className={`mt-1 ${inputClass(false)}`} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Category (optional)
                  <select value={form.category} onChange={(event) => set('category', event.target.value)} className={`mt-1 ${inputClass(false)}`}>
                    <option value="">No category</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Supplier (optional)
                  <input value={form.supplier} onChange={(event) => set('supplier', event.target.value)} placeholder="Who the merchant buys this from" className={`mt-1 ${inputClass(false)}`} />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button type="button" disabled={busy || !form.code || !form.name || !form.srp} onClick={save} className={primary}>
                    {editing ? 'Save changes' : 'Add product'}
                  </button>
                  <button type="button" onClick={() => { setForm(null); setEditing(null); }} className={plain}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setForm({ merchantId: merchantFilter !== 'all' ? merchantFilter : '', code: '', name: '', srp: '', expiry: '', supplier: '', category: '' })}
                className={`mt-3 ${primary}`}
              >
                Add a product
              </button>
            )}
          </Card>

          <Card
            title="Import from Excel"
            subtitle="Pick the merchant, then upload a sheet with the columns INV CODE, PRODUCT NAME, SRP, EXPIRY, SUPPLIER and CATEGORY (the last three are optional). A code already in the list is updated; an empty cell keeps what is saved."
          >
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-slate-500">
                Merchant for this file
                <select value={importFor} onChange={(event) => setImportMerchant(event.target.value)} className={`mt-1 ${inputClass(false)}`}>
                  <option value="">Choose merchant…</option>
                  {merchants.map((merchant) => (
                    <option key={merchant.id} value={merchant.id}>{merchant.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <SheetPicker label="Choose Excel / CSV file" onRead={onSheet} onError={(text) => { setSheet(null); setMessage({ tone: 'bad', text }); }} />
                <button
                  type="button"
                  onClick={() => downloadCsv('master-list-template.csv', [['INV CODE', 'PRODUCT NAME', 'SRP', 'EXPIRY', 'SUPPLIER', 'CATEGORY'], ['NC-01', 'Shantahl Premium Night Cream', '450', '2027-06-30', 'Supplier A', 'Beauty Products'], ['KS-01', 'Shantahl Premium Kojic Acid Soap', '1250', '', '', '']])}
                  className="text-xs font-medium text-emerald-700 underline"
                >
                  Download template
                </button>
              </div>
              {sheet?.problem ? <p role="alert" className="text-sm text-rose-700">{sheet.problem}</p> : null}
              {sheet && plan ? (
                <div className="rounded-xl bg-slate-50 p-3 text-sm" data-testid="product-import-preview">
                  {!importFor ? <p className="text-amber-700">Choose the merchant for this file first.</p> : null}
                  <p className="text-slate-700">
                    {sheet.rows.length} row{sheet.rows.length === 1 ? '' : 's'}: <strong>{plan.creates.length}</strong> new, <strong>{plan.updates.length}</strong> to update, {plan.unchanged} unchanged.
                  </p>
                  {plan.errors.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-rose-700">
                      {plan.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
                      {plan.errors.length > 8 ? <li>…and {plan.errors.length - 8} more.</li> : null}
                    </ul>
                  ) : null}
                  {plan.errors.length > 0 ? <p className="mt-2 text-xs text-slate-500">Nothing is saved until every row is fine. Fix the sheet and choose it again.</p> : null}
                  <button
                    type="button"
                    disabled={busy || plan.errors.length > 0 || !importFor || plan.creates.length + plan.updates.length === 0}
                    onClick={runImport}
                    className={`mt-3 ${primary}`}
                  >
                    Import {plan.creates.length + plan.updates.length} product{plan.creates.length + plan.updates.length === 1 ? '' : 's'}
                  </button>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <Card
        flush
        title="Master list"
        subtitle={user.role === 'merchant' ? 'Your products with SDSI.' : 'Products per merchant. The SKU form picks from this list.'}
        action={
          <div className="mr-5 flex flex-wrap items-center justify-end gap-2">
            <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} aria-label="Filter by supplier" className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm">
              <option value="all">All suppliers</option>
              {suppliers.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value={NONE}>No supplier</option>
            </select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category" className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm">
              <option value="all">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
              <option value={NONE}>No category</option>
            </select>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code or name"
              aria-label="Search the master list"
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5">INV code</th>
                <th className="px-3 py-2.5">Product</th>
                {user.role !== 'merchant' ? <th className="px-3 py-2.5">Merchant</th> : null}
                <th className="px-3 py-2.5 text-right">SRP</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Expiry</th>
                <th className="px-3 py-2.5 text-right">In SKUs</th>
                {canEdit ? <th className="px-5 py-2.5 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
                    {products.length === 0 ? 'No products yet. Add one above or import an Excel sheet.' : 'No product matches.'}
                  </td>
                </tr>
              ) : null}
              {rows.map((product) => {
                const expiry = product.expiryDate && today ? getExpiry({ expiryDate: product.expiryDate } as never, today) : null;
                return (
                  <tr key={product.id} data-testid="master-row">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{product.code}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{product.name}</td>
                    {user.role !== 'merchant' ? <td className="px-3 py-3 text-slate-600">{merchantName(product.merchantId)}</td> : null}
                    <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(product.srp)}</td>
                    <td className="px-3 py-3 text-slate-600">{product.category || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600">{product.supplier || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {product.expiryDate ? (
                        <span className="inline-flex items-center gap-2">
                          {formatDate(product.expiryDate)}
                          {expiry ? <ExpiryBadge status={expiry.status} daysLeft={expiry.daysLeft} /> : null}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{usedIn(product.id)}</td>
                    {canEdit ? (
                      <td className="px-5 py-3 text-right">
                        {confirmDelete === product.id ? (
                          <span className="inline-flex items-center gap-2 text-xs">
                            Delete {product.code}?
                            <button type="button" disabled={busy} onClick={() => remove(product)} className="font-semibold text-rose-700 underline">Yes, delete</button>
                            <button type="button" onClick={() => setConfirmDelete(null)} className="text-slate-600 underline">Cancel</button>
                          </span>
                        ) : (
                          <span className="inline-flex gap-3 text-xs font-semibold">
                            <button type="button" onClick={() => startEdit(product)} className="text-emerald-700 underline">Edit</button>
                            <button type="button" onClick={() => setConfirmDelete(product.id)} className="text-rose-700 underline">Delete</button>
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
