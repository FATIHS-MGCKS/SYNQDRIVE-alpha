import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import {
  isMeaningfulMovement,
  stableHeadingDeg,
  deriveVehicleState,
  type VehicleStateLabel,
  type DisplayIgnition,
  type OnlineStatus,
} from '../../lib/liveMapUtils';

const GPS_POLL_MS = 5_000;
const DASHBOARD_POLL_MS = 30_000;
const MAX_HISTORY = 10;
const JITTER_THRESHOLD_M = 8;

export interface LiveTelemetrySnapshot {
  speed: number;
  fuel: number;
  coolant: number;
  battery: number;
  lvBatteryVoltage: number;
  odometer: number;
  engineLoad?: number;
  ignitionOn?: boolean;
}

export interface LiveMapTelemetryState {
  targetPosition: [number, number] | null;
  locationHistory: Array<[number, number]>;
  heading: number | null;
  speedKmh: number | null;
  vehicleState: VehicleStateLabel;
  isMoving: boolean;
  snapshot: LiveTelemetrySnapshot | null;
  lastLocationAt: number | null;
  isLiveTracking: boolean;
  lastSignal: string;
  signalAgeMs: number;
  isFresh: boolean;
  onlineStatus: OnlineStatus;
  displayState: VehicleStateLabel;
  displayIgnition: DisplayIgnition;
  displaySpeed: number | null;
  displayCoolant: number | null;
  displayEngineLoad: number | null;
  tripDetectionState: string | null;
  gpsSource: 'dimo' | 'cache' | null;
}

function getDefaultSnapshot(): LiveTelemetrySnapshot {
  return {
    speed: 0,
    fuel: 0,
    coolant: 0,
    battery: 0,
    lvBatteryVoltage: 0,
    odometer: 0,
    engineLoad: 0,
    ignitionOn: false,
  };
}

/**
 * Adaptive live-telemetry hook for the Vehicle Detail Overview tab.
 *
 * Two independent polling cycles:
 *  1. GPS cycle: every 5s → /live-gps (direct DIMO proxy, no DB)
 *     Only runs when isLiveTracking is true.
 *  2. Dashboard cycle: every 30s → /telemetry (full snapshot from DB)
 *     Always runs to keep fuel, battery, ignition, etc. current.
 *
 * When not live tracking, GPS comes from the dashboard cycle (30s).
 */
