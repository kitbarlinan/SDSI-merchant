import { RoleGate } from '@/components/auth/RoleGate';
import { PosView } from '@/components/pos/PosView';

export default function PosPage() {
  return (
    <RoleGate allow={['admin', 'cashier']}>
      <PosView />
    </RoleGate>
  );
}
