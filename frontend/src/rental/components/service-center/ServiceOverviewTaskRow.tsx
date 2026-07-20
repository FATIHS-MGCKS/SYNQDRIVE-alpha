import { Calendar, Check, Clock, ExternalLink, User } from 'lucide-react';
import { PriorityBadge, StatusChip } from '../../../components/patterns';
import type { ApiTask } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import {
  deriveTaskIsOverdue,
  formatTaskDueDate,
  mapApiPriority,
  mapApiTaskToDisplayStatus,
  vehicleTaskPriorityLabel,
  vehicleTaskStatusLabel,
  vehicleTaskStatusTone,
} from '../../lib/task-display.utils';
import { isDueSoonTask } from './service-center.utils';
import { isTerminalTaskStatus, taskRequiresResolutionNote } from '../../lib/task-detail.utils';
import { Icon } from '../ui/Icon';

function buildMmy(vehicle: VehicleData | null | undefined): string {
  if (!vehicle) return '—';
  const parts = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
  const year = vehicle.year ? String(vehicle.year) : '';
  return [parts || vehicle.model, year].filter(Boolean).join(' ') || '—';
}

function dueTone(task: ApiTask): 'critical' | 'watch' | 'neutral' {
  if (deriveTaskIsOverdue(task)) return 'critical';
  if (isDueSoonTask(task)) return 'watch';
  return 'neutral';
}

function statusChipTone(tone: ReturnType<typeof vehicleTaskStatusTone>) {
  if (tone === 'critical') return 'critical' as const;
  if (tone === 'warning') return 'warning' as const;
  if (tone === 'success') return 'success' as const;
  if (tone === 'info') return 'info' as const;
  return 'neutral' as const;
}

export interface ServiceOverviewTaskRowProps {
  task: ApiTask;
  vehicle?: VehicleData | null;
  vendorName?: string | null;
  assigneeName?: string | null;
  compact?: boolean;
  mutating?: boolean;
  onOpen: (taskId: string) => void;
  onWaiting?: (task: ApiTask) => void;
  onComplete?: (task: ApiTask) => void;
  onSchedule?: (task: ApiTask) => void;
}

export function ServiceOverviewTaskRow({
  task,
  vehicle,
  vendorName,
  assigneeName,
  compact = false,
  mutating,
  onOpen,
  onWaiting,
  onComplete,
  onSchedule,
}: ServiceOverviewTaskRowProps) {
  const overdue = deriveTaskIsOverdue(task);
  const displayStatus = mapApiTaskToDisplayStatus(task.status);
  const due = dueTone(task);
  const terminal = isTerminalTaskStatus(task.status);
  const canWait = !terminal && (task.status === 'OPEN' || task.status === 'IN_PROGRESS');
  const canComplete = !terminal;

  const dueClass =
    due === 'critical'
      ? 'text-red-600 dark:text-red-400 font-semibold'
      : due === 'watch'
        ? 'text-amber-600 dark:text-amber-400 font-medium'
        : 'text-muted-foreground';

  const rowAccent =
    task.blocksVehicleAvailability || task.priority === 'CRITICAL'
      ? 'border-red-500/25 bg-red-500/[0.03]'
      : overdue
        ? 'border-amber-500/25 bg-amber-500/[0.03]'
        : 'border-border/45 surface-premium';

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 transition-colors ${rowAccent} ${
        compact ? '' : 'sm:px-3.5 sm:py-3'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className="min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-muted/25 transition-colors"
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <StatusChip tone={statusChipTone(vehicleTaskStatusTone(displayStatus, overdue))}>
              {vehicleTaskStatusLabel(displayStatus, overdue)}
            </StatusChip>
            <PriorityBadge
              priority={mapApiPriority(task.priority)}
              label={vehicleTaskPriorityLabel(mapApiPriority(task.priority))}
            />
            {task.blocksVehicleAvailability && (
              <StatusChip tone="critical">Blockiert Miete</StatusChip>
            )}
          </div>
          <p className="text-[12px] font-semibold text-foreground leading-snug">{task.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {task.category || task.type}
          </p>

          {!compact && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 min-w-0">
                <Icon name="car" className="w-3 h-3 shrink-0 opacity-70" />
                <span className="truncate">
                  {vehicle ? (
                    <>
                      <span className="font-medium text-foreground">{vehicle.license}</span>
                      <span className="mx-1">·</span>
                      {buildMmy(vehicle)}
                    </>
                  ) : task.vehicleId ? (
                    'Fahrzeug verknüpft'
                  ) : (
                    'Ohne Fahrzeug'
                  )}
                </span>
              </span>
              {vendorName && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Icon name="briefcase" className="w-3 h-3 shrink-0 opacity-70" />
                  {vendorName}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 ${dueClass}`}>
                <Calendar className="w-3 h-3 shrink-0" />
                {task.dueDate ? formatTaskDueDate(task.dueDate) : 'Keine Fälligkeit'}
              </span>
              <span className="inline-flex items-center gap-1 truncate">
                <User className="w-3 h-3 shrink-0 opacity-70" />
                {assigneeName ?? 'Nicht zugewiesen'}
              </span>
            </div>
          )}
        </button>

        <div className="flex flex-wrap items-center gap-1 shrink-0 sm:justify-end">
          <button
            type="button"
            disabled={mutating}
            onClick={() => onOpen(task.id)}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-border/60 hover:bg-muted/40 disabled:opacity-50"
            title="Details öffnen"
          >
            <ExternalLink className="w-3 h-3" />
            Öffnen
          </button>
          {onSchedule && !terminal && (
            <button
              type="button"
              disabled={mutating}
              onClick={() => onSchedule(task)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-border/60 hover:bg-muted/40 disabled:opacity-50"
            >
              <Calendar className="w-3 h-3" />
              Termin
            </button>
          )}
          {onWaiting && canWait && (
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
          {onComplete && canComplete && !taskRequiresResolutionNote(task.type) && (
            <button
              type="button"
              disabled={mutating}
              onClick={() => onComplete(task)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              Erledigt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
