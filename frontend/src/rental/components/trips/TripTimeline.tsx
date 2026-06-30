import { Icon } from '../ui/Icon';
import type { TripBehaviorEvent, TripEnrichment } from './timeline.types';
import type { TripTimelineItem, TripTimelineTrip } from './timeline.types';
import { TripTimelineCard } from './TripTimelineCard';
import { TripTimelineEmptyState, type TripTimelineEmptyVariant } from './TripTimelineEmptyState';
import { TripTimelineExpanded } from './TripTimelineExpanded';
import { TripTimelineSkeleton } from './TripTimelineSkeleton';
import { TripTimelineEnergyCard } from './trip-timeline-shared';
import { TIMELINE_COPY, TRIPS_COPY, tv } from './trips-view-ui';
import { deriveOperationalChips, formatTripDistance, formatTripDuration, groupTimelineByDate } from './timeline.utils';
import type { EnergyEvent } from '../../../lib/api';
import type { TimelineLoadSource } from './hooks/useVehicleTrips';

export interface TripTimelineProps {
  isDarkMode: boolean;
  vehicleId?: string;
  selectedDate?: string;
  trips: TripTimelineTrip[];
  energyEvents: EnergyEvent[];
  timelineItems: TripTimelineItem[];
  timelineSource?: TimelineLoadSource;
  energyEventsWarning?: string | null;
  loading: boolean;
  loadError: string | null;
  syncing: boolean;
  selectedTripId: string | null;
  routePointsCount: number;
  routeLoading: boolean;
  routeError: string | null;
  enrichments: Record<string, TripEnrichment>;
  enrichingId: string | null;
  behaviorEvents: Record<string, TripBehaviorEvent[]>;
  behaviorLoadingId: string | null;
  selectedBehaviorEventId: string | null;
  detailLoadingId?: string | null;
  detailErrorId?: string | null;
  resolveTrip?: (trip: TripTimelineTrip) => TripTimelineTrip;
  orgId?: string;
  onSelectTrip: (trip: TripTimelineTrip) => void;
  onSync: () => void;
  onRefresh: () => void;
  onReloadRoute?: () => void;
  onCenterRoute?: () => void;
  onSelectBehaviorEvent: (event: TripBehaviorEvent) => void;
  onShowBehaviorEventOnMap: (event: TripBehaviorEvent) => void;
  onEnrichBehavior: (tripId: string) => void;
  onTripsReload: () => void;
  rentalContextByTripId?: Map<string, import('./utils/tripRentalContext').TripRentalContextView>;
  rentalBookingsLoading?: boolean;
  rentalBookingsError?: string | null;
  rentalDetailLoadingId?: string | null;
  onOpenBooking?: (bookingId: string) => void;
}

