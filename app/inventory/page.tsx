import { InventoryView } from '@/components/inventory/InventoryView';
import { PageHeader } from '@/components/layout/PageHeader';

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Live stock levels, expiry dates and reorder timing. Quantities drop as soon as a sale is recorded."
      />
      <InventoryView />
    </div>
  );
}
