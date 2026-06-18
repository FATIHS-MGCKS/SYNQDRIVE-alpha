import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { OperationEventRow, OperationsEmptyState } from './OperationEventRow';
import {
  DashboardPanelHeader,
  PANEL_BODY_SCROLL_CLASS,
  panelShellClass,
} from './dashboardShell';
import type { DashboardViewModel, TodayOpsBucket } from './dashboardTypes';

interface TodayOperationsProps {
  vm: DashboardViewModel;
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

interface TodayOpsHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

function BucketSection({
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
  handlers: TodayOpsHandlers;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const isCompleted = bucket === 'completed';

  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Icon
            name={isCompleted ? 'check-circle' : bucket === 'in-progress' ? 'activity' : 'list-todo'}
            className={[
              'h-4 w-4',
              bucket === 'in-progress' ? 'text-[color:var(--status-watch)]' : 'text-muted-foreground',
            ].join(' ')}
          />
          <span
            className={[
              'font-semibold uppercase tracking-widest text-muted-foreground',
              isCompleted ? 'text-[9px]' : 'text-[10px]',
            ].join(' ')}
          >
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusChip tone={isCompleted ? 'success' : bucket === 'in-progress' ? 'watch' : 'neutral'} className="text-[9px]">
            {items.length}
          </StatusChip>
          <Icon
            name="chevron-down"
            className={['h-4 w-4 text-muted-foreground transition-transform', open ? 'rotate-180' : ''].join(' ')}
          />
        </div>
      </button>

      {open && (
        <div className={['space-y-2', isCompleted ? 'opacity-75' : ''].join(' ')}>
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

export function TodayOperations({
  vm,
  onOpenVehicleById,
  onOpenBookingById,
  onOpenRentalView,
}: TodayOperationsProps) {
  const {
    todayOperations,
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

  const overdueCount =
    todayOperations.todo.filter((i) => i.status === 'overdue').length +
    todayOperations.inProgress.filter((i) => i.status === 'overdue').length;

  const emptyVariant = (() => {
    if (selectedStationId && todayOperations.totalCount === 0) return 'station' as const;
    if (pickupItems.length === 0 && returnItems.length > 0) return 'pickups' as const;
    if (returnItems.length === 0 && pickupItems.length > 0) return 'returns' as const;
    return 'today' as const;
  })();

  return (
    <section
      className={panelShellClass('primary')}
      aria-label={de ? 'Heutige Operationen' : 'Today Operations'}
    >
      <DashboardPanelHeader
        icon={<Icon name="clock" className="h-4 w-4" />}
        iconToneClass="sq-tone-watch"
        title={de ? 'Heutige Operationen' : 'Today Operations'}
        subtitle={
          (de ? 'To Do · In Bearbeitung · Erledigt' : 'To do · In progress · Completed') +
          (selectedStationName ? ` · ${selectedStationName}` : '')
        }
        trailing={
          todayOperations.totalCount > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {overdueCount > 0 && (
                <StatusChip tone="critical" className="text-[10px]">
                  {overdueCount} {de ? 'überfällig' : 'overdue'}
                </StatusChip>
              )}
              <StatusChip tone="watch">{todayOperations.totalCount}</StatusChip>
            </div>
          ) : undefined
        }
      />
      {todayBookingsError && (
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          {de
            ? 'Operationsdaten teilweise nicht verfügbar.'
            : 'Operations data partially unavailable.'}
        </div>
      )}

      <div className={PANEL_BODY_SCROLL_CLASS}>        {!todayBookingsLoaded ? (
          <SkeletonRows rows={5} />
        ) : todayOperations.totalCount === 0 ? (
          <OperationsEmptyState
            locale={locale}
            variant={emptyVariant}
            stationName={selectedStationName}
          />
        ) : (
          <div className="space-y-4">
            <BucketSection
              bucket="todo"
              title={de ? 'To Do' : 'To do'}
              items={todayOperations.todo}
              vm={vm}
              handlers={handlers}
              defaultOpen
            />
            <BucketSection
              bucket="in-progress"
              title={de ? 'In Bearbeitung' : 'In progress'}
              items={todayOperations.inProgress}
              vm={vm}
              handlers={handlers}
              defaultOpen
            />
            <BucketSection
              bucket="completed"
              title={de ? 'Erledigt' : 'Completed'}
              items={todayOperations.completed}
              vm={vm}
              handlers={handlers}
              defaultOpen={todayOperations.completed.length <= 3}
            />
          </div>
        )}
      </div>
    </section>
  );
}
