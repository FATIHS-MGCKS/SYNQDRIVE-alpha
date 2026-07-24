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
import {
  VEHICLE_DETAIL_POLLING,
  type VehicleDetailPollingGates,
} from '../lib/vehicle-detail-polling-policy';
import {
  VehicleTelemetryRequestCoordinator,
  type TelemetryRequestBinding,
  type TelemetryRequestRunResult,
} from '../lib/vehicle-telemetry-request-coordinator';
import { VEHICLE_TELEMETRY_RETRY } from '../lib/vehicle-telemetry-retry';
import { useVehicleDetailPollingStore } from '../stores/useVehicleDetailPollingStore';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';

const MAX_HISTORY = 10;
const JITTER_THRESHOLD_M = 8;

export interface LiveVehicleTelemetryOptions {
  vehicleId: string | null;
  orgId: string;
  gates: VehicleDetailPollingGates;
}

type DashboardTelemetryData = {
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
  heading?: number;
  [k: string]: unknown;
};

/**
 * Demand-driven live telemetry for the Vehicle Detail Page.
 *
 * - GPS (5s): only when `gates.gpsHighFrequency` and backend `isLiveTracking`.
 * - Dashboard: interval from `gates.dashboardIntervalMs` while `gates.dashboardTelemetry`.
 * - Requests are aborted on vehicle change, unmount, tab/gate close; retries use backoff.
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
  const coordinatorRef = useRef<VehicleTelemetryRequestCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new VehicleTelemetryRequestCoordinator();
  }
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

  const recordAccessBlockFromPolicy = useCallback(
    (result: TelemetryRequestRunResult<unknown>) => {
      if (!result.policy) return;
      if (result.policy.kind === 'permission') {
        useVehicleDetailPollingStore.getState().setTelemetryAccessBlock('permission');
        return;
      }
      if (result.policy.kind === 'data_authorization') {
        useVehicleDetailPollingStore.getState().setTelemetryAccessBlock('data_authorization');
      }
    },
    [],
  );

  const clearAccessBlock = useCallback(() => {
    useVehicleDetailPollingStore.getState().setTelemetryAccessBlock(null);
  }, []);

  const surfaceDashboardFailure = useCallback(
    (binding: TelemetryRequestBinding, result: TelemetryRequestRunResult<unknown>) => {
      if (result.aborted || result.stale || !result.policy) return;

      recordAccessBlockFromPolicy(result);

      if (
        result.failureStreak < VEHICLE_TELEMETRY_RETRY.ERROR_SURFACE_AFTER ||
        !result.policy.userMessage
      ) {
        return;
      }

      const store = useVehicleLiveMapStore.getState();
      if (
        store.boundVehicleId !== binding.vehicleId ||
        store.boundOrgId !== binding.organizationId
      ) {
        return;
      }

      store.patchIfBound(binding.vehicleId, binding.organizationId, {
        loading: false,
        error: result.policy.userMessage,
      });
    },
    [recordAccessBlockFromPolicy],
  );

  const applyDashboardData = useCallback(
    (binding: TelemetryRequestBinding, data: DashboardTelemetryData) => {
      const store = useVehicleLiveMapStore.getState();
      if (
        store.boundVehicleId !== binding.vehicleId ||
        store.boundOrgId !== binding.organizationId
      ) {
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
        signalAgeMs: typeof data.signalAgeMs === 'number' ? data.signalAgeMs : null,
        onlineStatus: data.onlineStatus,
      });
      const canonical = resolveVehicleDetailTelemetryState({
        measuredAt: data.measuredAt ?? null,
        receivedAt: data.receivedAt ?? null,
        lastSignal: data.lastSignal ?? null,
        signalAgeMs: typeof data.signalAgeMs === 'number' ? data.signalAgeMs : null,
        onlineStatus: data.onlineStatus,
      });

      store.patchIfBound(binding.vehicleId, binding.organizationId, {
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
          applyGpsPoint(binding.vehicleId, binding.organizationId, lat, lng, speed, 'cache');
        }
      }
    },
    [applyGpsPoint],
  );

  const applyGpsData = useCallback(
    (
      binding: TelemetryRequestBinding,
      data: {
        latitude: number | null;
        longitude: number | null;
        speedKmh: number | null;
        source: 'dimo' | 'cache';
        measuredAt?: string | null;
        lastSeenAt?: string | null;
        receivedAt?: string | null;
      },
    ) => {
      const store = useVehicleLiveMapStore.getState();
      if (
        store.boundVehicleId !== binding.vehicleId ||
        store.boundOrgId !== binding.organizationId
      ) {
        return;
      }

      const lat = data.latitude;
      const lng = data.longitude;
      const incomingMeasuredAt = data.measuredAt ?? data.lastSeenAt ?? null;
      const canApplyByTime =
        incomingMeasuredAt == null ||
        shouldAcceptNewerMeasurement(store.measuredAt ?? store.lastSignal, incomingMeasuredAt);

      if (lat != null && lng != null && isValidGpsCoordinate(lat, lng) && canApplyByTime) {
        applyGpsPoint(
          binding.vehicleId,
          binding.organizationId,
          lat,
          lng,
          data.speedKmh,
          data.source,
        );
        const merged = mergeGpsMeasuredAt(store, {
          measuredAt: data.measuredAt,
          lastSeenAt: data.lastSeenAt,
          receivedAt: data.receivedAt,
          source: data.source,
        });
        const displayTime = resolveTelemetryDisplayTime(merged);
        const canonical = resolveVehicleDetailTelemetryState(merged);
        store.patchIfBound(binding.vehicleId, binding.organizationId, {
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
    },
    [applyGpsPoint],
  );

  const fetchGps = useCallback(
    async (binding: TelemetryRequestBinding) => {
      if (!gatesRef.current.gpsHighFrequency) return null;

      const coordinator = coordinatorRef.current!;
      const result = await coordinator.run({
        channel: 'gps',
        binding,
        normalIntervalMs: VEHICLE_DETAIL_POLLING.GPS_MS,
        timeoutMs: VEHICLE_TELEMETRY_RETRY.GPS_FETCH_TIMEOUT_MS,
        execute: (signal) =>
          api.vehicles.liveGps(binding.organizationId, binding.vehicleId, { signal }),
      });

      if (result.aborted || result.stale) return result;

      if (result.ok && result.data) {
        clearAccessBlock();
        applyGpsData(binding, result.data);
        return result;
      }

      recordAccessBlockFromPolicy(result);
      return result;
    },
    [applyGpsData, clearAccessBlock, recordAccessBlockFromPolicy],
  );

  const fetchDashboard = useCallback(
    async (binding: TelemetryRequestBinding) => {
      if (!gatesRef.current.dashboardTelemetry) return null;

      const coordinator = coordinatorRef.current!;
      const result = await coordinator.run({
        channel: 'dashboard',
        binding,
        normalIntervalMs: gatesRef.current.dashboardIntervalMs,
        timeoutMs: VEHICLE_TELEMETRY_RETRY.DASHBOARD_FETCH_TIMEOUT_MS,
        execute: (signal) =>
          api.vehicles.telemetry(binding.organizationId, binding.vehicleId, { signal }),
      });

      if (result.aborted || result.stale) return result;

      if (result.ok && result.data) {
        clearAccessBlock();
        applyDashboardData(binding, result.data as DashboardTelemetryData);
        return result;
      }

      surfaceDashboardFailure(binding, result);
      return result;
    },
    [applyDashboardData, clearAccessBlock, surfaceDashboardFailure],
  );

  useEffect(() => {
    const coordinator = coordinatorRef.current!;

    if (!vehicleId || !orgId) {
      lastTargetRef.current = null;
      locationHistoryRef.current = [];
      liveRef.current = false;
      setTrackingLive(false);
      clearTimers();
      coordinator.reset();
      useVehicleLiveMapStore.getState().unbind();
      useVehicleDetailPollingStore.getState().setTelemetryAccessBlock(null);
      return;
    }

    lastTargetRef.current = null;
    locationHistoryRef.current = [];
    liveRef.current = false;
    setTrackingLive(false);
    clearTimers();
    coordinator.bind(orgId, vehicleId);
    useVehicleDetailPollingStore.getState().setTelemetryAccessBlock(null);
    useVehicleLiveMapStore.getState().bindToVehicle(vehicleId, orgId);

    return () => {
      coordinator.reset();
    };
  }, [vehicleId, orgId, clearTimers]);

  useEffect(() => {
    if (!vehicleId || !orgId || !gates.dashboardTelemetry) {
      dashLoopIdRef.current += 1;
      coordinatorRef.current?.abortChannel('dashboard');
      if (dashTimerRef.current) {
        clearTimeout(dashTimerRef.current);
        dashTimerRef.current = null;
      }
      return;
    }

    const coordinator = coordinatorRef.current!;
    const loopId = dashLoopIdRef.current + 1;
    dashLoopIdRef.current = loopId;

    const runDashboardLoop = async () => {
      if (loopId !== dashLoopIdRef.current) return;

      const binding = coordinator.snapshotBinding();
      if (!binding.vehicleId || !binding.organizationId) return;

      const result = await fetchDashboard(binding);
      if (loopId !== dashLoopIdRef.current || !gatesRef.current.dashboardTelemetry) return;

      const delay =
        result && !result.ok && !result.aborted && !result.stale
          ? result.nextDelayMs
          : gatesRef.current.dashboardIntervalMs;

      dashTimerRef.current = setTimeout(() => {
        void runDashboardLoop();
      }, delay);
    };

    void runDashboardLoop();

    return () => {
      dashLoopIdRef.current += 1;
      coordinator.abortChannel('dashboard');
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
      coordinatorRef.current?.abortChannel('gps');
      if (gpsTimerRef.current) {
        clearTimeout(gpsTimerRef.current);
        gpsTimerRef.current = null;
      }
      return;
    }
    if (gpsTimerRef.current) return;

    const coordinator = coordinatorRef.current!;
    const gpsLoopId = gpsLoopIdRef.current + 1;
    gpsLoopIdRef.current = gpsLoopId;

    const runGps = async () => {
      if (gpsLoopId !== gpsLoopIdRef.current || !liveRef.current) return;

      const binding = coordinator.snapshotBinding();
      if (!binding.vehicleId || !binding.organizationId) return;

      const result = await fetchGps(binding);
      if (gpsLoopId !== gpsLoopIdRef.current) return;

      const delay =
        result && !result.ok && !result.aborted && !result.stale
          ? result.nextDelayMs
          : VEHICLE_DETAIL_POLLING.GPS_MS;

      gpsTimerRef.current = setTimeout(() => {
        void runGps();
      }, delay);
    };

    void runGps();

    return () => {
      gpsLoopIdRef.current += 1;
      coordinator.abortChannel('gps');
      if (gpsTimerRef.current) {
        clearTimeout(gpsTimerRef.current);
        gpsTimerRef.current = null;
      }
    };
  }, [vehicleId, orgId, gates.gpsHighFrequency, trackingLive, fetchGps]);

  useEffect(() => {
    return () => {
      clearTimers();
      coordinatorRef.current?.reset();
    };
  }, [clearTimers]);
}

export { VEHICLE_DETAIL_POLLING };
