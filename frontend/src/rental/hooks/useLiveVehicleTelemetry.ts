import { useEffect, useRef, useCallback, useState } from 'react';
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
import { resolveVehicleDetailTelemetryState } from '../lib/vehicle-telemetry-runtime';
import { classifyTelemetryAccessError } from '../lib/telemetry-access-errors';
import {
  VEHICLE_DETAIL_POLLING,
  type VehicleDetailPollingGates,
} from '../lib/vehicle-detail-polling-policy';
import { useVehicleDetailPollingStore } from '../stores/useVehicleDetailPollingStore';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';

const MAX_HISTORY = 10;
const JITTER_THRESHOLD_M = 8;

export interface LiveVehicleTelemetryOptions {
  vehicleId: string | null;
  orgId: string;
  gates: VehicleDetailPollingGates;
}

/**
 * Demand-driven live telemetry for the Vehicle Detail Page.
 *
 * - GPS (5s): only when `gates.gpsHighFrequency` and backend `isLiveTracking`.
 * - Dashboard: interval from `gates.dashboardIntervalMs` while `gates.dashboardTelemetry`.
 * - Timers are cleared when gates close, on vehicle change, or unmount.
 */
export function useLiveVehicleTelemetry({
  vehicleId,
  orgId,
  gates,
}: LiveVehicleTelemetryOptions): void {
  const lastTargetRef = useRef<[number, number] | null>(null);
  const locationHistoryRef = useRef<Array<[number, number]>>([]);
  const liveRef = useRef(false);
  const [trackingLive, setTrackingLive] = useState(false);
  const gpsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionVehicleIdRef = useRef<string | null>(null);
  const sessionOrgIdRef = useRef<string | null>(null);
  const gatesRef = useRef(gates);
  gatesRef.current = gates;

  const gpsLoopIdRef = useRef(0);
  const dashLoopIdRef = useRef(0);

  const clearTimers = useCallback(() => {
    dashLoopIdRef.current += 1;
    gpsLoopIdRef.current += 1;
    if (gpsTimerRef.current) {
      clearTimeout(gpsTimerRef.current);
      gpsTimerRef.current = null;
    }
    if (dashTimerRef.current) {
      clearTimeout(dashTimerRef.current);
      dashTimerRef.current = null;
    }
  }, []);

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

  const recordAccessBlock = useCallback((err: unknown) => {
    const reason = classifyTelemetryAccessError(err);
    if (reason) {
      useVehicleDetailPollingStore.getState().setTelemetryAccessBlock(reason);
    }
  }, []);

  const clearAccessBlock = useCallback(() => {
    useVehicleDetailPollingStore.getState().setTelemetryAccessBlock(null);
  }, []);

  const fetchGps = useCallback(
    async (boundVehicleId: string, boundOrgId: string) => {
      if (!gatesRef.current.gpsHighFrequency) return;
      try {
        const data = await api.vehicles.liveGps(boundOrgId, boundVehicleId);
        clearAccessBlock();
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
          const canonical = resolveVehicleDetailTelemetryState(merged);
          store.patchIfBound(boundVehicleId, boundOrgId, {
            measuredAt: displayTime.measuredAt,
            receivedAt: displayTime.receivedAt,
            lastSignal: displayTime.observedAtIso ?? store.lastSignal,
            signalAgeMs: canonical.signalAgeMs,
            isFresh: canonical.isLive,
            telemetryFreshness: canonical.freshness,
            onlineStatus: canonical.isLive
              ? 'ONLINE'
              : canonical.isStandby
                ? 'STANDBY'
                : 'OFFLINE',
          });
        }
      } catch (err) {
        recordAccessBlock(err);
      }
    },
    [applyGpsPoint, clearAccessBlock, recordAccessBlock],
  );

  const fetchDashboard = useCallback(
    async (boundVehicleId: string, boundOrgId: string) => {
      if (!gatesRef.current.dashboardTelemetry) return;
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

        clearAccessBlock();

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
        setTrackingLive(backendLive);

        const displayTime = resolveTelemetryDisplayTime({
          measuredAt: data.measuredAt ?? null,
          receivedAt: data.receivedAt ?? null,
          lastSignal: data.lastSignal ?? null,
          signalAgeMs:
            typeof data.signalAgeMs === 'number' ? data.signalAgeMs : null,
          onlineStatus: data.onlineStatus,
        });
        const canonical = resolveVehicleDetailTelemetryState({
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
          signalAgeMs: canonical.signalAgeMs,
          isFresh: canonical.isLive,
          telemetryFreshness: canonical.freshness,
          onlineStatus: canonical.isLive
            ? 'ONLINE'
            : canonical.isStandby
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
        recordAccessBlock(error);
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
    [applyGpsPoint, clearAccessBlock, recordAccessBlock],
  );

  useEffect(() => {
    if (!vehicleId || !orgId) {
      sessionVehicleIdRef.current = null;
      sessionOrgIdRef.current = null;
      lastTargetRef.current = null;
      locationHistoryRef.current = [];
      liveRef.current = false;
      setTrackingLive(false);
      clearTimers();
      useVehicleLiveMapStore.getState().unbind();
      useVehicleDetailPollingStore.getState().setTelemetryAccessBlock(null);
      return;
    }

    sessionVehicleIdRef.current = vehicleId;
    sessionOrgIdRef.current = orgId;
    lastTargetRef.current = null;
    locationHistoryRef.current = [];
    liveRef.current = false;
    setTrackingLive(false);
    clearTimers();
    useVehicleDetailPollingStore.getState().setTelemetryAccessBlock(null);
    useVehicleLiveMapStore.getState().bindToVehicle(vehicleId, orgId);
  }, [vehicleId, orgId, clearTimers]);

  useEffect(() => {
    if (!vehicleId || !orgId || !gates.dashboardTelemetry) {
      if (dashTimerRef.current) {
        clearTimeout(dashTimerRef.current);
        dashTimerRef.current = null;
      }
      dashLoopIdRef.current += 1;
      return;
    }

    const loopId = dashLoopIdRef.current + 1;
    dashLoopIdRef.current = loopId;

    const runDashboardLoop = async () => {
      if (loopId !== dashLoopIdRef.current) return;
      await fetchDashboard(vehicleId, orgId);
      if (loopId !== dashLoopIdRef.current || !gatesRef.current.dashboardTelemetry) return;

      dashTimerRef.current = setTimeout(() => {
        void runDashboardLoop();
      }, gatesRef.current.dashboardIntervalMs);
    };

    void runDashboardLoop();

    return () => {
      dashLoopIdRef.current += 1;
      if (dashTimerRef.current) {
        clearTimeout(dashTimerRef.current);
        dashTimerRef.current = null;
      }
    };
  }, [
    vehicleId,
    orgId,
    gates.dashboardTelemetry,
    gates.dashboardIntervalMs,
    fetchDashboard,
  ]);

  useEffect(() => {
    if (!vehicleId || !orgId || !gates.gpsHighFrequency || !trackingLive) {
      gpsLoopIdRef.current += 1;
      if (gpsTimerRef.current) {
        clearTimeout(gpsTimerRef.current);
        gpsTimerRef.current = null;
      }
      return;
    }
    if (gpsTimerRef.current) return;

    const gpsLoopId = gpsLoopIdRef.current + 1;
    gpsLoopIdRef.current = gpsLoopId;

    const runGps = async () => {
      if (gpsLoopId !== gpsLoopIdRef.current || !liveRef.current) return;
      await fetchGps(vehicleId, orgId);
      if (gpsLoopId !== gpsLoopIdRef.current) return;
      gpsTimerRef.current = setTimeout(() => {
        void runGps();
      }, VEHICLE_DETAIL_POLLING.GPS_MS);
    };

    void runGps();

    return () => {
      gpsLoopIdRef.current += 1;
      if (gpsTimerRef.current) {
        clearTimeout(gpsTimerRef.current);
        gpsTimerRef.current = null;
      }
    };
  }, [vehicleId, orgId, gates.gpsHighFrequency, trackingLive, fetchGps]);
}

export { VEHICLE_DETAIL_POLLING };
