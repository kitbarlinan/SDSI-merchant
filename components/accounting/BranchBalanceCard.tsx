'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { merchantBalances } from '@/lib/branch-balance';
import { formatCurrency } from '@/lib/format';
import { useAppData } from '@/lib/store';
import { BRANCHES } from '@/lib/types';

/**
 * Check and balance: what each merchant earned at each branch, the total, and how that matches the one
 * consolidated payout. Both branches are paid out together; this just proves the numbers agree.
 */
export function BranchBalanceCard() {
  const { merchants, orders, remittances } = useAppData();
  const rows = useMemo(() => merchantBalances(merchants, orders, remittances), [merchants, orders, remittances]);
  const totals = BRANCHES.map((branch) => rows.reduce((sum, row) => sum + row.earnedByBranch[branch.id], 0));
  const grand = rows.reduce((sum, row) => sum + row.earned, 0);
  const allOk = rows.every((row) => row.checks.every((check) => check.ok));

  return (
    <Card
      title="Branch check & balances"
      subtitle="Merchant income (Net SRP, delivered orders) per branch. One consolidated payout covers both branches."
      action={<Badge tone={allOk ? 'green' : 'red'}>{allOk ? 'All balanced' : 'Out of balance'}</Badge>}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Merchant</th>
              {BRANCHES.map((branch) => (
                <th key={branch.id} className="px-4 py-2 text-right font-medium">{branch.name}</th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total earned</th>
              <th className="px-4 py-2 text-right font-medium">SF advance</th>
              <th className="px-4 py-2 text-right font-medium">Adjust.</th>
              <th className="px-4 py-2 text-right font-medium">Paid out</th>
              <th className="px-4 py-2 text-right font-medium">Still owed</th>
              <th className="px-4 py-2 text-center font-medium">Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const merchant = merchants.find((candidate) => candidate.id === row.merchantId);
              const failed = row.checks.filter((check) => !check.ok);
              return (
                <tr key={row.merchantId}>
                  <td className="px-4 py-3 font-medium text-slate-900">{merchant?.name ?? row.merchantId}</td>
                  {BRANCHES.map((branch) => (
                    <td key={branch.id} className="px-4 py-3 text-right">{formatCurrency(row.earnedByBranch[branch.id])}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(row.earned)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.deducted ? `−${formatCurrency(row.deducted)}` : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.adjustments ? formatCurrency(row.adjustments) : '—'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(row.paidOut)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(row.owed)}</td>
                  <td className="px-4 py-3 text-center" title={row.checks.map((check) => `${check.ok ? 'OK' : 'DIFF'}: ${check.label}`).join('\n')}>
                    {failed.length === 0 ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">{failed.length} off</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td className="px-4 py-3">All merchants</td>
              {totals.map((total, index) => (
                <td key={BRANCHES[index].id} className="px-4 py-3 text-right">{formatCurrency(total)}</td>
              ))}
              <td className="px-4 py-3 text-right">{formatCurrency(grand)}</td>
              <td colSpan={5} className="px-4 py-3 text-right text-xs font-normal text-slate-500">
                {BRANCHES.map((branch, index) => `${branch.name} ${formatCurrency(totals[index])}`).join(' + ')} = {formatCurrency(grand)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
        {rows[0]?.checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2">
            <span className={rows.every((row) => row.checks.find((c) => c.label === check.label)?.ok) ? 'text-emerald-700' : 'text-rose-600'}>
              {rows.every((row) => row.checks.find((c) => c.label === check.label)?.ok) ? '✓' : '✗'}
            </span>
            {check.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}
