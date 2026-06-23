import { TripDetectionState } from '@prisma/client';

const FRESH_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const STANDBY_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
// Signal-delayed ("soft offline") window: 24h .. 48h. Real OFFLINE only beyond.
const SIGNAL_DELAYED_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

export type OnlineStatus = 'ONLINE' | 'STANDBY' | 'OFFLINE';
export type DisplayState = 'MOVING' | 'IDLE' | 'PARKED';
export type DisplayIgnition = 'ON' | 'OFF' | 'UNKNOWN';

/**
 * Canonical 5-state telemetry freshness. STANDBY is a normal telemetry state
 * (DIMO devices heartbeat ~1–4h in standby) and must never be treated as
 * stale/offline. SIGNAL_DELAYED is a soft-offline window (24–48h); real OFFLINE
 * only begins after 48h; NO_SIGNAL means a valid signal was never recorded.
 */
export type TelemetryFreshness =
  | 'live'
  | 'standby'
  | 'signal_delayed'
  | 'offline'
  | 'no_signal';

export function classifyTelemetryFreshness(
  lastSeenAt: Date | null,
  now: number = Date.now(),
): TelemetryFreshness {
  if (!lastSeenAt) return 'no_signal';
  const ageMs = now - lastSeenAt.getTime();
  if (ageMs < FRESH_THRESHOLD_MS) return 'live';
  if (ageMs < STANDBY_THRESHOLD_MS) return 'standby';
  if (ageMs < SIGNAL_DELAYED_THRESHOLD_MS) return 'signal_delayed';
  return 'offline';
}

export interface RawTelemetryInput {
  lastSeenAt: Date | null;
  speedKmh: number | null;
  isIgnitionOn: boolean | null;
  engineLoad: number | null;
  /** kW; DIMO + = into battery, − = out (motoring) */
  tractionBatteryPowerKw?: number | null;
  coolantTempC: number | null;
  odometerKm: number | null;
}

export interface TripStateInput {
  state: TripDetectionState;
}

export interface InterpretedVehicleState {
  lastSignal: string;
  signalAgeMs: number;
  isFresh: boolean;
  onlineStatus: OnlineStatus;
  /** Canonical 5-state freshness (additive; onlineStatus kept for compat). */
  telemetryFreshness: TelemetryFreshness;
  displayState: DisplayState;
  displayIgnition: DisplayIgnition;
  isLiveTracking: boolean;
  displaySpeed: number | null;
  displayCoolant: number | null;
  displayEngineLoad: number | null;
  tripDetectionState: string | null;
}

export function interpretVehicleState(
  raw: RawTelemetryInput,
  tripState: TripStateInput | null,
): InterpretedVehicleState {
  const now = Date.now();
  const lastSeenMs = raw.lastSeenAt ? raw.lastSeenAt.getTime() : 0;
  const signalAgeMs = raw.lastSeenAt
    ? now - lastSeenMs
    : Number.MAX_SAFE_INTEGER;
  const isFresh = signalAgeMs < FRESH_THRESHOLD_MS;
  const lastSignal = raw.lastSeenAt?.toISOString() ?? '';
  const telemetryFreshness = classifyTelemetryFreshness(raw.lastSeenAt, now);

  let onlineStatus: OnlineStatus;
  if (signalAgeMs < FRESH_THRESHOLD_MS) {
    onlineStatus = 'ONLINE';
  } else if (signalAgeMs < STANDBY_THRESHOLD_MS) {
    onlineStatus = 'STANDBY';
  } else {
    onlineStatus = 'OFFLINE';
  }

  const tripDetState = tripState?.state ?? null;

  if (!isFresh) {
    return {
      lastSignal,
      signalAgeMs: Math.min(signalAgeMs, Number.MAX_SAFE_INTEGER),
      isFresh: false,
      onlineStatus,
      telemetryFreshness,
      displayState: 'PARKED',
      displayIgnition: 'UNKNOWN',
      isLiveTracking: false,
      displaySpeed: null,
      displayCoolant: null,
      displayEngineLoad: null,
      tripDetectionState: tripDetState,
    };
  }

  const speed = raw.speedKmh ?? 0;
  const ignitionOn = raw.isIgnitionOn;
  const engineLoad = raw.engineLoad ?? 0;
  const battKw = raw.tractionBatteryPowerKw;
  const evElectricalActivity =
    battKw != null && !Number.isNaN(battKw) && Math.abs(battKw) >= 3;

  let displayIgnition: DisplayIgnition;
  if (ignitionOn === true) displayIgnition = 'ON';
  else if (ignitionOn === false) displayIgnition = 'OFF';
  else displayIgnition = 'UNKNOWN';

  let displayState: DisplayState;

  const isMovingBySpeed = speed > 3;
  const isMovingByTrip =
    tripDetState === TripDetectionState.ACTIVE_TRIP && speed > 0;

  if (isMovingBySpeed || isMovingByTrip) {
    displayState = 'MOVING';
  } else if (
    ignitionOn === true ||
    engineLoad > 0 ||
    evElectricalActivity ||
    tripDetState === TripDetectionState.IDLE_WITHIN_TRIP ||
    (tripDetState === TripDetectionState.ACTIVE_TRIP && speed === 0)
  ) {
    displayState = 'IDLE';
  } else {
    displayState = 'PARKED';
  }

  const isLiveTracking = displayState !== 'PARKED';

  return {
    lastSignal,
    signalAgeMs,
    isFresh,
    onlineStatus,
    telemetryFreshness,
    displayState,
    displayIgnition,
    isLiveTracking,
    displaySpeed: speed,
    displayCoolant: raw.coolantTempC,
    displayEngineLoad: raw.engineLoad,
    tripDetectionState: tripDetState,
  };
}
