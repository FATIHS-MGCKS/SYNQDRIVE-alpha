import { useMemo } from 'react';
import { Icon } from '../ui/Icon';
import { SkeletonRows, StatusChip } from '../../../components/patterns';
import {
  laneLabel,
  TIMELINE_LANE_ORDER,
} from './operationsBuilder';
import { OperationEventRow, OperationsEmptyState } from './OperationEventRow';
import {
  DashboardPanelHeader,
  PANEL_BODY_SCROLL_CLASS,
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
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex h-full flex-col items-center">
          <span
            className={[
              'z-10 h-2.5 w-2.5 rounded-full ring-2 ring-card',
              hasCritical ? 'bg-[color:var(--status-critical)]' : 'bg-[color:var(--brand)]',
            ].join(' ')}
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">            {laneLabel(lane, locale)}
          </h3>
          <StatusChip tone={hasCritical ? 'critical' : 'neutral'} className="text-[9px]">
            {items.length}
          </StatusChip>
        </div>
      </div>

      <div className="relative ml-[5px] space-y-2 border-l border-dashed border-border/60 pl-4">
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
      className={panelShellClass('primary', operatorFocusMode ? 'ring-1 ring-border/30' : undefined)}
      aria-label={de ? 'Jetzt & Als Nächstes' : 'Now & Next'}
    >
      <DashboardPanelHeader
        icon={<Icon name="calendar-clock" className="h-4 w-4" />}
        iconToneClass="sq-tone-info"
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
        trailing={
          nowNextTimeline.totalCount > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {criticalCount > 0 && (
                <StatusChip tone="critical" className="text-[10px]">
                  {criticalCount} {de ? 'kritisch' : 'critical'}
                </StatusChip>
              )}
              <StatusChip tone="info">{nowNextTimeline.totalCount}</StatusChip>
            </div>
          ) : undefined
        }
      />
      {todayBookingsError && (
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          {de
            ? 'Buchungsdaten konnten nicht vollständig geladen werden.'
            : 'Booking data could not be loaded completely.'}
        </div>
      )}

      <div className={PANEL_BODY_SCROLL_CLASS}>        {!todayBookingsLoaded ? (
          <SkeletonRows rows={4} />
        ) : nowNextTimeline.totalCount === 0 ? (
          <OperationsEmptyState
            locale={locale}
            variant={emptyVariant}
            stationName={selectedStationName}
          />
        ) : (
          <div className="space-y-5">
            {visibleLanes.map((lane) => (
              <LaneSection key={lane} lane={lane} vm={vm} handlers={handlers} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
