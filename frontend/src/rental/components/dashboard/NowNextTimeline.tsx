import { useMemo } from 'react';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import {
  laneLabel,
  TIMELINE_LANE_ORDER,
} from './operationsBuilder';
import { OperationEventRow, OperationsEmptyState } from './OperationEventRow';
import {
  panelShellClass,
} from './dashboardShell';
import type { DashboardViewModel, OperationTimelineLane } from './dashboardTypes';

interface NowNextTimelineProps {
  vm: DashboardViewModel;
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

interface LaneHandlers {
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
}

function MinimalTimelineHeader({
  title,
  subtitle,
  totalCount,
  criticalCount,
  de,
}: {
  title: string;
  subtitle: string;
  totalCount: number;
  criticalCount: number;
  de: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/35 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={[
            'h-2 w-2 shrink-0 rounded-full',
            criticalCount > 0 ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--brand)]',
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

function LaneSection({
  lane,
  vm,
  handlers,
}: {
  lane: OperationTimelineLane;
  vm: DashboardViewModel;
  handlers: LaneHandlers;
}) {
  const { nowNextTimeline, locale } = vm;
  const items = nowNextTimeline.lanes[lane];
  if (items.length === 0) return null;

  const hasCritical = items.some((i) => i.status === 'overdue' || i.status === 'blocked');

  return (
    <section className="relative">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="relative flex h-full flex-col items-center">
          <span
            className={[
              'z-10 h-2 w-2 rounded-full ring-2 ring-card',
              hasCritical ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--brand)]',
            ].join(' ')}
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {laneLabel(lane, locale)}
          </h3>
          <StatusChip tone={hasCritical ? 'critical' : 'neutral'} className="px-1.5 py-0.5 text-[9.5px]">
            {items.length}
          </StatusChip>
        </div>
      </div>

      <div className="relative ml-[4px] space-y-1.5 border-l border-dashed border-border/55 pl-3">
        {items.map((item) => (
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

export function NowNextTimeline({
  vm,
  onOpenVehicleById,
  onOpenBookingById,
  onOpenRentalView,
}: NowNextTimelineProps) {
  const {
    nowNextTimeline,
    todayBookingsLoaded,
    todayBookingsError,
    locale,
    selectedStationId,
    selectedStationName,
    timeframe,
    operatorFocusMode,
  } = vm;
  const de = locale === 'de';
  const handlers = { onOpenVehicleById, onOpenBookingById, onOpenRentalView };

  const visibleLanes = useMemo(
    () => TIMELINE_LANE_ORDER.filter((lane) => nowNextTimeline.lanes[lane].length > 0),
    [nowNextTimeline],
  );

  const criticalCount = useMemo(
    () =>
      TIMELINE_LANE_ORDER.reduce(
        (acc, lane) =>
          acc +
          nowNextTimeline.lanes[lane].filter(
            (i) => i.status === 'overdue' || i.status === 'blocked',
          ).length,
        0,
      ),
    [nowNextTimeline],
  );

  const emptyVariant =
    selectedStationId && nowNextTimeline.totalCount === 0 ? 'station' : 'timeline';

  return (
    <section
      className={panelShellClass(
        operatorFocusMode ? 'secondary' : 'tertiary',
        operatorFocusMode
          ? 'h-full shadow-none ring-1 ring-border/30'
          : 'h-full border-solid border-border/55 bg-card/55 shadow-none',
      )}
      aria-label={de ? 'Jetzt & Als Nächstes' : 'Now & Next'}
    >
      <MinimalTimelineHeader
        title={de ? 'Jetzt & Als Nächstes' : 'Now & Next'}
        subtitle={
          operatorFocusMode
            ? de
              ? 'Nächste operative Schritte'
              : 'Next operational steps'
            : (timeframe === 'next24h'
                ? de
                  ? 'Operativer Horizont: nächste 24 Stunden'
                  : 'Operational horizon: next 24 hours'
                : de
                  ? 'Heutiger Betriebsablauf'
                  : 'Today’s operational flow') +
              (selectedStationName ? ` · ${selectedStationName}` : '')
        }
        totalCount={nowNextTimeline.totalCount}
        criticalCount={criticalCount}
        de={de}
      />
      {todayBookingsError && (
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2.5 text-[12px] text-muted-foreground">
          {de
            ? 'Buchungsdaten konnten nicht vollständig geladen werden.'
            : 'Booking data could not be loaded completely.'}
        </div>
      )}

      <div className="max-h-[min(560px,72vh)] flex-1 overflow-y-auto px-3 py-2.5">
        {!todayBookingsLoaded ? (
          <SkeletonRows rows={4} />
        ) : nowNextTimeline.totalCount === 0 ? (
          <OperationsEmptyState
            locale={locale}
            variant={emptyVariant}
            stationName={selectedStationName}
          />
        ) : (
          <div className="space-y-3">
            {visibleLanes.map((lane) => (
              <LaneSection key={lane} lane={lane} vm={vm} handlers={handlers} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
