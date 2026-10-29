import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { ExpiryStatus } from '@/lib/inventory';

export function ExpiryBadge({ status, daysLeft }: { status: ExpiryStatus; daysLeft: number }) {
  if (status === 'ok') return null;
  return (
    <Badge tone={status === 'expired' ? 'red' : daysLeft <= 30 ? 'red' : 'amber'}>
      <Icon name="clock" className="h-3 w-3" />
      {status === 'expired' ? 'Expired' : `${daysLeft}d left`}
    </Badge>
  );
}
