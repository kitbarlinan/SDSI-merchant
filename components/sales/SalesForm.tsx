'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency, roundMoney, todayISO } from '@/lib/format';
import { useMerchant } from '@/lib/store';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  SALES_CHANNELS,
  type PaymentMethod,
  type Sale,
  type SalesChannel,
} from '@/lib/types';
import { validateSaleForm, type RawSaleForm, type SaleField } from '@/lib/validation';

const EMPTY_FORM: RawSaleForm = {
  itemId: '',
  quantity: '',
  unitPrice: '',
  paymentMethod: '',
  channel: '',
  customerName: '',
  date: '',
};

export function SalesForm() {
  const { items, addSale } = useMerchant();

  const [form, setForm] = useState<RawSaleForm>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<SaleField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Sale | null>(null);
  const [today, setToday] = useState('');

  // Date defaults are set after mount to avoid server/client timezone mismatches.
  useEffect(() => {
    const now = todayISO();
    setToday(now);
    setForm((prev) => (prev.date ? prev : { ...prev, date: now }));
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 8000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  const item = items.find((candidate) => candidate.id === form.itemId);
  const errors = useMemo(() => validateSaleForm(form, item, today), [form, item, today]);
  const errorCount = Object.keys(errors).length;

  const quantity = Number(form.quantity);
  const price = Number(form.unitPrice);
  const quantityValid = Number.isInteger(quantity) && quantity > 0;
  const total =
    quantityValid && Number.isFinite(price) && price > 0 ? roundMoney(quantity * price) : 0;
  const stockAfter = item && quantityValid ? item.stock - quantity : null;
  const sellingBelowCost =
    Boolean(item) && Number.isFinite(price) && price > 0 && price < (item?.unitCost ?? 0);

  const visibleError = (field: SaleField) =>
    touched[field] || submitted ? errors[field] : undefined;

  const touch = (field: SaleField) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  function update<K extends keyof RawSaleForm>(key: K, value: RawSaleForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setServerError(null);
  }

  function handleItemChange(itemId: string) {
    const next = items.find((candidate) => candidate.id === itemId);
    setForm((prev) => ({
      ...prev,
      itemId,
      unitPrice: next ? String(next.unitPrice) : '',
      quantity: prev.quantity || (next ? '1' : ''),
    }));
    setTouched((prev) => ({ ...prev, itemId: true }));
    setServerError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (errorCount > 0 || !item) return;

    const result = addSale({
      itemId: item.id,
      quantity,
      unitPrice: price,
      paymentMethod: form.paymentMethod as PaymentMethod,
      channel: form.channel as SalesChannel,
      customerName: form.customerName,
      date: form.date,
    });

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    setConfirmation(result.sale);
    setForm({ ...EMPTY_FORM, date: today });
    setTouched({});
    setSubmitted(false);
  }

  const confirmedItem = confirmation
    ? items.find((candidate) => candidate.id === confirmation.itemId)
    : undefined;

  return (
    <Card title="New sale" subtitle="Stock is deducted as soon as you record it.">
      {confirmation ? (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium">Sale {confirmation.id} recorded</p>
            <p className="mt-0.5 text-emerald-800">
              {confirmation.quantity} × {confirmation.itemName} for{' '}
              {formatCurrency(confirmation.total)} via {confirmation.channel} (
              {confirmation.paymentMethod}).
              {confirmedItem ? ` Stock left: ${confirmedItem.stock}.` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {serverError ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {serverError}
          </div>
        ) : null}

        <Field label="Product" htmlFor="itemId" error={visibleError('itemId')}>
          <select
            id="itemId"
            value={form.itemId}
            onChange={(event) => handleItemChange(event.target.value)}
            onBlur={touch('itemId')}
            aria-invalid={Boolean(visibleError('itemId'))}
            className={inputClass(Boolean(visibleError('itemId')))}
          >
            <option value="">Select a product…</option>
            {CATEGORIES.map((category) => {
              const group = items.filter((candidate) => candidate.category === category);
              if (group.length === 0) return null;
              return (
                <optgroup key={category} label={category}>
                  {group.map((candidate) => (
                    <option key={candidate.id} value={candidate.id} disabled={candidate.stock <= 0}>
                      {candidate.name} ({candidate.stock <= 0 ? 'out of stock' : `${candidate.stock} in stock`})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label="Quantity"
            htmlFor="quantity"
            error={visibleError('quantity')}
            hint={
              item
                ? stockAfter !== null && stockAfter >= 0
                  ? `Stock after sale: ${stockAfter}`
                  : `Available: ${item.stock}`
                : undefined
            }
          >
            <input
              id="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.quantity}
              onChange={(event) => update('quantity', event.target.value)}
              onBlur={touch('quantity')}
              aria-invalid={Boolean(visibleError('quantity'))}
              className={inputClass(Boolean(visibleError('quantity')))}
              placeholder="0"
            />
          </Field>

          <Field
            label="Unit price (₱)"
            htmlFor="unitPrice"
            error={visibleError('unitPrice')}
            hint={
              sellingBelowCost && item ? (
                <span className="text-amber-700">
                  Below unit cost ({formatCurrency(item.unitCost)}): this sale loses money.
                </span>
              ) : undefined
            }
          >
            <input
              id="unitPrice"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={form.unitPrice}
              onChange={(event) => update('unitPrice', event.target.value)}
              onBlur={touch('unitPrice')}
              aria-invalid={Boolean(visibleError('unitPrice'))}
              className={inputClass(Boolean(visibleError('unitPrice')))}
              placeholder="0.00"
            />
          </Field>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Total</span>
            <output
              aria-live="polite"
              className="flex h-[42px] items-center rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900"
            >
              {formatCurrency(total)}
            </output>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Payment method" htmlFor="paymentMethod" error={visibleError('paymentMethod')}>
            <select
              id="paymentMethod"
              value={form.paymentMethod}
              onChange={(event) => update('paymentMethod', event.target.value)}
              onBlur={touch('paymentMethod')}
              aria-invalid={Boolean(visibleError('paymentMethod'))}
              className={inputClass(Boolean(visibleError('paymentMethod')))}
            >
              <option value="">Select…</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Sales channel" htmlFor="channel" error={visibleError('channel')}>
            <select
              id="channel"
              value={form.channel}
              onChange={(event) => update('channel', event.target.value)}
              onBlur={touch('channel')}
              aria-invalid={Boolean(visibleError('channel'))}
              className={inputClass(Boolean(visibleError('channel')))}
            >
              <option value="">Select…</option>
              {SALES_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="customerName" error={visibleError('customerName')}>
            <input
              id="customerName"
              type="text"
              autoComplete="off"
              value={form.customerName}
              onChange={(event) => update('customerName', event.target.value)}
              onBlur={touch('customerName')}
              aria-invalid={Boolean(visibleError('customerName'))}
              className={inputClass(Boolean(visibleError('customerName')))}
              placeholder="e.g. Maria Santos or Walk-in"
            />
          </Field>

          <Field label="Date" htmlFor="date" error={visibleError('date')}>
            <input
              id="date"
              type="date"
              max={today || undefined}
              value={form.date}
              onChange={(event) => update('date', event.target.value)}
              onBlur={touch('date')}
              aria-invalid={Boolean(visibleError('date'))}
              className={inputClass(Boolean(visibleError('date')))}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <p className="text-sm text-slate-500">
            {submitted && errorCount > 0
              ? `Fix ${errorCount} field${errorCount > 1 ? 's' : ''} to continue.`
              : 'All fields are required.'}
          </p>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <Icon name="plus" className="h-4 w-4" />
            Record sale
          </button>
        </div>
      </form>
    </Card>
  );
}
