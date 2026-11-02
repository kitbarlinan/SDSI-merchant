'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatHkd } from '@/lib/format';
import { tierIncome } from '@/lib/orders';
import { useAppData } from '@/lib/store';

/** Admin and cashier: who has bought the reseller package, and record a new package sale. */
export function ResellersView() {
  const { user } = useAuth();
  const { users, packageSales, costing, recordPackageSale } = useAppData();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const resellers = users.filter((candidate) => candidate.role === 'customer');
  const bought = new Set(packageSales.map((sale) => sale.resellerId));
  const nameOf = (id: string) => users.find((candidate) => candidate.id === id)?.name ?? id;
  const showPeso = user.role === 'admin';
  const { packageHkd } = costing.settings;

  function record(resellerId: string) {
    const result = recordPackageSale(user!, resellerId);
    if (!result.ok) {
      setMessage(null);
      return setError(result.error);
    }
    setError(null);
    setMessage(`Package ${result.value.id} recorded for ${result.value.resellerName}. They can order now.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resellers"
        description={`A reseller package costs ${formatHkd(packageHkd)}. Once it is paid and recorded here, the buyer can order with the reseller discount and the 3 sponsors above earn tier income.`}
      />
      {message ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <Card title="Resellers" subtitle="Sponsor is the reseller who brought them in.">
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {resellers.map((reseller) => (
            <li key={reseller.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-medium text-slate-900">{reseller.name}</span>
                <span className="ml-2 text-xs text-slate-500">
                  Sponsor: {reseller.sponsorId ? nameOf(reseller.sponsorId) : 'none'}
                  {showPeso && bought.has(reseller.id) ? ` · Tier income ${formatCurrency(tierIncome(packageSales, reseller.id).total)}` : ''}
                </span>
              </span>
              {bought.has(reseller.id) ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Active</span>
              ) : (
                <button
                  type="button"
                  onClick={() => record(reseller.id)}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Record {formatHkd(packageHkd)} package paid
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Package sales">
        {packageSales.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No package sold yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {packageSales.map((sale) => (
              <li key={sale.id} className="space-y-1 py-2.5">
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-mono text-xs">{sale.id}</span> · {sale.resellerName}
                    <span className="ml-2 text-xs text-slate-500">{formatDate(sale.createdAt.slice(0, 10))}</span>
                  </span>
                  <span className="font-semibold text-slate-900">{formatHkd(sale.hkd)}</span>
                </p>
                {showPeso ? (
                  <p className="text-xs text-slate-500">
                    SRP {formatCurrency(sale.srpPhp)} · Top-up {formatCurrency(sale.grossPhp)} − Reseller {formatCurrency(sale.resellerPhp)}
                    {sale.tiers.map((tier) => ` − L${tier.level} ${nameOf(tier.userId)} ${formatCurrency(tier.php)}`).join('')} = Net{' '}
                    <span className="font-semibold text-slate-700">{formatCurrency(sale.netPhp)}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
