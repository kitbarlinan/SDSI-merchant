import { RoleGate } from '@/components/auth/RoleGate';
import { OrdersView } from '@/components/orders/OrdersView';

export default function OrdersPage() {
  return (
    <RoleGate allow={['admin', 'cashier', 'merchant']}>
      <OrdersView />
    </RoleGate>
  );
}
