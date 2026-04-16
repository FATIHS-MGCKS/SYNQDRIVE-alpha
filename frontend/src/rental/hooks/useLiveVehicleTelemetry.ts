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

  const applyGpsPoint = useCallback(
    (lat: number, lng: number, speed: number | null, source: 'dimo' | 'cache') => {
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

      useVehicleLiveMapStore.setState((state) => ({
        locationHistory: nextHistory,
        lastConfirmedPosition: newPos,
        lastLocationAt: Date.now(),
        gpsSource: source,
        speedKmh: speed ?? state.speedKmh,
        targetPosition: meaningful ? newPos : state.targetPosition,
        heading: heading ?? state.heading,
        isMoving,
      }));
    },
    [],
  );

  // ── GPS cycle: direct DIMO via /live-gps ────────────────────────────
  const fetchGps = useCallback(async () => {
    if (!vehicleId || !orgId) return;
    try {
      const data = await api.vehicles.liveGps(orgId, vehicleId);
      const lat = data.latitude;
      const lng = data.longitude;
      if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        applyGpsPoint(lat, lng, data.speedKmh, data.source);
      }
    } catch {
      // Keep previous position on error.
    }
  }, [vehicleId, orgId, applyGpsPoint]);

  // ── Dashboard cycle: full telemetry from DB ─────────────────────────
  const fetchDashboard = useCallback(async () => {
    if (!vehicleId || !orgId) return;
    try {
      const data = (await api.vehicles.telemetry(orgId, vehicleId)) as {
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
        // `battery` is generic EV energy state-of-charge (%), not health.
        battery: typeof data.battery === 'number' ? data.battery : 0,
        lvBatteryVoltage: typeof data.lvBatteryVoltage === 'number' ? data.lvBatteryVoltage : 0,
        odometer: typeof data.odometer === 'number' ? data.odometer : 0,
        engineLoad,
        ignitionOn,
      };
      liveRef.current = backendLive;
      useVehicleLiveMapStore.setState((state) => ({
        snapshot: snap,
        isLiveTracking: backendLive,
        loading: false,
        error: null,
        lastSignal: data.lastSignal ?? state.lastSignal,
        signalAgeMs:
          typeof data.signalAgeMs === 'number'
            ? data.signalAgeMs
            : state.signalAgeMs,
        isFresh: typeof data.isFresh === 'boolean' ? data.isFresh : state.isFresh,
        onlineStatus,
        displayState,
        displayIgnition,
        displaySpeed: data.displaySpeed ?? null,
        displayCoolant: data.displayCoolant ?? null,
        displayEngineLoad: data.displayEngineLoad ?? null,
        tripDetectionState: data.tripDetectionState ?? null,
      }));

      // When NOT live tracking, also use dashboard GPS (no separate GPS cycle)
      if (!backendLive) {
        const lat = data.latitude;
        const lng = data.longitude;
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          applyGpsPoint(lat, lng, speed, 'cache');
        }
      }
    } catch (error) {
      useVehicleLiveMapStore.setState({
        loading: false,
        error:
          error instanceof Error ? error.message : 'Failed to refresh live telemetry',
      });
    }
  }, [vehicleId, orgId, applyGpsPoint]);

  // ── Lifecycle: manage both poll loops ───────────────────────────────
  useEffect(() => {
    if (!vehicleId || !orgId) {
      useVehicleLiveMapStore.getState().reset();
      lastTargetRef.current = null;
      locationHistoryRef.current = [];
      liveRef.current = false;
      return;
    }

    cancelledRef.current = false;
    useVehicleLiveMapStore.setState({ loading: true, error: null });

    // Dashboard loop (always 30s)
    const scheduleDash = () => {
      if (cancelledRef.current) return;
      dashTimerRef.current = setTimeout(async () => {
        if (cancelledRef.current) return;
        await fetchDashboard();
        scheduleDash();
      }, DASHBOARD_POLL_MS);
    };

    // GPS loop (5s, only when live)
    const scheduleGps = () => {
      if (cancelledRef.current) return;
      gpsTimerRef.current = setTimeout(async () => {
        if (cancelledRef.current) return;
        if (liveRef.current) {
          await fetchGps();
        }
        scheduleGps();
      }, GPS_POLL_MS);
    };

    // Initial fetch: dashboard first (sets isLiveTracking), then GPS
    fetchDashboard().then(() => {
      if (cancelledRef.current) return;
      scheduleDash();
      // If live tracking detected, kick off first GPS immediately
      if (liveRef.current) {
        fetchGps().then(() => {
          if (!cancelledRef.current) scheduleGps();
        });
      } else {
        scheduleGps();
      }
    });

    return () => {
      cancelledRef.current = true;
      if (gpsTimerRef.current) { clearTimeout(gpsTimerRef.current); gpsTimerRef.current = null; }
      if (dashTimerRef.current) { clearTimeout(dashTimerRef.current); dashTimerRef.current = null; }
    };
  }, [vehicleId, orgId, fetchDashboard, fetchGps]);
}
