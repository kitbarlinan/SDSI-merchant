'use client';

import { useState } from 'react';
import { Field, inputClass } from '@/components/ui/Field';
import { useAuth } from '@/lib/auth';
import { formatHkd } from '@/lib/format';
import { useAppData } from '@/lib/store';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/types';

/** Counter sale of the reseller package. Recording it makes the buyer an active reseller. */
export function PackagePanel() {
  const { user } = useAuth();
  const { users, packageSales, packageRequests, costing, recordPackageSale } = useAppData();
  const bought = new Set(packageSales.map((sale) => sale.resellerId));
  const waiting = users.filter((candidate) => candidate.role === 'customer' && !bought.has(candidate.id));
  const asked = new Set(packageRequests.map((request) => request.resellerId));
  const sorted = [...waiting].sort((a, b) => Number(asked.has(b.id)) - Number(asked.has(a.id)));

  const [resellerId, setResellerId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const { packageHkd } = costing.settings;

  function record() {
    const result = recordPackageSale(user!, resellerId, method);
    if (!result.ok) {
      setMessage(null);
      return setError(result.error);
    }
    setError(null);
    setResellerId('');
    setMessage(`${result.value.id}: ${result.value.resellerName} paid ${formatHkd(result.value.hkd)} via ${method}. They are a reseller now.`);
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Reseller package · {formatHkd(packageHkd)}</h2>
      <p className="mt-0.5 text-sm text-slate-500">Take the payment, then record it. The buyer can order with the reseller discount right after.</p>
      {message ? (
        <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Every reseller already has the package.</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-3 md:items-end">
          <Field label="Reseller" htmlFor="pkgReseller">
            <select id="pkgReseller" value={resellerId} onChange={(event) => setResellerId(event.target.value)} className={inputClass(false)}>
              <option value="">Choose a reseller</option>
              {sorted.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                  {asked.has(candidate.id) ? ' (asked to buy)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Payment" htmlFor="pkgMethod">
            <select id="pkgMethod" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} className={inputClass(false)}>
              {PAYMENT_METHODS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            disabled={!resellerId}
            onClick={record}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Record package sale
          </button>
        </div>
      )}
    </section>
  );
}
