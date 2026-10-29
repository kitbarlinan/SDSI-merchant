import { PageHeader } from '@/components/layout/PageHeader';
import { ReportsView } from '@/components/reports/ReportsView';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting & Reports"
        description="Revenue, estimated cost of goods sold, profit, and the full sales ledger."
      />
      <ReportsView />
    </div>
  );
}
