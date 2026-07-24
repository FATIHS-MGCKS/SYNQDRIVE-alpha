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
  useVehicleLiveMapStore,
} from '../stores/useVehicleLiveMapStore';
import { recordVehicleDetailClientSignal } from '../lib/vehicle-detail-observability';

const GPS_POLL_MS = 5_000;
const DASHBOARD_POLL_MS = 30_000;
const BACKGROUND_DASHBOARD_POLL_MS = 120_000;
const MAX_HISTORY = 10;
const JITTER_THRESHOLD_M = 8;

export type LiveVehicleTelemetryOptions = {
  /** 5s live-gps polling — only needed on Overview (map). Telemetry badge uses 30s dashboard cycle. */
  enableGpsPolling?: boolean;
};

/**
 * Adaptive live-telemetry hook for the Vehicle Detail Overview tab.
 *
 * Two independent polling cycles:
 *  1. GPS cycle: every 5s → /live-gps (direct DIMO proxy, no DB)
 *     Only runs when `enableGpsPolling` is true and `isLiveTracking` is true.
 *  2. Dashboard cycle: every 30s → /telemetry (full snapshot from DB)
 *     Runs on all vehicle-detail tabs; stretches to 120s when the document is hidden.
 *
 * When not live tracking, GPS comes from the dashboard cycle (30s).
 *
 * Store updates are scoped to the active vehicleId/orgId binding so stale
 * responses from a previous vehicle cannot leak into the UI.
 */
