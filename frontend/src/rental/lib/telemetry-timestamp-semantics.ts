/**
 * Telemetry timestamp semantics — provider measurement vs SynqDrive receipt.
 *
 * Pipeline:
 *   Provider measuredAt → Backend receivedAt (ingest) → Frontend store → UI display age
 *
 * Rules:
 * - Freshness always derives from provider measurement (observedAt), never receipt/cache time.
 * - receivedAt is diagnostic (transport/ingest lag).
 * - cachedAt must not rejuvenate freshness.
 */
import {
  parseTelemetryTimestampMs,
  resolveTelemetryFreshness,
  type TelemetryFreshnessInput,
  type TelemetryFreshnessState,
} from './telemetryFreshness';

export interface TelemetryTimestampFields {
  measuredAt?: string | null;
  receivedAt?: string | null;
  cachedAt?: string | null;
  /** @deprecated Observed-at alias kept for API backward compatibility. */
  lastSignal?: string | null;
  providerObservedAt?: string | null;
  signalAgeMs?: number | null;
  onlineStatus?: string | null;
}

export interface ResolvedTelemetryDisplayTime {
  measuredAt: string | null;
  receivedAt: string | null;
  cachedAt: string | null;
  observedAtIso: string | null;
  freshness: TelemetryFreshnessState;
}

export function toTelemetryFreshnessInput(
  fields: TelemetryTimestampFields,
): TelemetryFreshnessInput {
  return {
    providerObservedAt: fields.measuredAt ?? fields.providerObservedAt ?? null,
    lastSignal: fields.lastSignal ?? null,
    receivedAt: fields.receivedAt ?? null,
    signalAgeMs: fields.signalAgeMs,
    onlineStatus: fields.onlineStatus,
  };
}

export function resolveTelemetryDisplayTime(
  fields: TelemetryTimestampFields,
  options: { now?: number; locale?: string } = {},
): ResolvedTelemetryDisplayTime {
  const freshness = resolveTelemetryFreshness(toTelemetryFreshnessInput(fields), options);
  const observedAtIso =
    parseTelemetryTimestampMs(fields.measuredAt ?? fields.providerObservedAt ?? fields.lastSignal) !=
    null
      ? new Date(
          parseTelemetryTimestampMs(
            fields.measuredAt ?? fields.providerObservedAt ?? fields.lastSignal,
          )!,
        ).toISOString()
      : freshness.signalAgeMs != null && fields.lastSignal
        ? fields.lastSignal
        : null;

  return {
    measuredAt: fields.measuredAt ?? fields.providerObservedAt ?? observedAtIso,
    receivedAt: fields.receivedAt ?? null,
    cachedAt: fields.cachedAt ?? null,
    observedAtIso,
    freshness,
  };
}

/** Format age for header badges — never shows "just now" for stale provider data. */
export function formatTelemetryAgeShort(
  freshness: TelemetryFreshnessState,
  locale: 'de' | 'en' = 'en',
): string {
  if (freshness.signalAgeMs == null) return '—';
  const mins = Math.floor(freshness.signalAgeMs / 60_000);
  if (mins < 2) {
    return freshness.isLive ? (locale === 'de' ? 'gerade eben' : 'just now') : '—';
  }
  if (mins < 60) return locale === 'de' ? `vor ${mins} Min.` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return locale === 'de' ? `vor ${hrs} Std.` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return locale === 'de' ? `vor ${days} Tag(en)` : `${days}d ago`;
}

export function mergeGpsMeasuredAt(
  current: TelemetryTimestampFields,
  gps: {
    measuredAt?: string | null;
    lastSeenAt?: string | null;
    receivedAt?: string | null;
    source?: 'dimo' | 'cache' | null;
  },
): TelemetryTimestampFields {
  if (gps.source !== 'dimo') {
    return current;
  }
  const measuredAt = gps.measuredAt ?? gps.lastSeenAt ?? null;
  if (!measuredAt) return current;
  if (!shouldAcceptNewerMeasurement(current.measuredAt ?? current.lastSignal, measuredAt)) {
    return current;
  }
  return {
    ...current,
    measuredAt,
    lastSignal: measuredAt,
    receivedAt: gps.receivedAt ?? current.receivedAt ?? null,
  };
}

/**
 * Reject out-of-order provider measurements — older timestamps must not
 * move the map marker or rejuvenate freshness.
 */
export function shouldAcceptNewerMeasurement(
  currentMeasuredAt: string | null | undefined,
  incomingMeasuredAt: string | null | undefined,
): boolean {
  const incomingMs = parseTelemetryTimestampMs(incomingMeasuredAt ?? null);
  if (incomingMs == null) return false;
  const currentMs = parseTelemetryTimestampMs(currentMeasuredAt ?? null);
  if (currentMs == null) return true;
  return incomingMs >= currentMs;
}

export { parseTelemetryTimestampMs };
