import { ChevronRight, Plus } from 'lucide-react';
import { EmptyState, SkeletonCard, StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { fhsActionLabelDe } from './fleet-health-service-labels';
import { fhs } from './fleet-health-service-shell';
import type { FleetHealthServiceOverviewRow } from './fleet-health-service.view-model';

interface FleetHealthServicePrioritizedListProps {
  rows: FleetHealthServiceOverviewRow[];
  loading?: boolean;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateTask?: (vehicleId: string) => void;
  onReviewVehicle?: (vehicleId: string) => void;
}

export function FleetHealthServicePrioritizedList({
  rows,
  loading,
  onOpenVehicle,
  onOpenTask,
  onCreateTask,
  onReviewVehicle,
}: FleetHealthServicePrioritizedListProps) {
  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title="Keine priorisierten Fälle"
        description="Sobald Handlungsbedarf, offene Aufgaben oder Prüffälle vorliegen, erscheinen sie hier."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const actionLabel = fhsActionLabelDe(row.recommendedAction);
        const handlePrimary = () => {
          if (row.recommendedAction === 'open_task' && row.existingTaskId) {
            onOpenTask?.(row.existingTaskId);
            return;
          }
          if (row.recommendedAction === 'create_task') {
            onCreateTask?.(row.vehicleId);
            return;
          }
          if (row.recommendedAction === 'review_vehicle') {
            onReviewVehicle?.(row.vehicleId);
            return;
          }
          if (row.vehicleId) onOpenVehicle?.(row.vehicleId);
        };

        return (
          <div key={row.id} className={fhs.interactiveRow}>
            <button
              type="button"
              onClick={() => row.vehicleId && onOpenVehicle?.(row.vehicleId)}
              className="min-w-0 flex-1 space-y-1 text-left"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-[13px] font-bold tracking-tight text-foreground">
                  {row.plate}
                </span>
                {row.makeModelYear ? (
                  <span className={cn(fhs.meta, 'truncate')}>{row.makeModelYear}</span>
                ) : null}
                <StatusChip tone={row.statusTone} className="shrink-0 text-[10px]">
                  {row.statusLabel}
                </StatusChip>
              </div>
              <p className={cn(fhs.rowBody, 'line-clamp-2')}>{row.primaryReason}</p>
              <p className={fhs.sourceTag}>Quelle: {row.sourceLabel}</p>
            </button>

            <div className="flex shrink-0 flex-col items-end gap-1 self-center">
              {row.recommendedAction === 'create_task' ? (
                <Button variant="neutral" size="sm" onClick={handlePrimary}>
                  <Plus className="h-3.5 w-3.5" />
                  {actionLabel}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={handlePrimary}>
                  {actionLabel}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