export function TripTimeline({
  isDarkMode,
  vehicleId,
  selectedDate,
  trips,
  energyEvents,
  timelineItems,
  energyEventsWarning,
  loading,
  loadError,
  syncing,
  selectedTripId,
  routePointsCount,
  routeLoading,
  routeError,
  enrichments,
  enrichingId,
  behaviorEvents,
  behaviorLoadingId,
  selectedBehaviorEventId,
  detailLoadingId,
  detailErrorId,
  resolveTrip,
  orgId,
  onSelectTrip,
  onSync,
  onRefresh,
  onReloadRoute,
  onCenterRoute,
  onSelectBehaviorEvent,
  onShowBehaviorEventOnMap,
  onEnrichBehavior,
  rentalContextByTripId,
  rentalBookingsLoading,
  rentalBookingsError,
  rentalDetailLoadingId,
  onOpenBooking,
}: TripTimelineProps) {
  const isDark = isDarkMode;
  const isEmpty = !loading && timelineItems.length === 0;
  const groups = groupTimelineByDate(timelineItems, behaviorEvents);
  const resolve = resolveTrip ?? ((t: TripTimelineTrip) => t);

  let emptyVariant: TripTimelineEmptyVariant | null = null;
  if (loadError) emptyVariant = 'load-error';
  else if (isEmpty && !vehicleId) emptyVariant = 'no-vehicle';
  else if (isEmpty && selectedDate) emptyVariant = 'no-trips-in-range';
  else if (isEmpty) emptyVariant = 'no-trips-yet';

  return (
    <div className={tv.panel}>
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h2 className={tv.sectionTitle}>
            {TIMELINE_COPY.tripHistory}
            <span className="ml-1.5 font-medium text-muted-foreground tabular-nums">
              ({trips.length}
              {energyEvents.length > 0 ? ` · ${TIMELINE_COPY.energyEvents(energyEvents.length)}` : ''})
            </span>
          </h2>
        </div>
      </div>

      {emptyVariant && (
        <TripTimelineEmptyState
          variant={emptyVariant}
          errorMessage={loadError ?? undefined}
          onCheckMissing={vehicleId ? onSync : undefined}
          onRefresh={vehicleId ? onRefresh : undefined}
          checking={syncing || loading}
        />
      )}

      {energyEventsWarning && !loadError && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <Icon name="alert-triangle" className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-200/90 leading-relaxed">
            {energyEventsWarning || TRIPS_COPY.energyWarning}
          </p>
        </div>
      )}

      {loading && !emptyVariant && timelineItems.length === 0 && <TripTimelineSkeleton />}

      {!emptyVariant && timelineItems.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.dateKey} className="space-y-2">
              <div className="sticky top-0 z-[1] -mx-0.5 px-0.5 py-2 bg-gradient-to-b from-card via-card/98 to-transparent backdrop-blur-[2px]">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between gap-x-3">
                  <p className="text-[12px] font-semibold text-foreground tracking-[-0.02em]">
                    {group.dateLabel}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {TIMELINE_COPY.daySummary(
                      group.summary.tripCount,
                      formatTripDistance(group.summary.totalKm),
                      formatTripDuration(group.summary.totalMinutes),
                    )}
                    {group.summary.notableEvents > 0 && (
                      <span className="ml-1.5 font-medium text-amber-600 dark:text-amber-400">
                        · {TIMELINE_COPY.dayNotable(group.summary.notableEvents)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {group.items.map((item) => {
                  if (item.itemType === 'energy-event') {
                    return (
                      <TripTimelineEnergyCard key={item.id} event={item.event} isDark={isDark} />
                    );
                  }

                  const trip = item.trip;
                  const displayTrip = resolve(trip);
                  const isSelected = selectedTripId === trip.id;
                  const rentalContext = rentalContextByTripId?.get(trip.id);
                  const chips = deriveOperationalChips(displayTrip, rentalContext);

                  return (
                    <TripTimelineCard
                      key={trip.id}
                      trip={displayTrip}
                      isSelected={isSelected}
                      isDark={isDark}
                      chips={chips}
                      onSelect={() => onSelectTrip(trip)}
                    >
                      <div
                        className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0 border-t border-border/35 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TripTimelineExpanded
                          trip={displayTrip}
                          isDark={isDark}
                          orgId={orgId}
                          vehicleId={vehicleId}
                          enrichment={enrichments[trip.id]}
                          enriching={enrichingId === trip.id}
                          detailLoading={detailLoadingId === trip.id}
                          detailError={detailErrorId === trip.id}
                          behaviorEvents={behaviorEvents[trip.id] ?? []}
                          behaviorEventsByTripId={behaviorEvents}
                          behaviorLoading={behaviorLoadingId === trip.id}
                          selectedBehaviorEventId={selectedBehaviorEventId}
                          onSelectBehaviorEvent={onSelectBehaviorEvent}
                          onShowBehaviorEventOnMap={onShowBehaviorEventOnMap}
                          onEnrichBehavior={() => onEnrichBehavior(trip.id)}
                          routePointsCount={routePointsCount}
                          routeLoading={routeLoading}
                          routeError={routeError}
                          onReloadRoute={isSelected ? onReloadRoute : undefined}
                          onCenterRoute={isSelected ? onCenterRoute : undefined}
                          rentalContext={rentalContext}
                          rentalBookingsLoading={rentalBookingsLoading}
                          rentalDetailLoading={
                            rentalDetailLoadingId != null &&
                            rentalContext?.booking?.id === rentalDetailLoadingId
                          }
                          rentalBookingsError={rentalBookingsError}
                          onOpenBooking={onOpenBooking}
                        />
                      </div>
                    </TripTimelineCard>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
