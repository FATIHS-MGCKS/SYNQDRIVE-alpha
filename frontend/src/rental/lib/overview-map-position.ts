import type { LiveGpsSource } from '../stores/useVehicleLiveMapStore';
import { toTelemetryFreshnessInput } from './telemetry-timestamp-semantics';
import { parseTelemetryTimestampMs } from './telemetryFreshness';
import { isCanonicalTelemetryLive } from './vehicle-telemetry-runtime';

/** Canonical fachliche Positionklasse (Prompt 12/36). */
export type OverviewPositionClass = 'live' | 'lastKnown' | 'none';

/**
 * UI presentation modes — map 1:n onto {@link OverviewPositionClass}
 * with operator hints / empty-state variants. Keine neue Produktfunktion.
 */
export type OverviewMapPositionMode =
  | 'noPosition'
  | 'staticPositionOnly'
  | 'lastKnownPosition'
  | 'livePosition'
  | 'telemetryUnavailable'
  | 'trackingUnavailable';

export interface OverviewMapPositionView {
  /** Canonical classification used for live badge / animation decisions. */
  positionClass: OverviewPositionClass;
  mode: OverviewMapPositionMode;
  mapTargetPosition: [number, number] | null;
  mapInitialPosition: [number, number] | null;
  showEmptyState: boolean;
  operatorHint: string | null;
  operatorHintSub: string | null;
  isBoundToCurrentVehicle: boolean;
}

export interface OverviewMapPositionInput {
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
  gpsSource: LiveGpsSource;
  measuredAt?: string | null;
  lastSignal?: string | null;
  signalAgeMs?: number | null;
  receivedAt?: string | null;
  onlineStatus?: string | null;
  /** Test hook — defaults to Date.now(). */
  now?: number;
}

export interface PositionLiveEligibilityInput {
  isBound: boolean;
  isLiveTracking: boolean;
  targetPosition: [number, number] | null;
  gpsSource: LiveGpsSource;
  measuredAt?: string | null;
  lastSignal?: string | null;
  signalAgeMs?: number | null;
  receivedAt?: string | null;
  onlineStatus?: string | null;
  now?: number;
}

const NULL_ISLAND_EPSILON = 1e-6;

export function isNullIslandCoordinate(lat: number, lng: number): boolean {
  return Math.abs(lat) < NULL_ISLAND_EPSILON && Math.abs(lng) < NULL_ISLAND_EPSILON;
}

export function isValidGpsCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (isNullIslandCoordinate(lat, lng)) return false;
  return true;
}

/** Validate Mapbox `[lng, lat]` tuple. */
export function parseLngLat(position: [number, number] | null | undefined): [number, number] | null {
  if (!position || position.length < 2) return null;
  const [lng, lat] = position;
  if (!isValidGpsCoordinate(lat, lng)) return null;
  return [lng, lat];
}

export function toLngLat(lat?: number | null, lng?: number | null): [number, number] | null {
  if (lat == null || lng == null) return null;
  if (!isValidGpsCoordinate(lat, lng)) return null;
  return [lng, lat];
}

export function isLiveGpsSource(source: LiveGpsSource): boolean {
  return source === 'dimo';
}

export function isPlausibleMeasuredAt(
  measuredAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const ms = parseTelemetryTimestampMs(measuredAt ?? null);
  if (ms == null) return false;
  if (ms > now + 60_000) return false;
  return true;
}

/** All criteria for a live position label — see audit decision matrix. */
export function isLivePositionEligible(input: PositionLiveEligibilityInput): boolean {
  if (!input.isBound) return false;
  if (!input.isLiveTracking) return false;
  if (!parseLngLat(input.targetPosition)) return false;
  if (!isLiveGpsSource(input.gpsSource)) return false;
  if (!isPlausibleMeasuredAt(input.measuredAt, input.now)) return false;
  if (!isCanonicalTelemetryLive(toTelemetryFreshnessInput(input), { now: input.now })) return false;
  return true;
}

