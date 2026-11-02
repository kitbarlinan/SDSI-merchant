'use client';

import { Card } from '@/components/ui/Card';
import { packageBreakdown } from '@/lib/costing';
import { formatCurrency, formatHkd } from '@/lib/format';
import { useAppData } from '@/lib/store';

const pct = (value: number, base: number) => (base > 0 ? `${Math.round((value / base) * 1000) / 10}%` : '0%');

/** What SDSI keeps from a reseller package: the sample at full upline, and the packages actually sold. */
export function PackageIncomeCard() {
  const { costing, packageSales } = useAppData();
  const { settings } = costing;
  const srp = settings.packageSrpPhp;
  const sample = packageBreakdown(settings, ['sample-1', 'sample-2', 'sample-3']);
  const sum = (pick: (sale: (typeof packageSales)[number]) => number) => packageSales.reduce((total, sale) => total + pick(sale), 0);
  const srpTotal = sum((sale) => sale.srpPhp);
  const tierPaid = sum((sale) => sale.tiers.reduce((t, tier) => t + tier.php, 0));
  const rows: [string, number, number][] = [
    ['Top-up (gross)', sample.grossPhp, srp],
    [`Reseller ${settings.resellerDiscountPct}%`, -sample.resellerPhp, srp],
    [`Tier income ${settings.tierL1Pct + settings.tierL2Pct + settings.tierL3Pct}% (L1 ${settings.tierL1Pct} / L2 ${settings.tierL2Pct} / L3 ${settings.tierL3Pct})`, -sample.tierPoolPhp, srp],
    ['SDSI net', sample.netPhp, srp],
  ];
  const actual: [string, number][] = [
    ['Top-up (gross)', sum((sale) => sale.grossPhp)],
    ['Reseller share', -sum((sale) => sale.resellerPhp)],
    ['Tier income paid', -tierPaid],
    ['SDSI net', sum((sale) => sale.netPhp)],
  ];

  return (
    <Card
      title="Reseller package income"
      subtitle={`Sample on a ${formatHkd(settings.packageHkd)} package (SRP ${formatCurrency(srp)}) with a full 3-level upline. Everything comes out of SDSI's top-up.`}
    >
      <table className="mt-3 min-w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map(([label, value, base]) => (
            <tr key={label} className={label === 'SDSI net' ? 'font-semibold text-slate-900' : 'text-slate-700'}>
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(value)}</td>
              <td className="py-1.5 pl-3 text-right text-xs text-slate-500">{pct(Math.abs(value), base)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs font-medium text-slate-500">
        Sold so far: {packageSales.length} package{packageSales.length === 1 ? '' : 's'} · {formatHkd(sum((sale) => sale.hkd))} collected
      </p>
      <table className="mt-1 min-w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {actual.map(([label, value]) => (
            <tr key={label} className={label === 'SDSI net' ? 'font-semibold text-slate-900' : 'text-slate-700'}>
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCurrency(value)}</td>
              <td className="py-1.5 pl-3 text-right text-xs text-slate-500">{pct(Math.abs(value), srpTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
