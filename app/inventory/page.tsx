import { RoleGate } from '@/components/auth/RoleGate';
import { InventoryView } from '@/components/inventory/InventoryView';

export default function InventoryPage() {
  return (
    <RoleGate allow={['admin', 'cashier', 'merchant']}>
      <InventoryView />
    </RoleGate>
  );
}
