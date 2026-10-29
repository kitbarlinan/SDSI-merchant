import { RoleGate } from '@/components/auth/RoleGate';
import { AccountingView } from '@/components/accounting/AccountingView';

export default function AccountingPage() {
  return (
    <RoleGate allow={['admin']}>
      <AccountingView />
    </RoleGate>
  );
}
