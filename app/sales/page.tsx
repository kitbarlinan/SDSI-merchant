import { PageHeader } from '@/components/layout/PageHeader';
import { RecentSales } from '@/components/sales/RecentSales';
import { SalesForm } from '@/components/sales/SalesForm';

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Input"
        description="Record a sale. Stock is deducted from inventory automatically."
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SalesForm />
        </div>
        <div className="lg:col-span-2">
          <RecentSales />
        </div>
      </div>
    </div>
  );
}