export function classifyOverviewPositionClass(
  input: PositionLiveEligibilityInput & {
    lastKnownPosition: [number, number] | null;
    staticPosition: [number, number] | null;
  },
): OverviewPositionClass {
  if (isLivePositionEligible(input)) {
    return 'live';
  }
  if (input.lastKnownPosition ?? input.staticPosition) {
    return 'lastKnown';
  }
  return 'none';
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

function buildView(
  base: Omit<OverviewMapPositionView, 'positionClass' | 'mode'> & {
    positionClass: OverviewPositionClass;
    mode: OverviewMapPositionMode;
  },
): OverviewMapPositionView {
  return base;
}

export function deriveOverviewMapPosition(input: OverviewMapPositionInput): OverviewMapPositionView {
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
    gpsSource,
    measuredAt,
    lastSignal,
    signalAgeMs,
    receivedAt,
    onlineStatus,
    now = Date.now(),
  } = input;

  const staticPosition = toLngLat(staticLat, staticLng);
  const liveTarget = parseLngLat(targetPosition);
  const lastKnown = parseLngLat(lastConfirmedPosition) ?? liveTarget;
  const fallbackPosition = liveTarget ?? lastKnown ?? staticPosition;
  const isBound = isLiveMapStoreBoundTo(boundVehicleId, boundOrgId, vehicleId, orgId);

  const empty = (
    mode: OverviewMapPositionMode,
    positionClass: OverviewPositionClass,
    hint: string | null,
    sub: string | null = null,
  ): OverviewMapPositionView =>
    buildView({
      positionClass,
      mode,
      mapTargetPosition: null,
      mapInitialPosition: staticPosition,
      showEmptyState: true,
      operatorHint: hint,
      operatorHintSub: sub,
      isBoundToCurrentVehicle: isBound,
    });

  if (!vehicleId || !orgId) {
    return empty('noPosition', 'none', null);
  }

  if (!isBound) {
    if (staticPosition) {
      return buildView({
        positionClass: 'lastKnown',
        mode: 'staticPositionOnly',
        mapTargetPosition: staticPosition,
        mapInitialPosition: staticPosition,
        showEmptyState: false,
        operatorHint: null,
        operatorHintSub: null,
        isBoundToCurrentVehicle: false,
      });
    }
    return buildView({
      positionClass: 'none',
      mode: 'noPosition',
      mapTargetPosition: null,
      mapInitialPosition: null,
      showEmptyState: false,
      operatorHint: null,
      operatorHintSub: null,
      isBoundToCurrentVehicle: false,
    });
  }

  const positionClass = classifyOverviewPositionClass({
    isBound,
    isLiveTracking,
    targetPosition: liveTarget,
    gpsSource,
    measuredAt,
    lastSignal,
    signalAgeMs,
    receivedAt,
    onlineStatus,
    now,
    lastKnownPosition: lastKnown,
    staticPosition,
  });

  if (error) {
    if (fallbackPosition) {
      return buildView({
        positionClass: 'lastKnown',
        mode: 'telemetryUnavailable',
        mapTargetPosition: fallbackPosition,
        mapInitialPosition: staticPosition ?? fallbackPosition,
        showEmptyState: false,
        operatorHint: 'Telemetry temporarily unavailable',
        operatorHintSub: 'Last known position shown',
        isBoundToCurrentVehicle: true,
      });
    }
    return empty(
      'telemetryUnavailable',
      'none',
      'Telemetry temporarily unavailable',
      'No coordinates available',
    );
  }

  if (positionClass === 'live' && liveTarget) {
    return buildView({
      positionClass: 'live',
      mode: 'livePosition',
      mapTargetPosition: liveTarget,
      mapInitialPosition: staticPosition ?? liveTarget,
      showEmptyState: false,
      operatorHint: null,
      operatorHintSub: null,
      isBoundToCurrentVehicle: true,
    });
  }

  if (positionClass === 'lastKnown' && fallbackPosition) {
    const fromStaticOnly = !liveTarget && !lastKnown && staticPosition != null;
    return buildView({
      positionClass: 'lastKnown',
      mode: fromStaticOnly ? 'staticPositionOnly' : 'lastKnownPosition',
      mapTargetPosition: fallbackPosition,
      mapInitialPosition: staticPosition ?? fallbackPosition,
      showEmptyState: false,
      operatorHint: fromStaticOnly && !loading ? 'No live tracking available' : null,
      operatorHintSub: 'Last known position shown',
      isBoundToCurrentVehicle: true,
    });
  }

  if (loading) {
    return buildView({
      positionClass: 'none',
      mode: 'noPosition',
      mapTargetPosition: null,
      mapInitialPosition: null,
      showEmptyState: false,
      operatorHint: null,
      operatorHintSub: null,
      isBoundToCurrentVehicle: true,
    });
  }

  if (!isLiveTracking) {
    return empty(
      'trackingUnavailable',
      'none',
      'No live tracking available',
      'No coordinates available',
    );
  }

  return empty('noPosition', 'none', 'No coordinates available');
}
