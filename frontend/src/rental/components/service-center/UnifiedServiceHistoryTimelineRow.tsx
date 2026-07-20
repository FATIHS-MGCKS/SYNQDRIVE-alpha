import {
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  FolderKanban,
  Receipt,
  User,
  Wrench,
} from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import { formatTaskDateTime } from '../../lib/task-detail.utils';
import {
  SERVICE_HISTORY_EVENT_KIND_LABEL,
  SERVICE_HISTORY_SOURCE_LABEL,
  type UnifiedServiceHistoryEntry,
} from '../../lib/unified-service-history.utils';

interface UnifiedServiceHistoryTimelineRowProps {
  entry: UnifiedServiceHistoryEntry;
  vehicleLabel: string;
  vendorName?: string | null;
  onOpenTask?: (taskId: string) => void;
  onOpenServiceCase?: (serviceCaseId: string) => void;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenVendor?: (vendorId: string) => void;
}

function entryIcon(entry: UnifiedServiceHistoryEntry) {
  if (entry.kind === 'linked_invoice') return Receipt;
  if (entry.kind === 'linked_document') return FileText;
  if (entry.source === 'service_case') return FolderKanban;
  if (entry.source === 'vehicle_service_event') return Wrench;
  return ClipboardList;
}

function entryTone(entry: UnifiedServiceHistoryEntry) {
  if (entry.kind === 'task_completed' || entry.kind === 'case_completed') return 'success' as const;
  if (entry.kind === 'task_cancelled' || entry.kind === 'case_cancelled') return 'neutral' as const;
  if (entry.kind === 'service_event') return 'info' as const;
  return 'neutral' as const;
}

export function UnifiedServiceHistoryTimelineRow({
  entry,
  vehicleLabel,
  vendorName,
  onOpenTask,
  onOpenServiceCase,
  onOpenVehicle,
  onOpenVendor,
}: UnifiedServiceHistoryTimelineRowProps) {
  const Icon = entryIcon(entry);
  const kindLabel = SERVICE_HISTORY_EVENT_KIND_LABEL[entry.kind];
  const sourceLabel = SERVICE_HISTORY_SOURCE_LABEL[entry.source];

  const handleOpen = () => {
    if (entry.task) onOpenTask?.(entry.task.id);
    else if (entry.serviceCase) onOpenServiceCase?.(entry.serviceCase.id);
  };

  const canOpen = Boolean(entry.task || entry.serviceCase);

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
            {canOpen ? (
              <button type="button" onClick={handleOpen} className="text-left w-full group">
                <p className="text-[12px] font-semibold text-foreground group-hover:text-[color:var(--brand-ink)]">
                  {entry.title}
                </p>
              </button>
            ) : (
              <p className="text-[12px] font-semibold text-foreground">{entry.title}</p>
            )}
            {entry.subtitle ? (
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{entry.subtitle}</p>
            ) : null}
          </div>
          <StatusChip tone={entryTone(entry)}>{kindLabel}</StatusChip>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <StatusChip tone="neutral">{sourceLabel}</StatusChip>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
          {entry.vehicleId && onOpenVehicle ? (
            <button
              type="button"
              onClick={() => onOpenVehicle(entry.vehicleId!)}
              className="inline-flex items-center gap-1 text-[color:var(--brand-ink)] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {vehicleLabel}
            </button>
          ) : (
            <span className="text-muted-foreground">{vehicleLabel}</span>
          )}
          {entry.vendorId && vendorName && onOpenVendor ? (
            <button
              type="button"
              onClick={() => onOpenVendor(entry.vendorId!)}
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
          <span className="text-muted-foreground">{formatTaskDateTime(entry.occurredAt)}</span>
          {entry.actorName ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {entry.actorName}
            </span>
          ) : null}
        </div>

        {canOpen ? (
          <button
            type="button"
            onClick={handleOpen}
            className="text-[10px] font-semibold text-[color:var(--brand-ink)] inline-flex items-center gap-0.5 hover:underline"
          >
            Details
            <ChevronRight className="w-3 h-3" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
