import { useCallback, useEffect, useRef, useState } from 'react';
import { useRentalOrg } from '../../../RentalContext';
import type { TripBehaviorEvent, TripData, TripMapActions, TripsViewProps } from '../trips.types';
import { isSyncMessageSuccess } from '../utils/tripStatus';
import { useAutoTripEnrichment, useTripEnrichment } from './useTripEnrichment';
import { useTripBehaviorEvents } from './useTripBehaviorEvents';
import { useTripDetail } from './useTripDetail';
import { useTripRoute } from './useTripRoute';
import { useTripsRentalContext } from './useTripsRentalContext';
import { useRequestGuard } from './useRequestGuard';
import { useVehicleTrips } from './useVehicleTrips';

/** Orchestrates all Trips-tab data loading, selection, route, behavior and map actions. */
export function useTripsTab({
  vehicleId,
  selectedDate,
  selectedDriver,
  onTripsLoaded,
}: TripsViewProps) {
  const { orgId } = useRentalOrg();
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const selectGuard = useRequestGuard();
  const mapActionsRef = useRef<TripMapActions | null>(null);

  const vehicleTrips = useVehicleTrips({
    vehicleId,
    selectedDate,
    selectedDriver,
    onTripsLoaded,
  });

  const route = useTripRoute(vehicleId);
  const enrichment = useTripEnrichment(vehicleId, vehicleTrips.loadTrips);
  const tripDetail = useTripDetail(vehicleId);

  const rental = useTripsRentalContext({
    orgId: orgId ?? undefined,
    vehicleId,
    selectedDate,
    trips: vehicleTrips.trips,
    selectedTripId: selectedTrip?.id ?? null,
  });

  const behavior = useTripBehaviorEvents({
    vehicleId,
    selectedTrip,
    patchTrip: vehicleTrips.patchTrip,
    onTripsReload: vehicleTrips.loadTrips,
    selectGuard,
  });

  useAutoTripEnrichment(
    selectedTrip,
    enrichment.enrichments,
    enrichment.enrichingId,
    enrichment.enrichTrip,
  );

  // Reset tab-local state when vehicle or filter context changes.
  useEffect(() => {
    selectGuard.next();
    setSelectedTrip(null);
    route.resetRoute();
    behavior.resetBehaviorState();
    tripDetail.clearDetailCache();
  }, [vehicleId, selectedDate, selectedDriver]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selected trip in sync after timeline reload (e.g. reconcile) without dropping selection.
  useEffect(() => {
    if (!selectedTrip) return;
    const fresh = vehicleTrips.trips.find((t) => t.id === selectedTrip.id);
    const detailed = tripDetail.tripDetails[selectedTrip.id];
    const merged = detailed ?? fresh;
    if (merged) {
      setSelectedTrip((prev) => (prev ? { ...prev, ...merged } : merged));
    }
  }, [vehicleTrips.trips, tripDetail.tripDetails, selectedTrip?.id]);

  const handleSelectTrip = useCallback(
    async (trip: TripData) => {
      if (selectedTrip?.id === trip.id) {
        selectGuard.next();
        setSelectedTrip(null);
        route.resetRoute();
        behavior.clearSelectedBehaviorEvent();
        return;
      }

      const seq = selectGuard.next();
      setSelectedTrip(trip);
      behavior.clearSelectedBehaviorEvent();

      await Promise.all([
        route.loadRouteForTrip(trip.id, seq, selectGuard),
        behavior.loadBehaviorForTrip(trip.id, seq),
        tripDetail.loadTripDetail(trip.id, seq, selectGuard),
      ]);
    },
    [selectedTrip?.id, route, behavior, tripDetail, selectGuard],
  );

  const reloadSelectedRoute = useCallback(() => {
    if (selectedTrip) route.reloadRoute(selectedTrip);
  }, [selectedTrip, route]);

  const handleSelectBehaviorEvent = useCallback(
    (event: TripBehaviorEvent) => {
      behavior.setSelectedBehaviorEventId(event.id);
    },
    [behavior],
  );

  const handleShowBehaviorEventOnMap = useCallback(
    (event: TripBehaviorEvent) => {
      behavior.setSelectedBehaviorEventId(event.id);
      mapActionsRef.current?.focusBehaviorEvent(event.id);
    },
    [behavior],
  );

  const syncIsSuccess = isSyncMessageSuccess(vehicleTrips.syncMessage);

  const mapRoutePoints = route.isRouteForTrip(selectedTrip?.id ?? null) ? route.routePoints : [];
  const mapRouteLoading = route.isRouteForTrip(selectedTrip?.id ?? null) && route.routeLoading;
  const mapRouteError = route.isRouteForTrip(selectedTrip?.id ?? null) ? route.routeError : null;

  const setMapActions = useCallback((actions: TripMapActions | null) => {
    mapActionsRef.current = actions;
  }, []);

  const centerSelectedRoute = useCallback(() => {
    mapActionsRef.current?.centerRoute();
  }, []);

  return {
    orgId,
    trips: vehicleTrips.trips,
    energyEvents: vehicleTrips.energyEvents,
    timelineItems: vehicleTrips.timelineItems,
    timelineSource: vehicleTrips.timelineSource,
    energyEventsWarning: vehicleTrips.energyEventsWarning,
    loading: vehicleTrips.loading,
    loadError: vehicleTrips.loadError,
    syncing: vehicleTrips.syncing,
    syncMessage: vehicleTrips.syncMessage,
    syncIsSuccess,
    loadTrips: vehicleTrips.loadTrips,
    handleSync: vehicleTrips.handleSync,
    selectedTrip,
    selectedTripId: selectedTrip?.id ?? null,
    resolveTrip: tripDetail.resolveTrip,
    detailLoadingId: tripDetail.detailLoadingId,
    detailErrorId: tripDetail.detailErrorId,
    routePoints: mapRoutePoints,
    routeLoading: mapRouteLoading,
    routeError: mapRouteError,
    routePointsCount: mapRoutePoints.length,
    enrichments: enrichment.enrichments,
    enrichingId: enrichment.enrichingId,
    behaviorEvents: behavior.behaviorEvents,
    behaviorLoadingId: behavior.behaviorLoading,
    selectedBehaviorEventId: behavior.selectedBehaviorEventId,
    setSelectedBehaviorEventId: behavior.setSelectedBehaviorEventId,
    handleSelectTrip,
    reloadSelectedRoute,
    enrichBehavior: behavior.enrichBehavior,
    setMapActions,
    centerSelectedRoute,
    handleShowBehaviorEventOnMap,
    handleSelectBehaviorEvent,
    rentalContextByTripId: rental.contextByTripId,
    rentalBookingsLoading: rental.bookingsLoading,
    rentalBookingsError: rental.bookingsError,
    rentalDetailLoadingId: rental.detailLoadingId,
    unlinkedTripCount: rental.unlinkedTripCount,
  };
}