export function useLiveVehicleTelemetry(
  vehicleId: string | null,
  orgId: string,
): LiveMapTelemetryState {
  const [targetPosition, setTargetPosition] = useState<[number, number] | null>(null);
  const [locationHistory, setLocationHistory] = useState<Array<[number, number]>>([]);
  const [heading, setHeading] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [vehicleState, setVehicleState] = useState<VehicleStateLabel>('PARKED');
  const [isMoving, setIsMoving] = useState(false);
  const [snapshot, setSnapshot] = useState<LiveTelemetrySnapshot | null>(null);
  const [lastLocationAt, setLastLocationAt] = useState<number | null>(null);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [gpsSource, setGpsSource] = useState<'dimo' | 'cache' | null>(null);

  const [lastSignal, setLastSignal] = useState('');
  const [signalAgeMs, setSignalAgeMs] = useState(0);
  const [isFresh, setIsFresh] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>('OFFLINE');
  const [displayState, setDisplayState] = useState<VehicleStateLabel>('PARKED');
  const [displayIgnition, setDisplayIgnition] = useState<DisplayIgnition>('UNKNOWN');
  const [displaySpeed, setDisplaySpeed] = useState<number | null>(null);
  const [displayCoolant, setDisplayCoolant] = useState<number | null>(null);
  const [displayEngineLoad, setDisplayEngineLoad] = useState<number | null>(null);
  const [tripDetectionState, setTripDetectionState] = useState<string | null>(null);

  const lastTargetRef = useRef<[number, number] | null>(null);
  const snapshotRef = useRef<LiveTelemetrySnapshot>(getDefaultSnapshot());
  const liveRef = useRef(false);
  const gpsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const applyGpsPoint = useCallback((lat: number, lng: number, speed: number | null, source: 'dimo' | 'cache') => {
    const newPos: [number, number] = [lng, lat];
    setLastLocationAt(Date.now());
    setGpsSource(source);
    if (speed != null) setSpeedKmh(speed);

    setLocationHistory((prev) => {
      const next = [...prev, newPos].slice(-MAX_HISTORY);
      const prevPos = lastTargetRef.current ?? (next.length >= 2 ? next[next.length - 2] : null);
      const meaningful = prevPos ? isMeaningfulMovement(prevPos, newPos, JITTER_THRESHOLD_M) : true;
      if (meaningful) {
        lastTargetRef.current = newPos;
        setTargetPosition(newPos);
        const h = stableHeadingDeg(next);
        if (h != null) setHeading(h);
      }
      return next;
    });
  }, []);

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
      // Keep previous position on error
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
      snapshotRef.current = snap;
      liveRef.current = backendLive;
      setSnapshot(snap);
      setIsLiveTracking(backendLive);

      if (data.lastSignal != null) setLastSignal(data.lastSignal);
      if (typeof data.signalAgeMs === 'number') setSignalAgeMs(data.signalAgeMs);
      if (typeof data.isFresh === 'boolean') setIsFresh(data.isFresh);
      if (data.onlineStatus) setOnlineStatus(data.onlineStatus);
      if (data.displayState) {
        setDisplayState(data.displayState);
        setVehicleState(data.displayState);
      }
      if (data.displayIgnition) setDisplayIgnition(data.displayIgnition);
      setDisplaySpeed(data.displaySpeed ?? null);
      setDisplayCoolant(data.displayCoolant ?? null);
      setDisplayEngineLoad(data.displayEngineLoad ?? null);
      setTripDetectionState(data.tripDetectionState ?? null);

      // When NOT live tracking, also use dashboard GPS (no separate GPS cycle)
      if (!backendLive) {
        const lat = data.latitude;
        const lng = data.longitude;
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          applyGpsPoint(lat, lng, speed, 'cache');
        }
      }
    } catch {
      // Keep previous state on error
    }
  }, [vehicleId, orgId, applyGpsPoint]);

  // ── Lifecycle: manage both poll loops ───────────────────────────────
  useEffect(() => {
    if (!vehicleId || !orgId) {
      setTargetPosition(null);
      setLocationHistory([]);
      setHeading(null);
      setSpeedKmh(null);
      setVehicleState('PARKED');
      setIsMoving(false);
      setIsLiveTracking(false);
      setIsFresh(false);
      setOnlineStatus('OFFLINE');
      setDisplayState('PARKED');
      setDisplayIgnition('UNKNOWN');
      setGpsSource(null);
      lastTargetRef.current = null;
      liveRef.current = false;
      return;
    }

    cancelledRef.current = false;

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

  // Derive isMoving from location history
  useEffect(() => {
    if (locationHistory.length < 2) { setIsMoving(false); return; }
    const a = locationHistory[locationHistory.length - 2];
    const b = locationHistory[locationHistory.length - 1];
    setIsMoving(isMeaningfulMovement(a, b, JITTER_THRESHOLD_M));
  }, [locationHistory]);

  // Fallback local state derivation
  useEffect(() => {
    const snap = snapshotRef.current;
    const ignitionOn = snap?.ignitionOn ?? false;
    const engineLoad = snap?.engineLoad ?? 0;
    const localState = deriveVehicleState(isMoving, ignitionOn, engineLoad);
    setVehicleState((prev) => prev || localState);
  }, [isMoving, snapshot]);

  return {
    targetPosition,
    locationHistory,
    heading,
    speedKmh,
    vehicleState,
    isMoving,
    snapshot,
    lastLocationAt,
    isLiveTracking,
    lastSignal,
    signalAgeMs,
    isFresh,
    onlineStatus,
    displayState,
    displayIgnition,
    displaySpeed,
    displayCoolant,
    displayEngineLoad,
    tripDetectionState,
    gpsSource,
  };
}
