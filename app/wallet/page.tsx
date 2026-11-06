import { RoleGate } from '@/components/auth/RoleGate';
import { WalletView } from '@/components/wallet/WalletView';

export default function WalletPage() {
  return (
    <RoleGate allow={['admin', 'merchant', 'cashier', 'clerk', 'customer']}>
      <WalletView />
    </RoleGate>
  );
}
