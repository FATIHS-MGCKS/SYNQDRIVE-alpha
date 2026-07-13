import { StatusChip } from '../../components/patterns';
import type { ApiTask } from '../../lib/api';
import { OperatorGlassCard } from './OperatorGlassCard';
import { summarizeBookingTaskGroup } from '../tasks/operatorTodayTasks';

interface Props {
  bookingId: string;
  tasks: ApiTask[];
  vehicleLabel?: string | null;
  bookingLabel?: string | null;
  onOpen: () => void;
  disabled?: boolean;
}

export function OperatorBookingTaskGroupCard({
  bookingId,
  tasks,
  vehicleLabel,
  bookingLabel,
  onOpen,
  disabled,
}: Props) {
  const overdue = tasks.some((task) => task.isOverdue);
  const title = vehicleLabel ?? bookingLabel ?? `Buchung ${bookingId.slice(0, 8)}…`;

  return (
    <OperatorGlassCard className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="sq-press w-full px-4 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground line-clamp-2">{title}</p>
          <StatusChip tone={overdue ? 'critical' : 'info'} dot>
            {overdue ? 'Überfällig' : 'Offen'}
          </StatusChip>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {tasks.length} Schritte: {summarizeBookingTaskGroup(tasks)}
        </p>
        {bookingLabel && vehicleLabel && (
          <p className="mt-1 text-[11px] text-muted-foreground">{bookingLabel}</p>
        )}
      </button>
    </OperatorGlassCard>
  );
}
