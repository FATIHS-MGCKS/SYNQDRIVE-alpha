/**
 * Central telemetry freshness logic — the single source of truth for how
 * "fresh" a vehicle's last signal/snapshot is across the whole rental UI
 * (Dashboard Fleet State Board, Fleet Page / Fleet Command, booking picker,
 * connectivity summaries).
 *
 * Product rule (final):
 *   • LIVE            signal younger than 15 minutes
 *   • STANDBY         15 minutes .. 24 hours  → NORMAL telemetry, not a warning
 *   • SIGNAL_DELAYED  24 hours .. 48 hours     → soft offline, low priority
 *   • OFFLINE         older than 48 hours      → real connectivity problem
 *   • NO_SIGNAL       never reported a valid signal / snapshot
 *
 * Key principle: **Health severity ≠ data freshness** and, just as important,
 * **STANDBY ≠ stale ≠ offline**. DIMO devices heartbeat roughly every 1–4h in
 * standby with no fixed cadence, so a vehicle that has been quiet for 2–4h is
 * perfectly normal and must never be downgraded, warned, or pulled into the
 * Attention / Offline buckets.
 */

export type TelemetryFreshness =
  | 'live'
  | 'standby'
  | 'signal_delayed'
  | 'offline'
  | 'no_signal';

export const TELEMETRY_LIVE_MAX_MS = 15 * 60 * 1000; // 15 min
export const TELEMETRY_STANDBY_MAX_MS = 24 * 60 * 60 * 1000; // 24 h
export const TELEMETRY_DELAYED_MAX_MS = 48 * 60 * 60 * 1000; // 48 h

/** Minimal structural input — avoids coupling to the full VehicleData shape. */
export interface TelemetryFreshnessInput {
  signalAgeMs?: number | null;
  lastSignal?: string | null;
  providerObservedAt?: string | null;
  lastValidTelemetryAt?: string | null;
  receivedAt?: string | null;
  latestStateUpdatedAt?: string | null;
  /** Backend 3-state hint (ONLINE/STANDBY/OFFLINE), used only as a fallback. */
  onlineStatus?: string | null;
}

export const DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS = 15 * 60 * 1000;

export interface TelemetryFreshnessState {
  freshness: TelemetryFreshness;
  signalAgeMs: number | null;
  label: string;
  shortLabel: string;
  isLive: boolean;
  isStandby: boolean;
  isSignalDelayed: boolean;
  isOffline: boolean;
  isNoSignal: boolean;
  /**
   * True only for genuine connectivity problems (offline / no signal). STANDBY
   * and SIGNAL_DELAYED are shown calmly and never set this flag.
   */
  shouldWarnUser: boolean;
}

export function parseTelemetryTimestampMs(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms;
}

/**
 * Canonical observation instant for freshness — mirrors backend resolver priority.
 */
export function resolveCanonicalTelemetryObservedAtMs(
  input: TelemetryFreshnessInput,
  maxBackfillLagMs: number = DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS,
): number | null {
  const providerObserved = parseTelemetryTimestampMs(input.providerObservedAt);
  if (providerObserved != null) return providerObserved;

  const lastValid = parseTelemetryTimestampMs(input.lastValidTelemetryAt);
  if (lastValid != null) return lastValid;

  const received = parseTelemetryTimestampMs(input.receivedAt);
  const lastSignal = parseTelemetryTimestampMs(input.lastSignal);
  const stateUpdated = parseTelemetryTimestampMs(input.latestStateUpdatedAt);

  const staleObserved = lastSignal ?? stateUpdated;
  if (
    received != null &&
    staleObserved != null &&
    received - staleObserved > maxBackfillLagMs
  ) {
    if (lastSignal != null) return lastSignal;
    if (stateUpdated != null) return stateUpdated;
  }

  if (lastSignal != null) return lastSignal;
  if (stateUpdated != null) return stateUpdated;

  return null;
}

