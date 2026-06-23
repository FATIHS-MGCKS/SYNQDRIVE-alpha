import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import { OperationEventRow, OperationsEmptyState } from './OperationEventRow';
import {
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

function MinimalTodayHeader({
  title,
  subtitle,
  totalCount,
  overdueCount,
  de,
}: {
  title: string;
  subtitle: string;
  totalCount: number;
  overdueCount: number;
  de: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/35 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={[
            'h-2 w-2 shrink-0 rounded-full',
            overdueCount > 0 ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--status-watch)]',
          ].join(' ')}
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground text-balance">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {totalCount > 0 ? (
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          {overdueCount > 0 ? (
            <span className="text-[11px] font-medium tabular-nums text-[color:var(--status-critical)]">
              {overdueCount} {de ? 'überfällig' : 'overdue'}
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
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <div className="flex items-center gap-1.5">
          <Icon
            name={isCompleted ? 'check-circle' : bucket === 'in-progress' ? 'activity' : 'list-todo'}
            className={[
              'h-3.5 w-3.5',
              bucket === 'in-progress' ? 'text-[color:var(--status-watch)]' : 'text-muted-foreground',
            ].join(' ')}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusChip tone={isCompleted ? 'success' : bucket === 'in-progress' ? 'watch' : 'neutral'} className="px-1.5 py-0.5 text-[9.5px]">
            {items.length}
          </StatusChip>
          <Icon
            name="chevron-down"
            className={['h-3.5 w-3.5 text-muted-foreground transition-transform', open ? 'rotate-180' : ''].join(' ')}
          />
        </div>
      </button>

      {open && (
        <div className={['space-y-1.5', isCompleted ? 'opacity-75' : ''].join(' ')}>
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
      className={panelShellClass('tertiary', 'h-full border-solid border-border/55 bg-card/55 shadow-none')}
      aria-label={de ? 'Heutige Operationen' : 'Today Operations'}
    >
      <MinimalTodayHeader
        title={de ? 'Heutige Operationen' : 'Today Operations'}
        subtitle={
          (de ? 'To Do · In Bearbeitung · Erledigt' : 'To do · In progress · Completed') +
          (selectedStationName ? ` · ${selectedStationName}` : '')
        }
        totalCount={todayOperations.totalCount}
        overdueCount={overdueCount}
        de={de}
      />
      {todayBookingsError && (
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2.5 text-[12px] text-muted-foreground">
          {de
            ? 'Operationsdaten teilweise nicht verfügbar.'
            : 'Operations data partially unavailable.'}
        </div>
      )}

      <div className="max-h-[min(560px,72vh)] flex-1 overflow-y-auto px-3 py-2.5">
        {!todayBookingsLoaded ? (
          <SkeletonRows rows={5} />
        ) : todayOperations.totalCount === 0 ? (
          <OperationsEmptyState
            locale={locale}
            variant={emptyVariant}
            stationName={selectedStationName}
          />
        ) : (
          <div className="space-y-3">
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
