'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { ProductList, parseQuantities, type ListRow } from '@/components/orders/ProductList';
import { PageHeader } from '@/components/layout/PageHeader';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { isSellable, livePickup, orderCharges } from '@/lib/costing';
import { formatDate, formatHkd } from '@/lib/format';
import { MOCK_TODAY } from '@/lib/mock-data';
import { TERMS_LABEL, availableOf, reservedByItem } from '@/lib/orders';
import { useAppData } from '@/lib/store';
import { ORDER_TERMS, type Order } from '@/lib/types';
import { useToday } from '@/lib/use-today';
import { validateOrderForm, type OrderField, type RawOrderForm } from '@/lib/validation';

const EMPTY_FORM: RawOrderForm = {
  customerName: '',
  contactNo: '',
  address: '',
  barangay: '',
  city: '',
  terms: 'COD',
};

export function NewOrderForm() {
  const { user } = useAuth();
  const { items, orders, merchants, costing, placeOrder } = useAppData();
  const today = useToday() || MOCK_TODAY;

  const [typed, setTyped] = useState<Record<string, string>>({});
  const [form, setForm] = useState<RawOrderForm>(EMPTY_FORM);
  const [landmarks, setLandmarks] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState<Partial<Record<OrderField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);

  const reserved = useMemo(() => reservedByItem(orders), [orders]);
  const rows: ListRow[] = useMemo(
    () =>
      items
        .filter((item) => item.merchantId === user?.merchantId && isSellable(item, costing))
        .map((item) => ({
          item,
          available: availableOf(item, reserved),
          expired: item.expiryDate < today,
          pickupHkd: livePickup(costing, item.id) ?? 0,
        })),
    [items, reserved, user, today, costing],
  );

  const parsed = parseQuantities(rows, typed);
  const errors = validateOrderForm(form, parsed.lines.length);
  const charges =
    parsed.lines.length > 0
      ? orderCharges(
          parsed.lines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
          costing,
        )
      : null;
  const hasRowErrors = Object.keys(parsed.errors).length > 0;
  const showError = (field: OrderField) => (touched[field] || submitted ? errors[field] : undefined);
  const touch = (field: OrderField) => () => setTouched((prev) => ({ ...prev, [field]: true }));

  function update<K extends keyof RawOrderForm>(key: K, value: RawOrderForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setServerError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!user || hasRowErrors || Object.keys(errors).length > 0) return;

    const isCod = form.terms === 'COD';
    const address = isCod
      ? [form.address, form.barangay && `Brgy. ${form.barangay.replace(/^brgy\.?\s*/i, '')}`, form.city]
          .map((part) => (part || '').trim())
          .filter(Boolean)
          .join(', ')
      : '';
    const noteParts = [landmarks.trim() && `Landmark: ${landmarks.trim()}`, notes.trim()].filter(Boolean);

    const result = placeOrder(user, {
      customerName: form.customerName,
      contactNo: form.contactNo,
      address,
      notes: noteParts.join(' · '),
      terms: form.terms,
      lines: parsed.lines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
    });

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    setPlaced(result.value);
    setTyped({});
    setForm(EMPTY_FORM);
    setLandmarks('');
    setNotes('');
    setTouched({});
    setSubmitted(false);
  }

  if (!user) return null;
  const isCod = form.terms === 'COD';
  const merchantName = merchants.find((m) => m.id === user.merchantId)?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop for customer"
        description="Enter the customer, type the quantity on each product, then submit. The cashier sees it right away."
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

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <div className="text-sm">
              <p className="text-xs font-medium text-slate-500">Date</p>
              <p className="mt-1 font-semibold text-slate-900">{formatDate(today)}</p>
              {merchantName ? <p className="text-xs text-slate-500">{merchantName}</p> : null}
            </div>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-slate-700">Payment option</legend>
              <div className="grid grid-cols-2 gap-2">
                {ORDER_TERMS.map((option) => {
                  const active = form.terms === option;
                  return (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-xl border p-2.5 text-sm transition-colors ${
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
            </fieldset>

            <Field label="Customer" htmlFor="customerName" error={showError('customerName')}>
              <input
                id="customerName"
                type="text"
                autoComplete="off"
                value={form.customerName}
                onChange={(event) => update('customerName', event.target.value)}
                onBlur={touch('customerName')}
                aria-invalid={Boolean(showError('customerName'))}
                className={inputClass(Boolean(showError('customerName')))}
                placeholder="Customer name"
              />
            </Field>

            <Field label="Mobile #" htmlFor="contactNo" error={showError('contactNo')}>
              <input
                id="contactNo"
                type="tel"
                autoComplete="off"
                value={form.contactNo}
                onChange={(event) => update('contactNo', event.target.value)}
                onBlur={touch('contactNo')}
                aria-invalid={Boolean(showError('contactNo'))}
                className={inputClass(Boolean(showError('contactNo')))}
                placeholder="Mobile No"
              />
            </Field>

            {isCod ? (
              <>
                <div className="md:col-span-2">
                  <Field label="Address" htmlFor="address" error={showError('address')}>
                    <textarea
                      id="address"
                      rows={2}
                      value={form.address}
                      onChange={(event) => update('address', event.target.value)}
                      onBlur={touch('address')}
                      aria-invalid={Boolean(showError('address'))}
                      className={inputClass(Boolean(showError('address')))}
                      placeholder="House no., street"
                    />
                  </Field>
                </div>
                <Field label="City / Town" htmlFor="city" error={showError('city')}>
                  <input
                    id="city"
                    type="text"
                    value={form.city}
                    onChange={(event) => update('city', event.target.value)}
                    onBlur={touch('city')}
                    aria-invalid={Boolean(showError('city'))}
                    className={inputClass(Boolean(showError('city')))}
                  />
                </Field>
                <Field label="Brgy" htmlFor="barangay">
                  <input
                    id="barangay"
                    type="text"
                    value={form.barangay}
                    onChange={(event) => update('barangay', event.target.value)}
                    className={inputClass(false)}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Landmarks" htmlFor="landmarks">
                    <textarea
                      id="landmarks"
                      rows={2}
                      value={landmarks}
                      onChange={(event) => setLandmarks(event.target.value)}
                      className={inputClass(false)}
                      placeholder="Near the church, blue gate..."
                    />
                  </Field>
                </div>
              </>
            ) : (
              <p className="self-end text-xs text-slate-500 md:col-span-2">
                Cash on pickup: no delivery address needed. The customer pays when they pick it up.
              </p>
            )}
          </div>
        </section>

        {showError('lines') ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {showError('lines')}
          </p>
        ) : null}

        <ProductList
          rows={rows}
          merchants={merchants}
          typed={typed}
          errors={parsed.errors}
          onChange={(itemId, value) => {
            setTyped((prev) => ({ ...prev, [itemId]: value }));
            setServerError(null);
          }}
          footer={
            <div className="space-y-4">
              <div className="ml-auto max-w-xs space-y-1 text-sm">
                <p className="flex justify-between text-slate-600">
                  <span>Total (pickup price, HKD)</span>
                  <span>{formatHkd(parsed.totalHkd)}</span>
                </p>
                {form.terms === 'COD' && parsed.lines.length > 0 ? (
                  <p className="flex justify-between text-xs text-slate-600">
                    <span>SF (shipping fee, HKD)</span>
                    <span>{charges === null ? 'Not live yet' : formatHkd(charges.sfHkd)}</span>
                  </p>
                ) : null}
                {form.terms === 'COD' && parsed.lines.length > 0 ? (
                  <p className="flex justify-between text-xs text-slate-600">
                    <span>CF (collection fee, HKD)</span>
                    <span>{charges === null ? 'Not live yet' : formatHkd(charges.cfHkd)}</span>
                  </p>
                ) : null}
                <p className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900">
                  <span>Net total (to collect, HKD)</span>
                  <span>
                    {formatHkd(form.terms === 'COD' ? (charges?.netCodHkd ?? parsed.totalHkd) : parsed.totalHkd)}
                  </span>
                </p>
              </div>
              <label className="block text-xs font-medium text-slate-500">
                Note for the cashier (optional)
                <input
                  type="text"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={`mt-1 ${inputClass(false)}`}
                  placeholder="e.g. include a free sample"
                />
              </label>
            </div>
          }
        />

        {serverError ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {serverError}
          </div>
        ) : null}
        {submitted && (hasRowErrors || Object.keys(errors).length > 0) ? (
          <p className="text-right text-xs text-rose-600">Fix the highlighted fields to continue.</p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <Icon name="check" className="h-4 w-4" />
            Submit order
          </button>
        </div>
      </form>
    </div>
  );
}