export function useLiveVehicleTelemetry(
  vehicleId: string | null,
  orgId: string,
  options: LiveVehicleTelemetryOptions = {},
): void {
  const enableGpsPolling = options.enableGpsPolling ?? false;
  const lastTargetRef = useRef<[number, number] | null>(null);
  const locationHistoryRef = useRef<Array<[number, number]>>([]);
  const liveRef = useRef(false);
  const gpsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  const sessionVehicleIdRef = useRef<string | null>(null);
  const sessionOrgIdRef = useRef<string | null>(null);
  const enableGpsPollingRef = useRef(enableGpsPolling);

  enableGpsPollingRef.current = enableGpsPolling;

  const clearGpsTimer = useCallback(() => {
    if (gpsTimerRef.current) {
      clearTimeout(gpsTimerRef.current);
      gpsTimerRef.current = null;
    }
  }, []);

  const clearDashTimer = useCallback(() => {
    if (dashTimerRef.current) {
      clearTimeout(dashTimerRef.current);
      dashTimerRef.current = null;
    }
  }, []);

  const dashboardIntervalMs = useCallback(
    () => (pausedRef.current ? BACKGROUND_DASHBOARD_POLL_MS : DASHBOARD_POLL_MS),
    [],
  );

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
      if (!enableGpsPollingRef.current || pausedRef.current) return;
      try {
        const data = await api.vehicles.liveGps(boundOrgId, boundVehicleId);
        const store = useVehicleLiveMapStore.getState();
        if (store.boundVehicleId !== boundVehicleId || store.boundOrgId !== boundOrgId) {
          return;
        }
        const lat = data.latitude;
        const lng = data.longitude;
        if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          applyGpsPoint(boundVehicleId, boundOrgId, lat, lng, data.speedKmh, data.source);
        }
        recordVehicleDetailClientSignal('gps_poll_success', { source: data.source ?? 'unknown' });
      } catch {
        recordVehicleDetailClientSignal('gps_poll_error');
        // Keep previous position on GPS-only errors.
      }
    },
    [applyGpsPoint],
  );

  const fetchDashboard = useCallback(
    async (boundVehicleId: string, boundOrgId: string) => {
      if (pausedRef.current) return;
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

        const speed = typeof data.speed === 'number' ? data.speed : 0;
        const engineLoad = typeof data.engineLoad === 'number' ? data.engineLoad : 0;
        const rawIgnition = data.isIgnitionOn;
        const backendLive = data.isLiveTracking === true;
        const ignitionOn = rawIgnition === true || (rawIgnition == null && speed > 0);
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
            : deriveVehicleState(speed > 3, ignitionOn, engineLoad);
        const displayIgnition: DisplayIgnition =
          data.displayIgnition === 'ON' ||
          data.displayIgnition === 'OFF' ||
          data.displayIgnition === 'UNKNOWN'
            ? data.displayIgnition
            : 'UNKNOWN';

        const snap: LiveTelemetrySnapshot = {
          speed,
          fuel: typeof data.fuel === 'number' ? data.fuel : 0,
          coolant: typeof data.coolant === 'number' ? data.coolant : 0,
          battery: typeof data.battery === 'number' ? data.battery : 0,
          lvBatteryVoltage: typeof data.lvBatteryVoltage === 'number' ? data.lvBatteryVoltage : 0,
          odometer: typeof data.odometer === 'number' ? data.odometer : 0,
          engineLoad,
          ignitionOn,
        };
        liveRef.current = backendLive;

        store.patchIfBound(boundVehicleId, boundOrgId, {
          snapshot: snap,
          isLiveTracking: backendLive,
          loading: false,
          error: null,
          lastSignal: data.lastSignal ?? store.lastSignal,
          signalAgeMs:
            typeof data.signalAgeMs === 'number' ? data.signalAgeMs : store.signalAgeMs,
          isFresh: typeof data.isFresh === 'boolean' ? data.isFresh : store.isFresh,
          onlineStatus,
          displayState,
          displayIgnition,
          displaySpeed: data.displaySpeed ?? null,
          displayCoolant: data.displayCoolant ?? null,
          displayEngineLoad: data.displayEngineLoad ?? null,
          tripDetectionState: data.tripDetectionState ?? null,
        });

        if (!backendLive) {
          const lat = data.latitude;
          const lng = data.longitude;
          if (
            lat != null &&
            lng != null &&
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
          ) {
            applyGpsPoint(boundVehicleId, boundOrgId, lat, lng, speed, 'cache');
          }
        }
        recordVehicleDetailClientSignal('telemetry_poll_success');
      } catch (error) {
        const store = useVehicleLiveMapStore.getState();
        if (store.boundVehicleId !== boundVehicleId || store.boundOrgId !== boundOrgId) {
          return;
        }
        recordVehicleDetailClientSignal('telemetry_poll_error');
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
      pausedRef.current = false;
      useVehicleLiveMapStore.getState().unbind();
      recordVehicleDetailClientSignal('polling_unbound');
      return;
    }

    cancelledRef.current = false;
    pausedRef.current = typeof document !== 'undefined' ? document.hidden : false;
    sessionVehicleIdRef.current = vehicleId;
    sessionOrgIdRef.current = orgId;
    lastTargetRef.current = null;
    locationHistoryRef.current = [];
    liveRef.current = false;
    useVehicleLiveMapStore.getState().bindToVehicle(vehicleId, orgId);
    recordVehicleDetailClientSignal('polling_bound');

    const scheduleDash = () => {
      if (cancelledRef.current) return;
      clearDashTimer();
      dashTimerRef.current = setTimeout(async () => {
        if (cancelledRef.current) return;
        const vid = sessionVehicleIdRef.current;
        const oid = sessionOrgIdRef.current;
        if (!vid || !oid) return;
        await fetchDashboard(vid, oid);
        scheduleDash();
      }, dashboardIntervalMs());
    };

    const scheduleGps = () => {
      if (cancelledRef.current || !enableGpsPollingRef.current) return;
      clearGpsTimer();
      gpsTimerRef.current = setTimeout(async () => {
        if (cancelledRef.current || !enableGpsPollingRef.current) return;
        const vid = sessionVehicleIdRef.current;
        const oid = sessionOrgIdRef.current;
        if (!vid || !oid) return;
        if (liveRef.current) {
          await fetchGps(vid, oid);
        }
        scheduleGps();
      }, GPS_POLL_MS);
    };

    const kickGpsCycle = () => {
      if (!enableGpsPollingRef.current || pausedRef.current) {
        clearGpsTimer();
        return;
      }
      if (liveRef.current) {
        void fetchGps(vehicleId, orgId).then(() => {
          if (!cancelledRef.current) scheduleGps();
        });
      } else {
        scheduleGps();
      }
    };

    const onVisibilityChange = () => {
      if (cancelledRef.current) return;
      const hidden = document.hidden;
      if (hidden === pausedRef.current) return;
      pausedRef.current = hidden;
      if (hidden) {
        clearGpsTimer();
        clearDashTimer();
        recordVehicleDetailClientSignal('polling_paused');
        return;
      }
      recordVehicleDetailClientSignal('polling_resumed');
      const vid = sessionVehicleIdRef.current;
      const oid = sessionOrgIdRef.current;
      if (!vid || !oid) return;
      void fetchDashboard(vid, oid).then(() => {
        if (!cancelledRef.current) {
          scheduleDash();
          kickGpsCycle();
        }
      });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    void fetchDashboard(vehicleId, orgId).then(() => {
      if (cancelledRef.current) return;
      scheduleDash();
      kickGpsCycle();
    });

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      recordVehicleDetailClientSignal('telemetry_poll_aborted');
      recordVehicleDetailClientSignal('gps_poll_aborted');
      clearGpsTimer();
      clearDashTimer();
    };
  }, [
    vehicleId,
    orgId,
    fetchDashboard,
    fetchGps,
    clearGpsTimer,
    clearDashTimer,
    dashboardIntervalMs,
  ]);

  useEffect(() => {
    if (!vehicleId || !orgId || cancelledRef.current) return;
    if (!enableGpsPolling) {
      clearGpsTimer();
      return;
    }
    if (liveRef.current && !pausedRef.current) {
      void fetchGps(vehicleId, orgId);
      if (!gpsTimerRef.current) {
        const scheduleGps = () => {
          if (cancelledRef.current || !enableGpsPollingRef.current) return;
          clearGpsTimer();
          gpsTimerRef.current = setTimeout(async () => {
            if (cancelledRef.current || !enableGpsPollingRef.current) return;
            const vid = sessionVehicleIdRef.current;
            const oid = sessionOrgIdRef.current;
            if (!vid || !oid) return;
            if (liveRef.current) {
              await fetchGps(vid, oid);
            }
            scheduleGps();
          }, GPS_POLL_MS);
        };
        scheduleGps();
      }
    }
  }, [enableGpsPolling, vehicleId, orgId, fetchGps, clearGpsTimer]);
}
