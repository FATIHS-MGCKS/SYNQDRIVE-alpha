import { CheckCircle2, MessageSquare, Play } from 'lucide-react';
import { PriorityBadge, StatusChip } from '../../components/patterns';
import type { ApiTask } from '../../lib/api';
import {
  isTerminalTaskStatus,
  taskStatusLabelDe,
  taskStatusTone,
} from '../../rental/lib/task-detail.utils';
import { OperatorGlassCard } from '../components/OperatorGlassCard';
import { formatOperatorTaskDue } from './operatorTask.utils';

interface Props {
  task: ApiTask;
  vehicleLabel?: string | null;
  bookingLabel?: string | null;
  onOpen: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  onComment?: () => void;
  disabled?: boolean;
}

export function OperatorTaskCard({
  task,
  vehicleLabel,
  bookingLabel,
  onOpen,
  onStart,
  onComplete,
  onComment,
  disabled,
}: Props) {
  const terminal = isTerminalTaskStatus(task.status);
  const canStart = !terminal && (task.status === 'OPEN' || task.status === 'WAITING');
  const canComplete = !terminal && task.status !== 'DONE';

  return (
    <OperatorGlassCard className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="sq-press w-full px-4 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground line-clamp-2">{task.title}</p>
          <PriorityBadge priority={task.priority} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusChip tone={taskStatusTone(task.status, task.isOverdue)} dot>
            {task.isOverdue ? 'Überfällig' : taskStatusLabelDe(task.status)}
          </StatusChip>
          {task.dueDate && (
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
              Fällig {formatOperatorTaskDue(task.dueDate)}
            </span>
          )}
        </div>
        {(vehicleLabel || bookingLabel) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {[vehicleLabel, bookingLabel].filter(Boolean).join(' · ')}
          </p>
        )}
      </button>

      {!terminal && (
        <div className="flex border-t border-border/50">
          {canStart && onStart && (
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
              className="sq-press flex min-h-[48px] flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-[color:var(--brand-ink)]"
            >
              <Play className="h-4 w-4" />
              Starten
            </button>
          )}
          {canComplete && onComplete && (
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              className="sq-press flex min-h-[48px] flex-1 items-center justify-center gap-1.5 border-l border-border/50 text-xs font-semibold text-[color:var(--status-success)]"
            >
              <CheckCircle2 className="h-4 w-4" />
              Erledigt
            </button>
          )}
          {onComment && (
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onComment();
              }}
              className="sq-press flex min-h-[48px] flex-1 items-center justify-center gap-1.5 border-l border-border/50 text-xs font-semibold text-muted-foreground"
            >
              <MessageSquare className="h-4 w-4" />
              Kommentar
            </button>
          )}
        </div>
      )}
    </OperatorGlassCard>
  );
}
