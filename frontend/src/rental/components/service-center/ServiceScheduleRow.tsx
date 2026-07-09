import { ChevronRight, Clock, User, Wrench } from 'lucide-react';
import { PriorityBadge, StatusChip } from '../../../components/patterns';
import type { ApiTask } from '../../../lib/api';
import {
  mapApiPriority,
  mapApiTaskToDisplayStatus,
  vehicleTaskPriorityLabel,
  vehicleTaskStatusLabel,
  vehicleTaskStatusTone,
} from '../../lib/task-display.utils';
import {
  buildVehicleLabel,
  taskTypeLabel,
} from '../../lib/service-task-semantics';
import { taskTypeIcon } from '../../lib/service-task-icons';
import {
  formatAppointmentLabel,
  formatDueDateLabel,
  taskScheduledAppointment,
} from '../../lib/service-schedule.utils';

function statusTone(tone: ReturnType<typeof vehicleTaskStatusTone>) {
  if (tone === 'critical') return 'critical' as const;
  if (tone === 'warning') return 'warning' as const;
  if (tone === 'success') return 'success' as const;
  if (tone === 'info') return 'info' as const;
  return 'neutral' as const;
}

interface ServiceScheduleRowProps {
  task: ApiTask;
  vehicleLabel: string;
  vendorName?: string | null;
  assigneeName?: string | null;
  onOpen: (taskId: string) => void;
}

export function ServiceScheduleRow({
  task,
  vehicleLabel,
  vendorName,
  assigneeName,
  onOpen,
}: ServiceScheduleRowProps) {
  const Icon = taskTypeIcon(task.type);
  const appointment = taskScheduledAppointment(task);
  const displayStatus = mapApiTaskToDisplayStatus(task.status);

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="w-full text-left rounded-xl border border-border/45 px-3 py-2.5 surface-premium hover:bg-muted/25 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <p className="text-[12px] font-semibold text-foreground truncate">{task.title}</p>
            <PriorityBadge
              priority={mapApiPriority(task.priority)}
              label={vehicleTaskPriorityLabel(mapApiPriority(task.priority))}
            />
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {vehicleLabel} · {taskTypeLabel(task)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {task.dueDate && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Fällig bis {formatDueDateLabel(task.dueDate)}
              </span>
            )}
            {appointment && (
              <span className="inline-flex items-center gap-1 text-[color:var(--brand-ink)]">
                Termin {formatAppointmentLabel(appointment)}
              </span>
            )}
            {vendorName && (
              <span className="inline-flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                {vendorName}
              </span>
            )}
            {assigneeName && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" />
                {assigneeName}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <StatusChip tone={statusTone(vehicleTaskStatusTone(displayStatus, task.isOverdue))}>
              {vehicleTaskStatusLabel(displayStatus, task.isOverdue)}
            </StatusChip>
            {task.isOverdue && <StatusChip tone="critical">Überfällig</StatusChip>}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
      </div>
    </button>
  );
}
