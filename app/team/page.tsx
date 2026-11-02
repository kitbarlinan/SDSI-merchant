import { RoleGate } from '@/components/auth/RoleGate';
import { TeamView } from '@/components/team/TeamView';

export default function TeamPage() {
  return (
    <RoleGate allow={['admin']}>
      <TeamView />
    </RoleGate>
  );
}
