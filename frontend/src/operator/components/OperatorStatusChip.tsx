import { StatusChip } from '../../components/patterns';
import type { OperatorStatusBadge } from '../lib/operatorStatus';

interface OperatorStatusChipProps {
  badge: OperatorStatusBadge;
  className?: string;
}

export function OperatorStatusChip({ badge, className }: OperatorStatusChipProps) {
  return (
    <StatusChip tone={badge.tone} dot className={className}>
      {badge.label}
    </StatusChip>
  );
}

interface OperatorStatusRowProps {
  badges: OperatorStatusBadge[];
  className?: string;
}

export function OperatorStatusRow({ badges, className }: OperatorStatusRowProps) {
  if (badges.length === 0) return null;
  return (
    <div className={cnWrap(className)}>
      {badges.slice(0, 3).map((b) => (
        <OperatorStatusChip key={b.kind} badge={b} />
      ))}
    </div>
  );
}

function cnWrap(className?: string) {
  return ['flex flex-wrap gap-1.5', className].filter(Boolean).join(' ');
}
