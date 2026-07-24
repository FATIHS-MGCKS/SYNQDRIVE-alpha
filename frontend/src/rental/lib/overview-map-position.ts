import type { LiveGpsSource } from '../stores/useVehicleLiveMapStore';

export type OverviewMapPositionMode =
  | 'noPosition'
  | 'staticPositionOnly'
  | 'lastKnownPosition'
  | 'livePosition'
  | 'telemetryUnavailable'
  | 'trackingUnavailable';

export interface OverviewMapPositionView {
  mode: OverviewMapPositionMode;
  mapTargetPosition: [number, number] | null;
  mapInitialPosition: [number, number] | null;
  showEmptyState: boolean;
  operatorHint: string | null;
  operatorHintSub: string | null;
  isBoundToCurrentVehicle: boolean;
}

function isValidCoord(lat?: number | null, lng?: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function toLngLat(lat?: number | null, lng?: number | null): [number, number] | null {
  if (!isValidCoord(lat, lng)) return null;
  return [lng!, lat!];
}

export function isLiveMapStoreBoundTo(
  boundVehicleId: string | null,
  boundOrgId: string | null,
  vehicleId: string | null,
  orgId: string | null,
): boolean {
  return (
    vehicleId != null &&
    orgId != null &&
    boundVehicleId === vehicleId &&
    boundOrgId === orgId
  );
}

export function deriveOverviewMapPosition(input: {
  boundVehicleId: string | null;
  boundOrgId: string | null;
  vehicleId: string | null;
  orgId: string | null;
  targetPosition: [number, number] | null;
  lastConfirmedPosition: [number, number] | null;
  staticLat?: number | null;
  staticLng?: number | null;
  loading: boolean;
  error: string | null;
  isLiveTracking: boolean;
  isFresh: boolean;
  gpsSource: LiveGpsSource;
}): OverviewMapPositionView {
  const {
    boundVehicleId,
    boundOrgId,
    vehicleId,
    orgId,
    targetPosition,
    lastConfirmedPosition,
    staticLat,
    staticLng,
    loading,
    error,
    isLiveTracking,
    isFresh,
    gpsSource,
  } = input;

  const staticPosition = toLngLat(staticLat, staticLng);
  const isBound = isLiveMapStoreBoundTo(boundVehicleId, boundOrgId, vehicleId, orgId);

  const empty = (
    mode: OverviewMapPositionMode,
    hint: string | null,
    sub: string | null = null,
  ): OverviewMapPositionView => ({
    mode,
    mapTargetPosition: null,
    mapInitialPosition: staticPosition,
    showEmptyState: true,
    operatorHint: hint,
    operatorHintSub: sub,
    isBoundToCurrentVehicle: isBound,
  });

  if (!vehicleId || !orgId) {
    return empty('noPosition', null);
  }

  if (!isBound) {
    if (staticPosition) {
      return {
        mode: 'staticPositionOnly',
        mapTargetPosition: staticPosition,
        mapInitialPosition: staticPosition,
        showEmptyState: false,
        operatorHint: null,
        operatorHintSub: null,
        isBoundToCurrentVehicle: false,
      };
    }
    return {
      mode: 'noPosition',
      mapTargetPosition: null,
      mapInitialPosition: null,
      showEmptyState: false,
      operatorHint: null,
      operatorHintSub: null,
      isBoundToCurrentVehicle: false,
    };
  }

  const cachedPosition = targetPosition ?? lastConfirmedPosition;
  const hasLiveGps =
    isLiveTracking &&
    targetPosition != null &&
    gpsSource === 'dimo';

  if (error) {
    const fallback = cachedPosition ?? staticPosition;
    if (fallback) {
      return {
        mode: 'telemetryUnavailable',
        mapTargetPosition: fallback,
        mapInitialPosition: staticPosition ?? fallback,
        showEmptyState: false,
        operatorHint: 'Telemetry temporarily unavailable',
        operatorHintSub: 'Last known position shown',
        isBoundToCurrentVehicle: true,
      };
    }
    return empty('telemetryUnavailable', 'Telemetry temporarily unavailable', 'No coordinates available');
  }

  if (hasLiveGps) {
    return {
      mode: 'livePosition',
      mapTargetPosition: targetPosition,
      mapInitialPosition: staticPosition ?? targetPosition,
      showEmptyState: false,
      operatorHint: null,
      operatorHintSub: null,
      isBoundToCurrentVehicle: true,
    };
  }

  if (isLiveTracking && targetPosition) {
    return {
      mode: 'lastKnownPosition',
      mapTargetPosition: targetPosition,
      mapInitialPosition: staticPosition ?? targetPosition,
      showEmptyState: false,
      operatorHint: null,
      operatorHintSub: 'Last known position shown',
      isBoundToCurrentVehicle: true,
    };
  }

  if (cachedPosition) {
    return {
      mode: isLiveTracking ? 'lastKnownPosition' : 'lastKnownPosition',
      mapTargetPosition: cachedPosition,
      mapInitialPosition: staticPosition ?? cachedPosition,
      showEmptyState: false,
      operatorHint: isLiveTracking ? null : 'No live tracking available',
      operatorHintSub: 'Last known position shown',
      isBoundToCurrentVehicle: true,
    };
  }

  if (staticPosition) {
    return {
      mode: 'staticPositionOnly',
      mapTargetPosition: staticPosition,
      mapInitialPosition: staticPosition,
      showEmptyState: false,
      operatorHint: loading ? null : 'No live tracking available',
      operatorHintSub: loading ? null : 'Last known position shown',
      isBoundToCurrentVehicle: true,
    };
  }

  if (loading) {
    return {
      mode: 'noPosition',
      mapTargetPosition: null,
      mapInitialPosition: null,
      showEmptyState: false,
      operatorHint: null,
      operatorHintSub: null,
      isBoundToCurrentVehicle: true,
    };
  }

  if (!isLiveTracking) {
    return empty('trackingUnavailable', 'No live tracking available', 'No coordinates available');
  }

  return empty('noPosition', 'No coordinates available');
}
