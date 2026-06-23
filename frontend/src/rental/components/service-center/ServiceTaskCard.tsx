import { Calendar, Check, Clock, Play, User } from 'lucide-react';
import { PriorityBadge, StatusChip } from '../../../components/patterns';
import type { ApiTask } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { isTerminalTaskStatus, taskRequiresResolutionNote } from '../../lib/task-detail.utils';
import {
  deriveTaskIsOverdue,
  formatTaskDueDate,
  mapApiPriority,
  mapApiTaskToDisplayStatus,
  vehicleTaskPriorityLabel,
  vehicleTaskStatusLabel,
  vehicleTaskStatusTone,
} from '../../lib/task-display.utils';
import {
  buildVehicleLabel,
  checklistProgress,
  formatCostCents,
  taskSourceLabel,
  taskTypeLabel,
  TASK_PRIORITY_LABEL_DE,
} from '../../lib/service-task-semantics';
import { TaskSourceBadgePill } from '../tasks/VehicleTaskActionCenter';

function statusTone(tone: ReturnType<typeof vehicleTaskStatusTone>) {
  if (tone === 'critical') return 'critical' as const;
  if (tone === 'warning') return 'warning' as const;
  if (tone === 'success') return 'success' as const;
  if (tone === 'info') return 'info' as const;
  return 'neutral' as const;
}

export interface ServiceTaskCardProps {
  task: ApiTask;
  vehicle?: VehicleData | null;
  vendorName?: string | null;
  assigneeName?: string | null;
  compact?: boolean;
  mutating?: boolean;
  onOpen: (taskId: string) => void;
  onStart?: (task: ApiTask) => void;
  onWaiting?: (task: ApiTask) => void;
  onComplete?: (task: ApiTask) => void;
}

export function ServiceTaskCard({
  task,
  vehicle,
  vendorName,
  assigneeName,
  compact = false,
  mutating,
  onOpen,
  onStart,
  onWaiting,
  onComplete,
}: ServiceTaskCardProps) {
  const overdue = deriveTaskIsOverdue(task);
  const displayStatus = mapApiTaskToDisplayStatus(task.status);
  const terminal = isTerminalTaskStatus(task.status);
  const progress = checklistProgress(task);
  const est = formatCostCents(task.estimatedCostCents);
  const actual = formatCostCents(task.actualCostCents);

  const rowAccent =
    task.blocksVehicleAvailability || task.priority === 'CRITICAL'
      ? 'border-red-500/25 bg-red-500/[0.03]'
      : overdue
        ? 'border-amber-500/25 bg-amber-500/[0.03]'
        : 'border-border/45 bg-card/60';

  const dueClass = overdue
    ? 'text-red-600 dark:text-red-400 font-semibold'
    : task.dueDate
      ? 'text-foreground'
      : 'text-muted-foreground';

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${rowAccent} ${compact ? '' : 'sm:py-3'}`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className="min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-muted/25 transition-colors"
        >
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <StatusChip tone={statusTone(vehicleTaskStatusTone(displayStatus, overdue))}>
              {vehicleTaskStatusLabel(displayStatus, overdue)}
            </StatusChip>
            <PriorityBadge
              priority={mapApiPriority(task.priority)}
              label={vehicleTaskPriorityLabel(mapApiPriority(task.priority))}
            />
            <span className="text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted/40">
              {taskTypeLabel(task)}
            </span>
            <TaskSourceBadgePill label={taskSourceLabel(task)} />
            {task.blocksVehicleAvailability && (
              <StatusChip tone="critical">Blockiert Miete</StatusChip>
            )}
          </div>

          <p className="text-[12px] font-semibold text-foreground leading-snug">{task.title}</p>

          {!compact && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1 text-[10px]">
              <span className="text-muted-foreground">
                Fahrzeug:{' '}
                <span className="text-foreground font-medium">{buildVehicleLabel(vehicle)}</span>
              </span>
              <span className="text-muted-foreground">
                Partner:{' '}
                <span className="text-foreground">{vendorName ?? '—'}</span>
              </span>
              <span className={`inline-flex items-center gap-1 ${dueClass}`}>
                <Calendar className="w-3 h-3 shrink-0" />
                {task.dueDate ? formatTaskDueDate(task.dueDate) : 'Kein Termin'}
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <User className="w-3 h-3" />
                {assigneeName ?? 'Nicht zugewiesen'}
              </span>
              {(est || actual) && (
                <span className="text-muted-foreground">
                  Kosten:{' '}
                  <span className="text-foreground tabular-nums">
                    {est ? `gesch. ${est}` : ''}
                    {est && actual ? ' · ' : ''}
                    {actual ? `ist ${actual}` : ''}
                  </span>
                </span>
              )}
              {progress && (
                <span className="text-muted-foreground">
                  Checkliste:{' '}
                  <span className="text-foreground font-medium tabular-nums">
                    {progress.done}/{progress.total}
                  </span>
                </span>
              )}
            </div>
          )}
        </button>

        {!terminal && (
          <div className="flex flex-wrap gap-1 shrink-0">
            {onStart && task.status === 'OPEN' && (
              <button
                type="button"
                disabled={mutating}
                onClick={() => onStart(task)}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-border/60 hover:bg-muted/40 disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                Start
              </button>
            )}
            {onWaiting && (task.status === 'OPEN' || task.status === 'IN_PROGRESS') && (
              <button
                type="button"
                disabled={mutating}
                onClick={() => onWaiting(task)}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-border/60 hover:bg-muted/40 disabled:opacity-50"
              >
                <Clock className="w-3 h-3" />
                Wartend
              </button>
            )}
            {onComplete && !taskRequiresResolutionNote(task.type) && (
              <button
                type="button"
                disabled={mutating}
                onClick={() => onComplete(task)}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                Erledigt
              </button>
            )}
          </div>
        )}
      </div>
      {compact && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {buildVehicleLabel(vehicle)} · {TASK_PRIORITY_LABEL_DE[task.priority]}
        </p>
      )}
    </div>
  );
}
