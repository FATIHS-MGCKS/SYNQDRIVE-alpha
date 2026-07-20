import { ChevronRight, ClipboardList, FolderKanban } from 'lucide-react';
import { PriorityBadge, StatusChip } from '../../../components/patterns';
import type { ApiServiceCase, ApiTask } from '../../../lib/api';
import {
  mapApiPriority,
  mapApiTaskToDisplayStatus,
  vehicleTaskPriorityLabel,
  vehicleTaskStatusLabel,
  vehicleTaskStatusTone,
} from '../../lib/task-display.utils';
import { TASK_PRIORITY_LABEL_DE } from '../../lib/service-task-semantics';
import { SERVICE_CASE_STATUS_LABEL_DE } from './fleet-health-service-case-list';
import {
  FLEET_SCHEDULE_DATE_KIND_LABEL,
  formatFleetScheduleDateTime,
  type FleetScheduleItem,
} from './fleet-health-service-schedule.utils';

interface FleetHealthServiceScheduleItemRowProps {
  item: FleetScheduleItem;
  vehicleLabel: string;
  vendorName?: string | null;
  timeZone: string;
  onOpenTask?: (taskId: string) => void;
  onOpenServiceCase?: (serviceCaseId: string) => void;
}

function taskStatusTone(tone: ReturnType<typeof vehicleTaskStatusTone>) {
  if (tone === 'critical') return 'critical' as const;
  if (tone === 'warning') return 'warning' as const;
  if (tone === 'success') return 'success' as const;
  if (tone === 'info') return 'info' as const;
  return 'neutral' as const;
}

export function FleetHealthServiceScheduleItemRow({
  item,
  vehicleLabel,
  vendorName,
  timeZone,
  onOpenTask,
  onOpenServiceCase,
}: FleetHealthServiceScheduleItemRowProps) {
  const isTask = item.entityKind === 'task';
  const task = item.task;
  const serviceCase = item.serviceCase;
  const title = isTask ? task?.title ?? 'Aufgabe' : serviceCase?.title ?? 'Servicefall';
  const dateLabel = formatFleetScheduleDateTime(item.dateIso, timeZone);
  const kindLabel = FLEET_SCHEDULE_DATE_KIND_LABEL[item.dateKind];

  const handleOpen = () => {
    if (isTask && task) onOpenTask?.(task.id);
    else if (serviceCase) onOpenServiceCase?.(serviceCase.id);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="w-full text-left rounded-xl border border-border/45 px-3 py-2.5 surface-premium hover:bg-muted/25 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          {isTask ? <ClipboardList className="w-4 h-4" /> : <FolderKanban className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <p className="text-[12px] font-semibold text-foreground truncate">{title}</p>
            {isTask && task ? (
              <PriorityBadge
                priority={mapApiPriority(task.priority)}
                label={vehicleTaskPriorityLabel(mapApiPriority(task.priority))}
              />
            ) : serviceCase ? (
              <StatusChip tone="neutral">{TASK_PRIORITY_LABEL_DE[serviceCase.priority]}</StatusChip>
            ) : null}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {vehicleLabel}
            {vendorName ? ` · ${vendorName}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusChip tone={item.dateKind === 'task_due' ? 'info' : item.dateKind === 'case_workshop' ? 'warning' : 'neutral'}>
              {kindLabel}
            </StatusChip>
            {item.dateIso ? (
              <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Kein Termin hinterlegt</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {isTask && task ? (
              <StatusChip tone={taskStatusTone(vehicleTaskStatusTone(mapApiTaskToDisplayStatus(task.status), task.isOverdue))}>
                {vehicleTaskStatusLabel(mapApiTaskToDisplayStatus(task.status), task.isOverdue)}
              </StatusChip>
            ) : serviceCase ? (
              <StatusChip tone="neutral">{SERVICE_CASE_STATUS_LABEL_DE[serviceCase.status]}</StatusChip>
            ) : null}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
      </div>
    </button>
  );
}
