/**
 * Canonical telemetry timestamp + freshness resolution for all connectivity consumers.
 *
 * Timestamp priority (first usable wins):
 * 1. Provider observedAt (sourceTimestamp)
 * 2. Last valid telemetry at
 * 3. receivedAt — never when it only reflects backfill ingest lag
 * 4. lastSignal (DimoVehicle)
 * 5. latestState updatedAt / lastSeenAt — lowest trust (may be DB touch)
 *
 * Freshness classification delegates to {@link classifyTelemetryFreshness}.
 */
import {
  classifyTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
  type TelemetryFreshness,
} from './vehicle-state-interpreter';

export {
  classifyTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  type TelemetryFreshness,
};

/** Aligns with device-connection backfill guard — ingest must not rejuvenate freshness. */
export const DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS = 15 * 60 * 1000;

export interface TelemetryTimestampEvidence {
  providerObservedAt?: Date | string | null;
  lastValidTelemetryAt?: Date | string | null;
  receivedAt?: Date | string | null;
  lastSignal?: Date | string | null;
  latestStateUpdatedAt?: Date | string | null;
  maxBackfillLagMs?: number;
}

export interface ResolvedTelemetryFreshness {
  freshness: TelemetryFreshness;
  observedAtMs: number | null;
  ageMs: number | null;
  observedAtIso: string | null;
}

export function parseTelemetryTimestampMs(
  value: Date | string | number | null | undefined,
): number | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    return normalizeEpochMs(value);
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return normalizeEpochMs(numeric);
  }

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms;
}

/** Accept unix seconds or milliseconds; reject invalid epochs. */
function normalizeEpochMs(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  // Values below ~2001-09-09 in ms are treated as unix seconds.
  if (value < 1_000_000_000_000) {
    return value * 1000;
  }
  return value;
}

/**
 * Resolve the canonical telemetry observation instant used for freshness.
 * Ingest/received timestamps never override a known older provider observation.
 */
export function resolveCanonicalTelemetryObservedAtMs(
  evidence: TelemetryTimestampEvidence,
): number | null {
  const maxLag =
    evidence.maxBackfillLagMs ?? DEFAULT_TELEMETRY_BACKFILL_MAX_LAG_MS;

  const providerObserved = parseTelemetryTimestampMs(evidence.providerObservedAt);
  if (providerObserved != null) return providerObserved;

  const lastValid = parseTelemetryTimestampMs(evidence.lastValidTelemetryAt);
  if (lastValid != null) return lastValid;

  const received = parseTelemetryTimestampMs(evidence.receivedAt);
  const lastSignal = parseTelemetryTimestampMs(evidence.lastSignal);
  const stateUpdated = parseTelemetryTimestampMs(evidence.latestStateUpdatedAt);

  const staleObserved = lastSignal ?? stateUpdated;
  if (
    received != null &&
    staleObserved != null &&
    received - staleObserved > maxLag
  ) {
    if (lastSignal != null) return lastSignal;
    if (stateUpdated != null) return stateUpdated;
  }

  if (lastSignal != null) return lastSignal;
  if (stateUpdated != null) return stateUpdated;

  return null;
}

export function resolveTelemetryFreshness(
  evidence: TelemetryTimestampEvidence,
  nowMs: number = Date.now(),
): ResolvedTelemetryFreshness {
  const observedAtMs = resolveCanonicalTelemetryObservedAtMs(evidence);
  if (observedAtMs == null) {
    return {
      freshness: 'no_signal',
      observedAtMs: null,
      ageMs: null,
      observedAtIso: null,
    };
  }

  if (observedAtMs > nowMs) {
    return {
      freshness: 'offline',
      observedAtMs,
      ageMs: 0,
      observedAtIso: new Date(observedAtMs).toISOString(),
    };
  }

  const observedAt = new Date(observedAtMs);
  const freshness = classifyTelemetryFreshness(observedAt, nowMs);
  return {
    freshness,
    observedAtMs,
    ageMs: nowMs - observedAtMs,
    observedAtIso: observedAt.toISOString(),
  };
}

/** Legacy fleet API connection status — mapped from canonical freshness. */
export type LegacyFleetConnectionStatus =
  | 'online'
  | 'standby'
  | 'signal_delayed'
  | 'offline'
  | 'not_connected';

export function mapTelemetryFreshnessToLegacyConnectionStatus(
  freshness: TelemetryFreshness,
  hasProviderLink: boolean,
): LegacyFleetConnectionStatus {
  if (!hasProviderLink) return 'not_connected';
  switch (freshness) {
    case 'live':
      return 'online';
    case 'standby':
      return 'standby';
    case 'signal_delayed':
      return 'signal_delayed';
    case 'offline':
    case 'no_signal':
    default:
      return 'offline';
  }
}

export function legacyConnectionStatusNote(
  status: LegacyFleetConnectionStatus,
  freshness: TelemetryFreshness,
  ageMs: number | null,
): string {
  if (status === 'not_connected') {
    return 'Fahrzeug ist mit keiner DIMO-/Provider-Datenquelle verknüpft';
  }
  if (freshness === 'no_signal' || ageMs == null) {
    return 'Keine verwertbaren Signale — Verbindung ohne aktuellen Telemetrie-Feed';
  }
  switch (status) {
    case 'online':
      return 'Telemetrie wird aktiv empfangen (letztes Signal innerhalb von 15 Minuten)';
    case 'standby':
      return 'Kein frisches Signal — Fahrzeug vermutlich geparkt oder inaktiv (letztes Signal innerhalb von 24 Stunden)';
    case 'signal_delayed':
      return 'Signal verzögert — letztes Signal zwischen 24 und 48 Stunden (Soft-Offline)';
    case 'offline': {
      const days = Math.round(ageMs / 86_400_000);
      return days > 7
        ? 'Seit über 7 Tagen kein Signal — Verbindung möglicherweise unterbrochen oder Gerät sendet nicht mehr'
        : 'Kein Signal innerhalb der letzten 48 Stunden — Verbindung unterbrochen oder Gerät sendet nicht';
    }
    default:
      return 'Telemetriestatus unbekannt';
  }
}
