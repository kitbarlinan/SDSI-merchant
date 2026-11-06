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
  const sample = packageBreakdown(settings, ['sample-1', 'sample-2']);
  const counted = resellerLedger(orders, packageSales, items, settings.markupPct, settings.referrerPct + settings.systemFeePct).filter((row) => row.counted);
  const sum = (pick: (row: (typeof counted)[number]) => number) => counted.reduce((total, row) => total + pick(row), 0);
  const srpTotal = sum((row) => row.srpPhp);
  const tierPaid = sum((row) => row.tiers.reduce((t, tier) => t + tier.php, 0));
  const TOP = 'Yellow Basket top-up (as is)';
  const rows: [string, number, number][] = [
    [TOP, sample.netPhp, srp],
    [`Charged to the merchant: reseller discount ${settings.resellerDiscountPct}%`, sample.resellerPhp, srp],
    [`Charged to the merchant: referrer ${settings.referrerPct}%`, sample.referrerPhp, srp],
    [`Charged to the merchant: tier income ${settings.tierL1Pct + settings.tierL2Pct}% (L1 ${settings.tierL1Pct} / L2 ${settings.tierL2Pct})`, sample.tierPoolPhp, srp],
    [`Charged to the merchant: system fees ${settings.systemFeePct}%`, sample.systemFeePhp, srp],
  ];
  const actual: [string, number][] = [
    [TOP, sum((row) => row.netPhp)],
    ['Charged to the merchant: reseller discount', sum((row) => row.discountPhp)],
    ['Charged to the merchant: tier income paid', tierPaid],
  ];

  return (
    <Card
      title="Reseller program income"
      subtitle={`Sample on SRP ${formatCurrency(srp)} (the ${formatHkd(settings.packageHkd)} package) with a full 2-level upline. Every reseller purchase splits the same way. The deductions below are charged to the merchant; Yellow Basket's top-up stays as is. Details are on the Resellers page.`}
    >
      <table className="mt-3 min-w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map(([label, value, base]) => (
            <tr key={label} className={label === TOP ? 'font-semibold text-slate-900' : 'text-slate-700'}>
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
            <tr key={label} className={label === TOP ? 'font-semibold text-slate-900' : 'text-slate-700'}>
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
