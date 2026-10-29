'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatNumber, roundMoney } from '@/lib/format';
import { TERMS_LABEL, availableOf, reservedByItem } from '@/lib/orders';
import { useAppData } from '@/lib/store';
import { CATEGORY_COLORS } from '@/lib/theme';
import { ORDER_TERMS, type Order, type OrderTerms } from '@/lib/types';
import { useToday } from '@/lib/use-today';
import { validateOrderForm, type OrderField, type RawOrderForm } from '@/lib/validation';

const EMPTY_FORM: RawOrderForm = { customerName: '', contactNo: '', address: '', terms: 'COD' };

const TERMS_HINT: Record<OrderTerms, string> = {
  COP: 'Customer pays when they pick the order up.',
  COD: 'Customer pays the rider on delivery. Address required.',
};

export function NewOrderForm() {
  const { user } = useAuth();
  const { items, orders, placeOrder } = useAppData();
  const today = useToday();

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [form, setForm] = useState<RawOrderForm>(EMPTY_FORM);
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState<Partial<Record<OrderField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);

  const reserved = useMemo(() => reservedByItem(orders), [orders]);
  const catalog = useMemo(
    () => items.filter((item) => item.merchantId === user?.merchantId),
    [items, user],
  );

  // Per-product checks: whole number, and no more than what is still available.
  const rows = catalog.map((item) => {
    const raw = quantities[item.id] ?? '';
    const quantity = raw.trim() === '' ? 0 : Number(raw);
    const available = availableOf(item, reserved);
    const expired = Boolean(today) && item.expiryDate < today;
    let error: string | undefined;
    if (raw.trim() !== '') {
      if (!Number.isInteger(quantity) || quantity < 0) error = 'Whole number only.';
      else if (quantity > available) error = `Only ${available} available.`;
    }
    return { item, raw, quantity: error ? 0 : quantity, available, expired, error };
  });

  const chosen = rows.filter((row) => row.quantity > 0);
  const total = roundMoney(chosen.reduce((sum, row) => sum + row.quantity * row.item.unitPrice, 0));
  const rowErrors = rows.some((row) => row.error);

  const errors = validateOrderForm(form, chosen.length);
  const showError = (field: OrderField) =>
    touched[field] || submitted ? errors[field] : undefined;
  const touch = (field: OrderField) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  const setQuantity = (itemId: string, value: string) => {
    setQuantities((prev) => ({ ...prev, [itemId]: value }));
    setServerError(null);
  };

  const step = (itemId: string, delta: number, max: number) => {
    const current = Number(quantities[itemId] || 0);
    const next = Math.max(0, Math.min(max, (Number.isInteger(current) ? current : 0) + delta));
    setQuantity(itemId, next === 0 ? '' : String(next));
  };

  function update<K extends keyof RawOrderForm>(key: K, value: RawOrderForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setServerError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!user || rowErrors || Object.keys(errors).length > 0) return;

    const result = placeOrder(user, {
      customerName: form.customerName,
      contactNo: form.contactNo,
      address: form.address,
      notes,
      terms: form.terms,
      lines: chosen.map((row) => ({ itemId: row.item.id, quantity: row.quantity })),
    });

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    setPlaced(result.value);
    setQuantities({});
    setForm(EMPTY_FORM);
    setNotes('');
    setTouched({});
    setSubmitted(false);
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New order"
        description="Pick the products and enter the customer. The cashier will see it right away."
      />

      {placed ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium">Order {placed.id} placed</p>
            <p className="mt-0.5 text-emerald-800">
              The cashier can now pack it. Stock is reserved for this order.{' '}
              <Link href="/orders" className="font-medium underline">
                View my orders
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPlaced(null)}
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          flush
          title="Products"
          subtitle="Available = on hand minus what is already reserved for open orders"
        >
          {showError('lines') ? (
            <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
              {showError('lines')}
            </p>
          ) : null}
          <ul className="divide-y divide-slate-100">
            {rows.map(({ item, raw, available, expired, error }) => {
              const disabled = available <= 0 || expired;
              const max = available;
              return (
                <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono">{item.sku}</span>
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: CATEGORY_COLORS[item.category] }}
                        />
                        {item.category}
                      </span>
                      <span className="font-medium text-slate-700">{formatCurrency(item.unitPrice)}</span>
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${
                        expired || available <= 0 ? 'text-rose-600' : 'text-slate-500'
                      }`}
                    >
                      {expired
                        ? 'Expired: cannot be ordered'
                        : available <= 0
                          ? 'Out of stock'
                          : `${formatNumber(available)} available`}
                    </p>
                    {error ? (
                      <p role="alert" className="mt-0.5 text-xs text-rose-600">
                        {error}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => step(item.id, -1, max)}
                      aria-label={`Decrease ${item.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="minus" className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      disabled={disabled}
                      value={raw}
                      onChange={(event) => setQuantity(item.id, event.target.value)}
                      aria-label={`Quantity of ${item.name}`}
                      aria-invalid={Boolean(error)}
                      placeholder="0"
                      className={`w-16 text-center ${inputClass(Boolean(error))}`}
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => step(item.id, 1, max)}
                      aria-label={`Increase ${item.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="plus" className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="space-y-5 lg:col-span-2" title="Customer & payment">
          <div className="mt-4 space-y-5">
            {serverError ? (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {serverError}
              </div>
            ) : null}

            <Field label="Customer name" htmlFor="customerName" error={showError('customerName')}>
              <input
                id="customerName"
                type="text"
                autoComplete="off"
                value={form.customerName}
                onChange={(event) => update('customerName', event.target.value)}
                onBlur={touch('customerName')}
                aria-invalid={Boolean(showError('customerName'))}
                className={inputClass(Boolean(showError('customerName')))}
                placeholder="e.g. Maria Santos"
              />
            </Field>

            <Field
              label="Contact number (optional)"
              htmlFor="contactNo"
              error={showError('contactNo')}
            >
              <input
                id="contactNo"
                type="tel"
                autoComplete="off"
                value={form.contactNo}
                onChange={(event) => update('contactNo', event.target.value)}
                onBlur={touch('contactNo')}
                aria-invalid={Boolean(showError('contactNo'))}
                className={inputClass(Boolean(showError('contactNo')))}
                placeholder="09xx xxx xxxx"
              />
            </Field>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-slate-700">Payment terms</legend>
              <div className="grid grid-cols-2 gap-2">
                {ORDER_TERMS.map((option) => {
                  const active = form.terms === option;
                  return (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-xl border p-3 text-sm transition-colors ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                          : 'border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="terms"
                        value={option}
                        checked={active}
                        onChange={() => update('terms', option)}
                        className="sr-only"
                      />
                      <span className="block font-semibold text-slate-900">{option}</span>
                      <span className="block text-xs text-slate-600">{TERMS_LABEL[option]}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{TERMS_HINT[form.terms]}</p>
            </fieldset>

            {form.terms === 'COD' ? (
              <Field label="Delivery address" htmlFor="address" error={showError('address')}>
                <textarea
                  id="address"
                  rows={2}
                  value={form.address}
                  onChange={(event) => update('address', event.target.value)}
                  onBlur={touch('address')}
                  aria-invalid={Boolean(showError('address'))}
                  className={inputClass(Boolean(showError('address')))}
                  placeholder="House no., street, barangay, city"
                />
              </Field>
            ) : null}

            <Field label="Note for the cashier (optional)" htmlFor="notes">
              <input
                id="notes"
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={inputClass(false)}
                placeholder="e.g. include a free sample"
              />
            </Field>

            <div className="space-y-1 rounded-xl bg-slate-50 p-4 text-sm">
              {chosen.length === 0 ? (
                <p className="text-slate-500">No products selected yet.</p>
              ) : (
                chosen.map((row) => (
                  <p key={row.item.id} className="flex justify-between gap-3 text-slate-700">
                    <span className="truncate">
                      {row.quantity}× {row.item.name}
                    </span>
                    <span className="shrink-0">{formatCurrency(row.quantity * row.item.unitPrice)}</span>
                  </p>
                ))
              )}
              <p className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <span>Total to collect</span>
                <span>{formatCurrency(total)}</span>
              </p>
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <Icon name="check" className="h-4 w-4" />
              Place order
            </button>
            {submitted && (rowErrors || Object.keys(errors).length > 0) ? (
              <p className="text-center text-xs text-rose-600">Fix the highlighted fields to continue.</p>
            ) : null}
          </div>
        </Card>
      </form>
    </div>
  );
}
