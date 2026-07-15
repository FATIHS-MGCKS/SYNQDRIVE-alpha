import { useCallback, type ReactNode } from 'react';
import { ErrorState, SkeletonRows } from '../../components/patterns';
import type { ApiTask } from '../../lib/api';
import { OperatorTodaySection } from '../components/OperatorTodaySection';
import type { OperatorTodayFeedBucket, OperatorTodayBucketSlice } from '../hooks/operatorTodayFeed.utils';
import type { OperatorTodayTaskEntry } from '../tasks/operatorTodayTasks';
import { OperatorTaskCardConnected } from '../tasks/OperatorTaskCardConnected';
import type { FleetVehicleLookup } from '../tasks/operatorTaskDisplay.utils';
import {
  getOperatorTodayBucketSections,
  type OperatorTodayBucketSectionMeta,
} from '../views/operatorTodayView.utils';

export interface OperatorTodayTaskFeedProps {
  buckets: Record<string, OperatorTodayBucketSlice | undefined>;
  canViewUnassigned: boolean;
  vehicleById: Map<string, FleetVehicleLookup>;
  plannedOpen: boolean;
  onPlannedOpenChange: (open: boolean) => void;
  onOpenTask: (task: ApiTask, options?: { focusComment?: boolean }) => void;
  onTaskChanged?: () => void | Promise<void>;
  onReload: () => void;
  sectionExtras?: Partial<Record<OperatorTodayFeedBucket, ReactNode>>;
  renderEntry?: (entry: OperatorTodayTaskEntry) => ReactNode;
}

export function OperatorTodayTaskFeed({
  buckets,
  canViewUnassigned,
  vehicleById,
  plannedOpen,
  onPlannedOpenChange,
  onOpenTask,
  onTaskChanged,
  onReload,
  sectionExtras,
  renderEntry,
}: OperatorTodayTaskFeedProps) {
  const defaultRenderEntry = useCallback(
    (entry: OperatorTodayTaskEntry) => (
      <OperatorTaskCardConnected
        key={entry.task.id}
        task={entry.task}
        vehicleById={vehicleById}
        onOpenTask={onOpenTask}
        onTaskChanged={onTaskChanged}
      />
    ),
    [onOpenTask, onTaskChanged, vehicleById],
  );

  const renderTaskEntry = renderEntry ?? defaultRenderEntry;

  const renderBucket = (meta: OperatorTodayBucketSectionMeta) => {
    const slice = buckets[meta.bucket];
    if (!slice) return null;

    const extras = sectionExtras?.[meta.bucket];
    const hasExtras = Boolean(extras);
    const collapsedPlanned = meta.bucket === 'PLANNED' && meta.collapsible && !plannedOpen;
    const isEmpty = !slice.loading && !slice.error && slice.entries.length === 0 && !hasExtras;
    const showEntries = (!collapsedPlanned && !isEmpty) || (hasExtras && !collapsedPlanned);

    return (
      <OperatorTodaySection
        key={meta.bucket}
        title={meta.title}
        subtitle={meta.subtitle}
        count={slice.count}
        variant={meta.variant}
        collapsible={meta.collapsible}
        defaultCollapsed={meta.defaultCollapsed}
        open={meta.bucket === 'PLANNED' ? plannedOpen : undefined}
        onOpenChange={meta.bucket === 'PLANNED' ? onPlannedOpenChange : undefined}
        hideWhenEmpty={meta.hideWhenEmpty && !hasExtras}
        isEmpty={isEmpty}
        loading={slice.loading}
        error={
          slice.error ? (
            <ErrorState
              compact
              title={`${meta.title} nicht verfügbar`}
              error={slice.error}
              retryLabel="Erneut laden"
              onRetry={onReload}
            />
          ) : undefined
        }
      >
        {slice.loading && <SkeletonRows rows={meta.bucket === 'PLANNED' ? 1 : 2} />}
        {showEntries && (
          <div className="space-y-2">
            {extras}
            {slice.entries.map((entry: OperatorTodayTaskEntry) => renderTaskEntry(entry))}
          </div>
        )}
      </OperatorTodaySection>
    );
  };

  return (
    <div className="space-y-5">
      {getOperatorTodayBucketSections(canViewUnassigned).map((meta) => renderBucket(meta))}
    </div>
  );
}