export function telemetrySignalAgeMs(
  v: TelemetryFreshnessInput,
  now: number = Date.now(),
): number | null {
  const observedMs = resolveCanonicalTelemetryObservedAtMs(v);
  if (observedMs != null) {
    return Math.max(0, now - observedMs);
  }
  if (
    typeof v.signalAgeMs === 'number' &&
    Number.isFinite(v.signalAgeMs) &&
    v.signalAgeMs < Number.MAX_SAFE_INTEGER
  ) {
    return Math.max(0, v.signalAgeMs);
  }
  return null;
}

export function classifyTelemetryFreshness(ageMs: number | null): TelemetryFreshness {
  if (ageMs == null) return 'no_signal';
  if (ageMs < TELEMETRY_LIVE_MAX_MS) return 'live';
  if (ageMs < TELEMETRY_STANDBY_MAX_MS) return 'standby';
  if (ageMs < TELEMETRY_DELAYED_MAX_MS) return 'signal_delayed';
  return 'offline';
}

function formatAge(ageMs: number | null, de: boolean): string | null {
  if (ageMs == null) return null;
  const min = Math.round(ageMs / 60_000);
  if (min < 2) return de ? 'gerade eben' : 'just now';
  if (min < 60) return de ? `vor ${min} Min.` : `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return de ? `vor ${h} Std.` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return de ? `vor ${d} Tag(en)` : `${d}d ago`;
}

function buildLabels(
  freshness: TelemetryFreshness,
  ageMs: number | null,
  de: boolean,
): { label: string; shortLabel: string } {
  const age = formatAge(ageMs, de);
  switch (freshness) {
    case 'live':
      return { label: age ? `Live · ${age}` : 'Live', shortLabel: 'Live' };
    case 'standby':
      return {
        label: age ? (de ? `Standby · ${age}` : `Standby · ${age}`) : 'Standby',
        shortLabel: 'Standby',
      };
    case 'signal_delayed':
      return {
        label: age
          ? de
            ? `Signal verzögert · ${age}`
            : `Signal delayed · ${age}`
          : de
            ? 'Signal verzögert'
            : 'Signal delayed',
        shortLabel: de ? 'Verzögert' : 'Delayed',
      };
    case 'offline':
      return {
        label: age ? (de ? `Offline · ${age}` : `Offline · ${age}`) : 'Offline',
        shortLabel: 'Offline',
      };
    case 'no_signal':
    default:
      return {
        label: de ? 'Kein Signal · Setup prüfen' : 'No signal · Setup check',
        shortLabel: de ? 'Kein Signal' : 'No signal',
      };
  }
}

export interface ResolveTelemetryFreshnessOptions {
  now?: number;
  locale?: string;
}

/**
 * Resolve the canonical telemetry freshness for a vehicle. Age-based: classifies
 * from the actual signal age. When no usable timestamp exists it falls back to
 * `no_signal` (a never-reported device), regardless of the backend 3-state
 * `onlineStatus`, so standby vehicles are never misread as offline.
 */
export function resolveTelemetryFreshness(
  v: TelemetryFreshnessInput,
  options: ResolveTelemetryFreshnessOptions = {},
): TelemetryFreshnessState {
  const now = options.now ?? Date.now();
  const de = options.locale === 'de';
  const ageMs = telemetrySignalAgeMs(v, now);
  const freshness = classifyTelemetryFreshness(ageMs);
  const { label, shortLabel } = buildLabels(freshness, ageMs, de);

  return {
    freshness,
    signalAgeMs: ageMs,
    label,
    shortLabel,
    isLive: freshness === 'live',
    isStandby: freshness === 'standby',
    isSignalDelayed: freshness === 'signal_delayed',
    isOffline: freshness === 'offline',
    isNoSignal: freshness === 'no_signal',
    shouldWarnUser: freshness === 'offline' || freshness === 'no_signal',
  };
}
