/**
 * Shared DIMO VLS rawPayloadJson signal readers (profile + composer).
 */
import {
  classifyTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
} from '../../vehicles/vehicle-state-interpreter';

type RawSignalNode = { timestamp?: string | number | null; value?: unknown };

const FUTURE_TIMESTAMP_TOLERANCE_MS = 60_000;

export function readRawScalarSignal(
  raw: unknown,
  signalName: string,
): { keyPresent: boolean; value: number | null; sourceMs: number | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { keyPresent: false, value: null, sourceMs: null };
  }
  const root = raw as Record<string, unknown>;
  const node = root[signalName] as RawSignalNode | undefined;
  if (node == null) {
    return { keyPresent: false, value: null, sourceMs: null };
  }
  const valueRaw = node.value;
  const value =
    typeof valueRaw === 'number' && Number.isFinite(valueRaw) ? valueRaw : null;
  let sourceMs: number | null = null;
  if (node.timestamp != null) {
    const ms =
      typeof node.timestamp === 'number'
        ? node.timestamp
        : Date.parse(String(node.timestamp));
    sourceMs = Number.isFinite(ms) ? ms : null;
  }
  return { keyPresent: true, value, sourceMs };
}

export function readRawLocationCoordinates(raw: unknown): {
  keyPresent: boolean;
  latitude: number | null;
  longitude: number | null;
  sourceMs: number | null;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { keyPresent: false, latitude: null, longitude: null, sourceMs: null };
  }
  const node = (raw as Record<string, unknown>).currentLocationCoordinates as
    | RawSignalNode
    | undefined;
  if (node == null) {
    return { keyPresent: false, latitude: null, longitude: null, sourceMs: null };
  }
  const value = node.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { keyPresent: true, latitude: null, longitude: null, sourceMs: parseRawTimestamp(node.timestamp) };
  }
  const lat = (value as { latitude?: unknown }).latitude;
  const lon = (value as { longitude?: unknown }).longitude;
  const latitude =
    typeof lat === 'number' && Number.isFinite(lat) ? lat : null;
  const longitude =
    typeof lon === 'number' && Number.isFinite(lon) ? lon : null;
  return {
    keyPresent: true,
    latitude,
    longitude,
    sourceMs: parseRawTimestamp(node.timestamp),
  };
}

export function readRawDtcList(raw: unknown): {
  keyPresent: boolean;
  hasCodes: boolean;
  sourceMs: number | null;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { keyPresent: false, hasCodes: false, sourceMs: null };
  }
  const node = (raw as Record<string, unknown>).obdDTCList as RawSignalNode | undefined;
  if (node == null) {
    return { keyPresent: false, hasCodes: false, sourceMs: null };
  }
  const value = node.value;
  const hasCodes = Array.isArray(value) && value.length > 0;
  return { keyPresent: true, hasCodes, sourceMs: parseRawTimestamp(node.timestamp) };
}

function parseRawTimestamp(ts: string | number | null | undefined): number | null {
  if (ts == null) return null;
  const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
  return Number.isFinite(ms) ? ms : null;
}

export function resolveSignalTimestampEvidence(input: {
  signalSourceMs: number | null;
  projectionAsOfMs: number;
}): {
  source: Date | null;
  observed: Date | null;
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  limitations: string[];
} {
  const { signalSourceMs, projectionAsOfMs } = input;
  if (signalSourceMs == null) {
    return { source: null, observed: null, freshness: 'UNKNOWN', limitations: [] };
  }
  if (signalSourceMs > projectionAsOfMs + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    return {
      source: null,
      observed: null,
      freshness: 'UNKNOWN',
      limitations: ['FUTURE_SIGNAL_TIMESTAMP_REJECTED'],
    };
  }
  const at = new Date(signalSourceMs);
  const freshnessClass = classifyTelemetryFreshness(at, projectionAsOfMs);
  const freshness =
    freshnessClass === 'live' || freshnessClass === 'standby'
      ? 'FRESH'
      : freshnessClass === 'signal_delayed' || freshnessClass === 'offline'
        ? 'STALE'
        : 'UNKNOWN';
  if (freshness === 'UNKNOWN') {
    return {
      source: at,
      observed: at,
      freshness: 'UNKNOWN',
      limitations: [`FRESHNESS_RULE=classifyTelemetryFreshness;LIVE_THRESHOLD_MS=${TELEMETRY_FRESH_THRESHOLD_MS}`],
    };
  }
  return { source: at, observed: at, freshness, limitations: [] };
}
