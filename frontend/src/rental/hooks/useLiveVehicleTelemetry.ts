import { useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import {
  isMeaningfulMovement,
  stableHeadingDeg,
  deriveVehicleState,
  type VehicleStateLabel,
  type DisplayIgnition,
  type OnlineStatus,
} from '../../lib/liveMapUtils';
import {
  type LiveTelemetrySnapshot,
  mapTelemetryDashboardResponseToLiveSnapshot,
  parseTelemetryHeadingDeg,
  parseTelemetryNumber,
  parseTelemetrySpeedKmh,
} from '../lib/telemetry-field-semantics';
import { isValidGpsCoordinate } from '../lib/overview-map-position';
import {
  mergeGpsMeasuredAt,
  resolveTelemetryDisplayTime,
  shouldAcceptNewerMeasurement,
} from '../lib/telemetry-timestamp-semantics';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';

const GPS_POLL_MS = 5_000;
const DASHBOARD_POLL_MS = 30_000;
const MAX_HISTORY = 10;
const JITTER_THRESHOLD_M = 8;

/**
 * Adaptive live-telemetry hook for the Vehicle Detail Overview tab.
 *
 * Two independent polling cycles:
 *  1. GPS cycle: every 5s → /live-gps (direct DIMO proxy, no DB)
 *     Only runs when isLiveTracking is true.
 *  2. Dashboard cycle: every 30s → /telemetry (full snapshot from DB)
 *     Always runs to keep fuel, EV SoC (`battery`), ignition, etc. current.
 *
 * When not live tracking, GPS comes from the dashboard cycle (30s).
 *
 * Store updates are scoped to the active vehicleId/orgId binding so stale
 * responses from a previous vehicle cannot leak into the UI.
 */
export function useLiveVehicleTelemetry(
  vehicleId: string | null,
  orgId: string,
): void {
  const lastTargetRef = useRef<[number, number] | null>(null);
  const locationHistoryRef = useRef<Array<[number, number]>>([]);
  const liveRef = useRef(false);
  const gpsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const sessionVehicleIdRef = useRef<string | null>(null);
  const sessionOrgIdRef = useRef<string | null>(null);

  const applyGpsPoint = useCallback(
    (
      boundVehicleId: string,
      boundOrgId: string,
      lat: number,
      lng: number,
      speed: number | null,
      source: 'dimo' | 'cache',
    ) => {
      const store = useVehicleLiveMapStore.getState();
      if (store.boundVehicleId !== boundVehicleId || store.boundOrgId !== boundOrgId) {
        return;
      }

      const newPos: [number, number] = [lng, lat];
      const nextHistory = [...locationHistoryRef.current, newPos].slice(-MAX_HISTORY);
      const prevPos =
        lastTargetRef.current ??
        (nextHistory.length >= 2 ? nextHistory[nextHistory.length - 2] : null);
      const meaningful = prevPos ? isMeaningfulMovement(prevPos, newPos, JITTER_THRESHOLD_M) : true;
      const heading = stableHeadingDeg(nextHistory);
      const isMoving =
        nextHistory.length >= 2
          ? isMeaningfulMovement(
              nextHistory[nextHistory.length - 2],
              nextHistory[nextHistory.length - 1],
              JITTER_THRESHOLD_M,
            )
          : false;

      locationHistoryRef.current = nextHistory;
      if (meaningful) {
        lastTargetRef.current = newPos;
      }

      store.patchIfBound(boundVehicleId, boundOrgId, {
        locationHistory: nextHistory,
        lastConfirmedPosition: newPos,
        lastLocationAt: Date.now(),
        gpsSource: source,
        speedKmh: speed ?? store.speedKmh,
        targetPosition: meaningful ? newPos : store.targetPosition,
        heading: heading ?? store.heading,
        isMoving,
      });
    },
    [],
  );

  const fetchGps = useCallback(
    async (boundVehicleId: string, boundOrgId: string) => {
      try {
        const data = await api.vehicles.liveGps(boundOrgId, boundVehicleId);
        const store = useVehicleLiveMapStore.getState();
        if (store.boundVehicleId !== boundVehicleId || store.boundOrgId !== boundOrgId) {
          return;
        }
        const lat = data.latitude;
        const lng = data.longitude;
        const incomingMeasuredAt =
          (data as { measuredAt?: string | null }).measuredAt ??
          (data as { lastSeenAt?: string | null }).lastSeenAt ??
          null;
        const canApplyByTime =
          incomingMeasuredAt == null ||
          shouldAcceptNewerMeasurement(store.measuredAt ?? store.lastSignal, incomingMeasuredAt);
        if (lat != null && lng != null && isValidGpsCoordinate(lat, lng) && canApplyByTime) {
          applyGpsPoint(boundVehicleId, boundOrgId, lat, lng, data.speedKmh, data.source);
          const merged = mergeGpsMeasuredAt(store, {
            measuredAt: (data as { measuredAt?: string | null }).measuredAt,
            lastSeenAt: (data as { lastSeenAt?: string | null }).lastSeenAt,
            receivedAt: (data as { receivedAt?: string | null }).receivedAt,
            source: data.source,
          });
          const displayTime = resolveTelemetryDisplayTime(merged);
          store.patchIfBound(boundVehicleId, boundOrgId, {
            measuredAt: displayTime.measuredAt,
            receivedAt: displayTime.receivedAt,
            lastSignal: displayTime.observedAtIso ?? store.lastSignal,
            signalAgeMs: displayTime.freshness.signalAgeMs,
            isFresh: displayTime.freshness.isLive,
            onlineStatus:
              displayTime.freshness.isLive
                ? 'ONLINE'
                : displayTime.freshness.isStandby
                  ? 'STANDBY'
                  : 'OFFLINE',
          });
        }
      } catch {
        // Keep previous position on GPS-only errors.
      }
    },
    [applyGpsPoint],
  );

  const fetchDashboard = useCallback(
    async (boundVehicleId: string, boundOrgId: string) => {
      try {
        const data = (await api.vehicles.telemetry(boundOrgId, boundVehicleId)) as {
          latitude?: number | null;
          longitude?: number | null;
          speed?: number;
          fuel?: number;
          coolant?: number;
          battery?: number;
          lvBatteryVoltage?: number;
          odometer?: number;
          engineLoad?: number;
          isIgnitionOn?: boolean | null;
          lastSignal?: string;
          measuredAt?: string | null;
          receivedAt?: string | null;
          signalAgeMs?: number;
          isFresh?: boolean;
          onlineStatus?: OnlineStatus;
          displayState?: VehicleStateLabel;
          displayIgnition?: DisplayIgnition;
          isLiveTracking?: boolean;
          displaySpeed?: number | null;
          displayCoolant?: number | null;
          displayEngineLoad?: number | null;
          tripDetectionState?: string | null;
          [k: string]: unknown;
        };

        const store = useVehicleLiveMapStore.getState();
        if (store.boundVehicleId !== boundVehicleId || store.boundOrgId !== boundOrgId) {
          return;
        }

        const speed = parseTelemetrySpeedKmh(data.speed);
        const engineLoad = parseTelemetryNumber(data.engineLoad);
        const rawIgnition = data.isIgnitionOn;
        const backendLive = data.isLiveTracking === true;
        const ignitionOn =
          rawIgnition === true || (rawIgnition == null && speed != null && speed > 0);
        const onlineStatus: OnlineStatus =
          data.onlineStatus === 'ONLINE' ||
          data.onlineStatus === 'STANDBY' ||
          data.onlineStatus === 'OFFLINE'
            ? data.onlineStatus
            : 'OFFLINE';
        const displayState: VehicleStateLabel =
          data.displayState === 'MOVING' ||
          data.displayState === 'IDLE' ||
          data.displayState === 'PARKED'
            ? data.displayState
            : deriveVehicleState(
                speed != null && speed > 3,
                ignitionOn,
                engineLoad != null && engineLoad > 0,
              );
        const displayIgnition: DisplayIgnition =
          data.displayIgnition === 'ON' ||
          data.displayIgnition === 'OFF' ||
          data.displayIgnition === 'UNKNOWN'
            ? data.displayIgnition
            : 'UNKNOWN';

        const snap: LiveTelemetrySnapshot = {
          ...mapTelemetryDashboardResponseToLiveSnapshot(data),
          ignitionOn,
        };
        const headingFromApi = parseTelemetryHeadingDeg(
          typeof data.heading === 'number' ? data.heading : undefined,
        );
        liveRef.current = backendLive;

        const displayTime = resolveTelemetryDisplayTime({
          measuredAt: data.measuredAt ?? null,
          receivedAt: data.receivedAt ?? null,
          lastSignal: data.lastSignal ?? null,
          signalAgeMs:
            typeof data.signalAgeMs === 'number' ? data.signalAgeMs : null,
          onlineStatus: data.onlineStatus,
        });

        store.patchIfBound(boundVehicleId, boundOrgId, {
          snapshot: snap,
          isLiveTracking: backendLive,
          loading: false,
          error: null,
          measuredAt: displayTime.measuredAt,
          receivedAt: displayTime.receivedAt,
          lastSignal: displayTime.observedAtIso ?? data.lastSignal ?? store.lastSignal,
          signalAgeMs: displayTime.freshness.signalAgeMs,
          isFresh: displayTime.freshness.isLive,
          onlineStatus:
            data.onlineStatus === 'ONLINE' ||
            data.onlineStatus === 'STANDBY' ||
            data.onlineStatus === 'OFFLINE'
              ? data.onlineStatus
              : displayTime.freshness.isLive
                ? 'ONLINE'
                : displayTime.freshness.isStandby
                  ? 'STANDBY'
                  : 'OFFLINE',
          displayState,
          displayIgnition,
          displaySpeed: data.displaySpeed ?? snap.speed,
          displayCoolant: data.displayCoolant ?? snap.coolant,
          displayEngineLoad: data.displayEngineLoad ?? snap.engineLoad,
          tripDetectionState: data.tripDetectionState ?? null,
          ...(headingFromApi != null ? { heading: headingFromApi } : {}),
          speedKmh: speed ?? store.speedKmh,
        });

        if (!backendLive) {
          const lat = data.latitude;
          const lng = data.longitude;
          const incomingMeasuredAt = data.measuredAt ?? data.lastSignal ?? null;
          const canApplyByTime =
            incomingMeasuredAt == null ||
            shouldAcceptNewerMeasurement(store.measuredAt ?? store.lastSignal, incomingMeasuredAt);
          if (lat != null && lng != null && isValidGpsCoordinate(lat, lng) && canApplyByTime) {
            applyGpsPoint(boundVehicleId, boundOrgId, lat, lng, speed, 'cache');
          }
        }
      } catch (error) {
        const store = useVehicleLiveMapStore.getState();
        if (store.boundVehicleId !== boundVehicleId || store.boundOrgId !== boundOrgId) {
          return;
        }
        store.patchIfBound(boundVehicleId, boundOrgId, {
          loading: false,
          error:
            error instanceof Error ? error.message : 'Failed to refresh live telemetry',
        });
      }
    },
    [applyGpsPoint],
  );

  useEffect(() => {
    if (!vehicleId || !orgId) {
      sessionVehicleIdRef.current = null;
      sessionOrgIdRef.current = null;
      lastTargetRef.current = null;
      locationHistoryRef.current = [];
      liveRef.current = false;
      useVehicleLiveMapStore.getState().unbind();
      return;
    }

    cancelledRef.current = false;
    sessionVehicleIdRef.current = vehicleId;
    sessionOrgIdRef.current = orgId;
    lastTargetRef.current = null;
    locationHistoryRef.current = [];
    liveRef.current = false;
    useVehicleLiveMapStore.getState().bindToVehicle(vehicleId, orgId);

    const scheduleDash = () => {
      if (cancelledRef.current) return;
      dashTimerRef.current = setTimeout(async () => {
        if (cancelledRef.current) return;
        const vid = sessionVehicleIdRef.current;
        const oid = sessionOrgIdRef.current;
        if (!vid || !oid) return;
        await fetchDashboard(vid, oid);
        scheduleDash();
      }, DASHBOARD_POLL_MS);
    };

    const scheduleGps = () => {
      if (cancelledRef.current) return;
      gpsTimerRef.current = setTimeout(async () => {
        if (cancelledRef.current) return;
        const vid = sessionVehicleIdRef.current;
        const oid = sessionOrgIdRef.current;
        if (!vid || !oid) return;
        if (liveRef.current) {
          await fetchGps(vid, oid);
        }
        scheduleGps();
      }, GPS_POLL_MS);
    };

    fetchDashboard(vehicleId, orgId).then(() => {
      if (cancelledRef.current) return;
      scheduleDash();
      if (liveRef.current) {
        fetchGps(vehicleId, orgId).then(() => {
          if (!cancelledRef.current) scheduleGps();
        });
      } else {
        scheduleGps();
      }
    });

    return () => {
      cancelledRef.current = true;
      if (gpsTimerRef.current) {
        clearTimeout(gpsTimerRef.current);
        gpsTimerRef.current = null;
      }
      if (dashTimerRef.current) {
        clearTimeout(dashTimerRef.current);
        dashTimerRef.current = null;
      }
    };
  }, [vehicleId, orgId, fetchDashboard, fetchGps]);
}
