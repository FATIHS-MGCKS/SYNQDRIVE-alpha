import { useMemo } from 'react';
import { TripsMapCard } from './TripsMapCard';
import { TripTimeline } from './TripTimeline';
import { TripsHeader } from './TripsHeader';
import { TripsSummaryBar } from './TripsSummaryBar';
import { tv } from './trips-view-ui';
import { useTripsTab } from './hooks/useTripsTab';
import { computeTripsPeriodSummary } from './utils/tripSummary';
import type { TripsViewProps } from './trips.types';

export type { TripsViewProps, TripData } from './trips.types';

export function TripsView(props: TripsViewProps) {
  const { isDarkMode, vehicleId, selectedDate, onOpenBooking } = props;
  const tab = useTripsTab(props);

  const periodSummary = useMemo(
    () => computeTripsPeriodSummary(tab.trips),
    [tab.trips],
  );

  return (
    <div className={tv.page}>
      <TripsHeader
        selectedDate={selectedDate}
        tripCount={tab.trips.length}
        notableEvents={periodSummary.notableEvents}
        loading={tab.loading}
        syncing={tab.syncing}
        onRefresh={vehicleId ? tab.loadTrips : undefined}
        onCheckMissing={vehicleId ? tab.handleSync : undefined}
        disabled={!vehicleId}
      />

      <TripsSummaryBar summary={periodSummary} loading={tab.loading} />

      <div className={tv.grid}>
        <div className="order-2 xl:order-1 min-w-0">
          <TripsMapCard
            isDarkMode={isDarkMode}
            vehicleId={vehicleId}
            selectedTrip={tab.selectedTrip}
            routePoints={tab.routePoints}
            routeLoading={tab.routeLoading}
            routeError={tab.routeError}
            enrichment={tab.selectedTrip ? tab.enrichments[tab.selectedTrip.id] : undefined}
            enrichingTrip={Boolean(tab.selectedTrip && tab.enrichingId === tab.selectedTrip.id)}
            behaviorEvents={tab.selectedTrip ? (tab.behaviorEvents[tab.selectedTrip.id] ?? []) : []}
            behaviorLoading={Boolean(tab.selectedTrip && tab.behaviorLoadingId === tab.selectedTrip.id)}
            syncing={tab.syncing}
            syncMessage={tab.syncMessage}
            syncIsSuccess={tab.syncIsSuccess}
            selectedBehaviorEventId={tab.selectedBehaviorEventId}
            onBehaviorEventSelect={tab.setSelectedBehaviorEventId}
            onShowEventInDetails={tab.setSelectedBehaviorEventId}
            onMapReady={tab.setMapActions}
          />
        </div>

        <div className="order-1 xl:order-2 min-w-0">
          <TripTimeline
            isDarkMode={isDarkMode}
            vehicleId={vehicleId}
            selectedDate={selectedDate}
            trips={tab.trips}
            energyEvents={tab.energyEvents}
            timelineItems={tab.timelineItems}
            timelineSource={tab.timelineSource}
            energyEventsWarning={tab.energyEventsWarning}
            loading={tab.loading}
            loadError={tab.loadError}
            syncing={tab.syncing}
            selectedTripId={tab.selectedTripId}
            routePointsCount={tab.routePointsCount}
            routeLoading={tab.routeLoading}
            routeError={tab.routeError}
            enrichments={tab.enrichments}
            enrichingId={tab.enrichingId}
            behaviorEvents={tab.behaviorEvents}
            behaviorLoadingId={tab.behaviorLoadingId}
            selectedBehaviorEventId={tab.selectedBehaviorEventId}
            detailLoadingId={tab.detailLoadingId}
            detailErrorId={tab.detailErrorId}
            resolveTrip={tab.resolveTrip}
            orgId={tab.orgId}
            onSelectTrip={tab.handleSelectTrip}
            onSync={tab.handleSync}
            onRefresh={tab.loadTrips}
            onReloadRoute={tab.reloadSelectedRoute}
            onCenterRoute={tab.centerSelectedRoute}
            onSelectBehaviorEvent={tab.handleSelectBehaviorEvent}
            onShowBehaviorEventOnMap={tab.handleShowBehaviorEventOnMap}
            onEnrichBehavior={tab.enrichBehavior}
            onTripsReload={tab.loadTrips}
            rentalContextByTripId={tab.rentalContextByTripId}
            rentalBookingsLoading={tab.rentalBookingsLoading}
            rentalBookingsError={tab.rentalBookingsError}
            rentalDetailLoadingId={tab.rentalDetailLoadingId}
            onOpenBooking={onOpenBooking}
          />
        </div>
      </div>
    </div>
  );
}
