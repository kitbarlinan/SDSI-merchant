'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReceiptRow } from '@/components/inventory/ReceivingPanel';
import { Card } from '@/components/ui/Card';
import { MerchantFilter } from '@/components/ui/MerchantFilter';
import { formatNumber } from '@/lib/format';
import { useAppData } from '@/lib/store';

export function ApprovalsView() {
  const { receipts, merchants } = useAppData();
  const [merchantId, setMerchantId] = useState('all');

  const scoped = useMemo(
    () => (merchantId === 'all' ? receipts : receipts.filter((r) => r.merchantId === merchantId)),
    [receipts, merchantId],
  );
  const pending = scoped.filter((r) => r.status === 'pending');
  const decided = scoped.filter((r) => r.status !== 'pending').slice(0, 30);

  return (
    <div className="space-y-6">
      <PageHeader
        title="For Approval"
        description="Stock received by the cashier, and returns (RTS), only reach the shelf after Admin or Inventory Clerk approves."
      />
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <MerchantFilter merchants={merchants} value={merchantId} onChange={setMerchantId} />
      </div>

      <Card
        flush
        title="Waiting for your approval"
        subtitle={`${formatNumber(pending.length)} receipt${pending.length === 1 ? '' : 's'}`}
      >
        {pending.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">All clear. Nothing to approve.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((r) => (
              <ReceiptRow key={r.id} receipt={r} merchantFilter={merchantId} />
            ))}
          </ul>
        )}
      </Card>

      <Card flush title="Recent decisions" subtitle="Latest approved and rejected">
        {decided.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No decisions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {decided.map((r) => (
              <ReceiptRow key={r.id} receipt={r} merchantFilter={merchantId} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
