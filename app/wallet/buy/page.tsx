'use client';

import { RoleGate } from '@/components/auth/RoleGate';
import { ResellerOrderForm } from '@/components/orders/ResellerOrderForm';

export default function BuyForMyselfPage() {
  return (
    <RoleGate allow={['admin', 'merchant']}>
      <ResellerOrderForm personal />
    </RoleGate>
  );
}
