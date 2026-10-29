import { PageHeader } from '@/components/layout/PageHeader';
import { InventoryView } from '@/components/inventory/InventoryView';

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Live stock levels. Quantities drop as soon as a sale is recorded."
      />
      <InventoryView />
    </div>
  );
}
