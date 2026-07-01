import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { laneLabel, TIMELINE_LANE_ORDER } from './operationsBuilder';
import { OperationEventRow, OperationsEmptyState } from './OperationEventRow';
import { panelShellClass } from './dashboardShell';
import type {
  DashboardViewModel,
  OperationTimelineLane,
  TodayOpsBucket,
} from './dashboardTypes';

interface OperationsSchedulePanelProps {
  vm: DashboardViewModel;
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

interface OperationHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

function OperationsScheduleHeader({
  vm,
  totalCount,
  criticalCount,
}: {
  vm: DashboardViewModel;
  totalCount: number;
  criticalCount: number;
}) {
  const { locale } = vm;
  const de = locale === 'de';

  return (
    <div className="flex flex-col gap-2 border-b border-border/35 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            criticalCount > 0 ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--status-watch)]',
          )}
          aria-hidden
        />
        <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground text-balance">
          {de ? 'Tagesplan' : 'Day plan'}
        </h2>
      </div>

      {totalCount > 0 ? (
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          {criticalCount > 0 ? (
            <span className="text-[11px] font-medium tabular-nums text-[color:var(--status-critical)]">
              {criticalCount} {de ? 'kritisch' : 'critical'}
            </span>
          ) : null}
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {totalCount} {de ? 'Einträge' : 'items'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function TodayBucketSection({
  bucket,
  title,
  items,
  vm,
  handlers,
  defaultOpen,
}: {
  bucket: TodayOpsBucket;
  title: string;
  items: DashboardViewModel['todayOperations']['todo'];
  vm: DashboardViewModel;
  handlers: OperationHandlers;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const isCompleted = bucket === 'completed';

  if (items.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <div className="flex items-center gap-1.5">
          <Icon
            name={isCompleted ? 'check-circle' : bucket === 'in-progress' ? 'activity' : 'list-todo'}
            className={cn(
              'h-3.5 w-3.5',
              bucket === 'in-progress' ? 'text-[color:var(--status-watch)]' : 'text-muted-foreground',
            )}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusChip
            tone={isCompleted ? 'success' : bucket === 'in-progress' ? 'watch' : 'neutral'}
            className="px-1.5 py-0.5 text-[9.5px]"
          >
            {items.length}
          </StatusChip>
          <Icon
            name="chevron-down"
            className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </div>
      </button>

      {open && (
        <div className={cn('space-y-1.5', isCompleted && 'opacity-75')}>
          {items.map((item) => (
            <OperationEventRow
              key={item.id}
              item={item}
              locale={vm.locale}
              vm={vm}
              compact={isCompleted}
              onOpenVehicleById={handlers.onOpenVehicleById}
              onOpenBookingById={handlers.onOpenBookingById}
              onOpenRentalView={handlers.onOpenRentalView}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TimelineLaneSection({
  lane,
  vm,
  handlers,
}: {
  lane: OperationTimelineLane;
  vm: DashboardViewModel;
  handlers: OperationHandlers;
}) {
  const { nowNextTimeline, locale } = vm;
  const items = nowNextTimeline.lanes[lane];
  if (items.length === 0) return null;

  const hasCritical = items.some((item) => item.status === 'overdue' || item.status === 'blocked');

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              hasCritical ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--brand)]',
            )}
            aria-hidden
          />
          <h3 className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {laneLabel(lane, locale)}
          </h3>
        </div>
        <StatusChip tone={hasCritical ? 'critical' : 'neutral'} className="px-1.5 py-0.5 text-[9.5px]">
          {items.length}
        </StatusChip>
      </div>

      <div className="space-y-1.5">
        {items.slice(0, 4).map((item) => (
          <OperationEventRow
            key={item.id}
            item={item}
            locale={locale}
            vm={vm}
            compact
            onOpenVehicleById={handlers.onOpenVehicleById}
            onOpenBookingById={handlers.onOpenBookingById}
            onOpenRentalView={handlers.onOpenRentalView}
          />
        ))}
      </div>
    </section>
  );
}

export function OperationsSchedulePanel({
  vm,
  onOpenVehicleById,
  onOpenBookingById,
  onOpenRentalView,
}: OperationsSchedulePanelProps) {
  const {
    todayOperations,
    nowNextTimeline,
    todayBookingsLoaded,
    todayBookingsError,
    locale,
    selectedStationId,
    selectedStationName,
    pickupItems,
    returnItems,
  } = vm;
  const de = locale === 'de';
  const handlers = { onOpenVehicleById, onOpenBookingById, onOpenRentalView };

  const visibleLanes = useMemo(
    () => TIMELINE_LANE_ORDER.filter((lane) => nowNextTimeline.lanes[lane].length > 0),
    [nowNextTimeline],
  );
  const showTimelineLanes = vm.timeframe === 'next24h' && visibleLanes.length > 0;

  const overdueCount =
    todayOperations.todo.filter((item) => item.status === 'overdue').length +
    todayOperations.inProgress.filter((item) => item.status === 'overdue').length;

  const timelineCriticalCount = useMemo(
    () =>
      TIMELINE_LANE_ORDER.reduce(
        (count, lane) =>
          count +
          nowNextTimeline.lanes[lane].filter(
            (item) => item.status === 'overdue' || item.status === 'blocked',
          ).length,
        0,
      ),
    [nowNextTimeline],
  );

  const totalCount = todayOperations.totalCount + (showTimelineLanes ? nowNextTimeline.totalCount : 0);
  const criticalCount = overdueCount + (showTimelineLanes ? timelineCriticalCount : 0);

  const emptyVariant = (() => {
    if (selectedStationId && totalCount === 0) {
      return 'station' as const;
    }
    if (pickupItems.length === 0 && returnItems.length > 0) return 'pickups' as const;
    if (returnItems.length === 0 && pickupItems.length > 0) return 'returns' as const;
    return 'today' as const;
  })();

  return (
    <section
      className={panelShellClass('tertiary', 'h-full border-solid border-border/55 bg-card/55 shadow-none')}
      aria-label={de ? 'Tagesplan' : 'Day plan'}
    >
      <OperationsScheduleHeader vm={vm} totalCount={totalCount} criticalCount={criticalCount} />

      {todayBookingsError && (
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2.5 text-[12px] text-muted-foreground">
          {de
            ? 'Operationsdaten konnten nicht vollständig geladen werden.'
            : 'Operations data could not be loaded completely.'}
        </div>
      )}

      <div className="max-h-[min(640px,76vh)] flex-1 overflow-y-auto px-3 py-2.5">
        {!todayBookingsLoaded ? (
          <SkeletonRows rows={5} />
        ) : totalCount === 0 ? (
          <OperationsEmptyState
            locale={locale}
            variant={emptyVariant}
            stationName={selectedStationName}
          />
        ) : (
          <div className="space-y-3">
            {todayOperations.totalCount > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {de ? 'Heute' : 'Today'}
                  </h3>
                  <span className="text-[10.5px] font-medium tabular-nums text-muted-foreground">
                    {todayOperations.totalCount}
                  </span>
                </div>
                <div className="space-y-2">
                  <TodayBucketSection
                    bucket="todo"
                    title={de ? 'To Do' : 'To do'}
                    items={todayOperations.todo}
                    vm={vm}
                    handlers={handlers}
                    defaultOpen
                  />
                  <TodayBucketSection
                    bucket="in-progress"
                    title={de ? 'In Bearbeitung' : 'In progress'}
                    items={todayOperations.inProgress}
                    vm={vm}
                    handlers={handlers}
                    defaultOpen
                  />
                  <TodayBucketSection
                    bucket="completed"
                    title={de ? 'Erledigt' : 'Completed'}
                    items={todayOperations.completed}
                    vm={vm}
                    handlers={handlers}
                    defaultOpen={todayOperations.completed.length <= 3}
                  />
                </div>
              </section>
            ) : null}

            {showTimelineLanes ? (
              <section className="space-y-2 border-t border-border/35 pt-2.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {de ? 'Nächste Schritte' : 'Next steps'}
                  </h3>
                  <span className="text-[10.5px] font-medium tabular-nums text-muted-foreground">
                    {nowNextTimeline.totalCount}
                  </span>
                </div>
                <div className="space-y-3">
                  {visibleLanes.map((lane) => (
                    <TimelineLaneSection key={lane} lane={lane} vm={vm} handlers={handlers} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
