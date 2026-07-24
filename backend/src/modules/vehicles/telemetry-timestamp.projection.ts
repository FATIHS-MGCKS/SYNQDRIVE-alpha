/**
 * Canonical provider vs receipt timestamp projection for vehicle telemetry.
 *
 * Semantics (Prompt 11/36):
 * - measuredAt  — provider observation instant (DIMO signals.lastSeen / sourceTimestamp)
 * - receivedAt  — when SynqDrive ingested or proxied the payload (providerFetchedAt / fetch time)
 * - observedAt  — canonical instant used for freshness (never receipt-only after backfill lag)
 * - cachedAt    — optional fleet-map/redis serve time (diagnostic only; must not rejuvenate freshness)
 */
import {
  resolveTelemetryFreshness,
  parseTelemetryTimestampMs,
  type TelemetryFreshness,
  type TelemetryTimestampEvidence,
} from './telemetry-freshness.resolver';
import type { OnlineStatus } from './vehicle-state-interpreter';

export interface VehicleLatestStateTimestampSource {
  lastSeenAt?: Date | null;
  sourceTimestamp?: Date | null;
  providerFetchedAt?: Date | null;
  updatedAt?: Date | null;
}

export interface TelemetryTimestampProjection {
  /** Provider measurement instant (ISO UTC). */
  measuredAt: string | null;
  /** SynqDrive ingest / proxy receipt instant (ISO UTC). */
  receivedAt: string | null;
  /** Canonical observation instant used for freshness (ISO UTC). */
  observedAtIso: string | null;
  /** @deprecated Alias for observedAtIso — backward compatible API field. */
  lastSignal: string;
  signalAgeMs: number;
  isFresh: boolean;
  telemetryFreshness: TelemetryFreshness;
  onlineStatus: OnlineStatus;
}

function toIso(value: Date | string | null | undefined): string | null {
  const ms = parseTelemetryTimestampMs(value ?? null);
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

export function buildTelemetryTimestampEvidence(
  state: VehicleLatestStateTimestampSource | null | undefined,
): TelemetryTimestampEvidence {
  const measured =
    state?.sourceTimestamp ?? state?.lastSeenAt ?? null;
  return {
    providerObservedAt: measured,
    lastValidTelemetryAt: state?.lastSeenAt ?? null,
    receivedAt: state?.providerFetchedAt ?? null,
    latestStateUpdatedAt: state?.updatedAt ?? null,
  };
}

export function freshnessToOnlineStatus(freshness: TelemetryFreshness): OnlineStatus {
  switch (freshness) {
    case 'live':
      return 'ONLINE';
    case 'standby':
      return 'STANDBY';
    default:
      return 'OFFLINE';
  }
}

export function projectTelemetryTimestampsFromLatestState(
  state: VehicleLatestStateTimestampSource | null | undefined,
  nowMs: number = Date.now(),
): TelemetryTimestampProjection {
  const evidence = buildTelemetryTimestampEvidence(state);
  const resolved = resolveTelemetryFreshness(evidence, nowMs);

  const measuredAt = toIso(state?.sourceTimestamp ?? state?.lastSeenAt ?? null);
  const receivedAt = toIso(state?.providerFetchedAt ?? null);
  const observedAtIso = resolved.observedAtIso;
  const signalAgeMs =
    resolved.ageMs != null
      ? resolved.ageMs
      : Number.MAX_SAFE_INTEGER;

  return {
    measuredAt,
    receivedAt,
    observedAtIso,
    lastSignal: observedAtIso ?? '',
    signalAgeMs,
    isFresh: resolved.freshness === 'live',
    telemetryFreshness: resolved.freshness,
    onlineStatus: freshnessToOnlineStatus(resolved.freshness),
  };
}

/** Recompute age/freshness fields on a cached fleet-map row without changing measuredAt. */
export function rehydrateFleetMapTelemetryFreshness<
  T extends {
    measuredAt?: string | null;
    receivedAt?: string | null;
    lastSeenAt?: string | null;
    signalAgeMs?: number;
    isFresh?: boolean;
    telemetryFreshness?: string;
    onlineStatus?: string;
    cachedAt?: string | null;
  },
>(row: T, nowMs: number = Date.now(), cachedAtIso?: string | null): T {
  const resolved = resolveTelemetryFreshness(
    {
      providerObservedAt: row.measuredAt ?? row.lastSeenAt ?? null,
      receivedAt: row.receivedAt ?? null,
      lastValidTelemetryAt: row.lastSeenAt ?? null,
    },
    nowMs,
  );
  const signalAgeMs =
    resolved.ageMs != null ? resolved.ageMs : Number.MAX_SAFE_INTEGER;

  return {
    ...row,
    ...(cachedAtIso != null ? { cachedAt: cachedAtIso } : {}),
    signalAgeMs,
    isFresh: resolved.freshness === 'live',
    telemetryFreshness: resolved.freshness,
    onlineStatus: freshnessToOnlineStatus(resolved.freshness),
  };
}
