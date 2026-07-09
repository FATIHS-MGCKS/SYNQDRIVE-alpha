import { ChevronRight, ExternalLink, Paperclip, User, Wrench } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import type { ApiTask } from '../../../lib/api';
import { formatTaskDateTime } from '../../lib/task-detail.utils';
import {
  attachmentCount,
  taskCompletedTimestamp,
} from '../../lib/service-history.utils';
import { formatCostCents, taskTypeLabel } from '../../lib/service-task-semantics';
import { taskTypeIcon } from '../../lib/service-task-icons';

interface ServiceHistoryTimelineRowProps {
  task: ApiTask;
  vehicleLabel: string;
  vendorName?: string | null;
  assigneeName?: string | null;
  onOpenTask: (taskId: string) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenVendor?: (vendorId: string) => void;
}

export function ServiceHistoryTimelineRow({
  task,
  vehicleLabel,
  vendorName,
  assigneeName,
  onOpenTask,
  onOpenVehicle,
  onOpenVendor,
}: ServiceHistoryTimelineRowProps) {
  const Icon = taskTypeIcon(task.type);
  const actual = formatCostCents(task.actualCostCents);
  const completedAt = task.completedAt ?? (taskCompletedTimestamp(task) ? new Date(taskCompletedTimestamp(task)).toISOString() : null);
  const attachments = attachmentCount(task);

  return (
    <article className="relative pl-6 pb-4 last:pb-0">
      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-[color:var(--brand)] bg-popover" />
      <span className="absolute left-[5px] top-4 bottom-0 w-px bg-border/60 last:hidden" aria-hidden />

      <div className="rounded-xl border border-border/40 surface-premium p-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/50">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpenTask(task.id)}
              className="text-left w-full group"
            >
              <p className="text-[12px] font-semibold text-foreground group-hover:text-[color:var(--brand-ink)]">
                {task.title}
              </p>
            </button>
            <p className="text-[10px] text-muted-foreground mt-0.5">{taskTypeLabel(task)}</p>
          </div>
          <StatusChip tone={task.status === 'DONE' ? 'success' : 'neutral'}>
            {task.status === 'DONE' ? 'Erledigt' : 'Storniert'}
          </StatusChip>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
          {task.vehicleId && onOpenVehicle ? (
            <button
              type="button"
              onClick={() => onOpenVehicle(task.vehicleId!)}
              className="inline-flex items-center gap-1 text-[color:var(--brand-ink)] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {vehicleLabel}
            </button>
          ) : (
            <span className="text-muted-foreground">{vehicleLabel}</span>
          )}
          {task.vendorId && vendorName && onOpenVendor ? (
            <button
              type="button"
              onClick={() => onOpenVendor(task.vendorId!)}
              className="inline-flex items-center gap-1 text-[color:var(--brand-ink)] hover:underline"
            >
              <Wrench className="w-3 h-3" />
              {vendorName}
            </button>
          ) : vendorName ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              {vendorName}
            </span>
          ) : null}
          {actual && <span className="text-foreground font-medium">{actual}</span>}
          {completedAt && (
            <span className="text-muted-foreground">
              {formatTaskDateTime(completedAt)}
            </span>
          )}
          {assigneeName && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {assigneeName}
            </span>
          )}
          {attachments > 0 && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Paperclip className="w-3 h-3" />
              {attachments} Anhang{attachments === 1 ? '' : 'e'}
            </span>
          )}
        </div>

        {task.resolutionNote && (
          <p className="text-[10px] text-muted-foreground border-l-2 border-border/60 pl-2">
            {task.resolutionNote}
          </p>
        )}

        <button
          type="button"
          onClick={() => onOpenTask(task.id)}
          className="text-[10px] font-semibold text-[color:var(--brand-ink)] inline-flex items-center gap-0.5 hover:underline"
        >
          Details
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </article>
  );
}
