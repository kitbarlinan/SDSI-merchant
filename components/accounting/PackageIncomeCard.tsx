'use client';

import { Card } from '@/components/ui/Card';
import { packageBreakdown } from '@/lib/costing';
import { formatCurrency, formatHkd } from '@/lib/format';
import { resellerLedger } from '@/lib/reseller';
import { useAppData } from '@/lib/store';

const pct = (value: number, base: number) => (base > 0 ? `${Math.round((value / base) * 1000) / 10}%` : '0%');

/** What SDSI keeps from a reseller package: the sample at full upline, and the packages actually sold. */
export function PackageIncomeCard() {
  const { costing, packageSales, orders, items } = useAppData();
  const { settings } = costing;
  const srp = settings.packageSrpPhp;
  const sample = packageBreakdown(settings, ['sample-1', 'sample-2', 'sample-3']);
  const counted = resellerLedger(orders, packageSales, items, settings.markupPct).filter((row) => row.counted);
  const sum = (pick: (row: (typeof counted)[number]) => number) => counted.reduce((total, row) => total + pick(row), 0);
  const srpTotal = sum((row) => row.srpPhp);
  const tierPaid = sum((row) => row.tiers.reduce((t, tier) => t + tier.php, 0));
  const rows: [string, number, number][] = [
    ['Top-up (gross)', sample.grossPhp, srp],
    [`Reseller ${settings.resellerDiscountPct}%`, -sample.resellerPhp, srp],
    [`Tier income ${settings.tierL1Pct + settings.tierL2Pct + settings.tierL3Pct}% (L1 ${settings.tierL1Pct} / L2 ${settings.tierL2Pct} / L3 ${settings.tierL3Pct})`, -sample.tierPoolPhp, srp],
    ['SDSI net', sample.netPhp, srp],
  ];
  const actual: [string, number][] = [
    ['Top-up (gross)', sum((row) => row.topUpPhp)],
    ['Reseller discount', -sum((row) => row.discountPhp)],
    ['Tier income paid', -tierPaid],
    ['SDSI net', sum((row) => row.netPhp)],
  ];

  return (
    <Card
      title="Reseller program income"
      subtitle={`Sample on SRP ${formatCurrency(srp)} (the ${formatHkd(settings.packageHkd)} package) with a full 3-level upline. Every reseller purchase splits the same way, all out of SDSI's top-up. Details are on the Resellers page.`}
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
        Actual so far: {packageSales.length} package{packageSales.length === 1 ? '' : 's'} and {counted.length - packageSales.length} reseller order{counted.length - packageSales.length === 1 ? '' : 's'} (delivered)
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
