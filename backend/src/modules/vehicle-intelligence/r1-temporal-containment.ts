/**
 * EXP-021 C0.3 — minimal R1 temporal-safety containment (shared constants/helpers).
 *
 * Ruptela R1 historical OBD-family records (speed, RPM, load, odometer, …) carry
 * GraphQL row labels that are query-grid bucket starts, and the underlying records
 * are additionally misdated by seconds to tens of seconds (buffered/backlog
 * records observed). Point-in-time conjunctions derived from them — point
 * deceleration, "engine off WHILE driving", exact event-time context — are not
 * defensible.
 *
 * This is a containment layer, not the final source-quality model. Existing
 * persisted rows are never deleted or rewritten here; containment applies to
 * future derivation and to read/consumer interpretation only.
 */
import {
  hasUncertainHistoricalObdRecordTime,
  type TelemetrySourceFamily,
} from './telemetry-source-family';

export const R1_TEMPORAL_CONTAINMENT_VERSION = 'r1-temporal-containment-v2';

/** Marker attached to evidence / assessments whose timing rests on R1 historical OBD records. */
export const R1_OBD_RECORD_TIME_UNCERTAIN = 'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN';

/**
 * HF abuse event types whose claim depends on a point-in-time conjunction of R1
 * OBD records (Δv/Δt between records; RPM death while speed > threshold;
 * cold coolant + full throttle aligned on bucket-labelled samples — EXP-021 CG-01).
 */
export const R1_CONTAINED_HF_ABUSE_EVENT_TYPES: readonly string[] = [
  'FULL_BRAKING',
  'POSSIBLE_IMPACT',
  'ENGINE_SHUTDOWN_WHILE_DRIVING',
  'COLD_ENGINE_FULL_THROTTLE',
];

const CONTAINED_SET = new Set(R1_CONTAINED_HF_ABUSE_EVENT_TYPES);

export function isR1ContainedHfAbuseEventType(eventType: string): boolean {
  return CONTAINED_SET.has(eventType);
}

/** True when an HF-derived abuse row of `eventType` must be contained for `family`. */
export function isContainedHfAbuseEvent(
  family: TelemetrySourceFamily,
  eventCategory: string,
  eventType: string,
): boolean {
  return (
    hasUncertainHistoricalObdRecordTime(family) &&
    eventCategory === 'ABUSE' &&
    isR1ContainedHfAbuseEventType(eventType)
  );
}

/**
 * Consumer-boundary interpretation of a persisted FULL_BRAKING rate. For R1 every
 * FULL_BRAKING classification rests on HF abuse reconstruction from R1 OBD records
 * (directly, or via ledger upgrade), so the rate is reported as 0. Persisted values
 * are not modified.
 */
export function containFullBrakingRate(
  rate: number | null,
  family: TelemetrySourceFamily,
): number | null {
  return hasUncertainHistoricalObdRecordTime(family) && rate != null ? 0 : rate;
}

/**
 * Marker merged into `VehicleTrip.behaviorSummaryJson` by R1 enrichment runs that
 * applied containment: the trip's persisted counters already exclude contained
 * types even if older contained rows were preserved.
 */
export function buildR1TemporalContainmentSummary(
  family: TelemetrySourceFamily,
): { r1TemporalContainment: { version: string; containedEventTypes: string[] } } | null {
  if (!hasUncertainHistoricalObdRecordTime(family)) return null;
  return {
    r1TemporalContainment: {
      version: R1_TEMPORAL_CONTAINMENT_VERSION,
      containedEventTypes: [...R1_CONTAINED_HF_ABUSE_EVENT_TYPES],
    },
  };
}

export interface R1TemporalContainmentSummaryMarker {
  version: string;
  containedEventTypes: string[];
}

export function parseR1TemporalContainmentSummary(
  behaviorSummaryJson: unknown,
): R1TemporalContainmentSummaryMarker | null {
  if (behaviorSummaryJson == null || typeof behaviorSummaryJson !== 'object') return null;
  const raw = (behaviorSummaryJson as Record<string, unknown>).r1TemporalContainment;
  if (raw == null || typeof raw !== 'object') return null;
  const marker = raw as Record<string, unknown>;
  const types = marker.containedEventTypes;
  if (!Array.isArray(types) || !types.every((t) => typeof t === 'string')) return null;
  return {
    version: typeof marker.version === 'string' ? marker.version : '',
    containedEventTypes: types,
  };
}

export function hasR1TemporalContainmentSummary(behaviorSummaryJson: unknown): boolean {
  return parseR1TemporalContainmentSummary(behaviorSummaryJson) != null;
}

/**
 * Persisted contained abuse rows still included in `VehicleTrip.abuseEvents` /
 * related counters and therefore requiring read-time subtraction. Trips enriched
 * under an older marker may already exclude earlier contained types in persisted
 * counters while newer contained types (CG-01) still need adjustment.
 */
export function countContainedAbuseRowsForReadAdjustment(
  rows: ReadonlyArray<{ eventType: string }>,
  behaviorSummaryJson: unknown,
): number {
  const marker = parseR1TemporalContainmentSummary(behaviorSummaryJson);
  const excludedFromPersistedCounters = new Set(marker?.containedEventTypes ?? []);
  let count = 0;
  for (const row of rows) {
    if (!isR1ContainedHfAbuseEventType(row.eventType)) continue;
    if (excludedFromPersistedCounters.has(row.eventType)) continue;
    count += 1;
  }
  return count;
}

/**
 * Read-time interpretation of persisted trip event counters for R1: FULL_BRAKING is
 * removed from the braking totals and the persisted contained HF abuse rows
 * (`containedAbuseEventCount`) from the abuse total — matching what the enrichment
 * pipeline now produces for new R1 trips. Persisted counters are not modified.
 */
export function containTripEventCounters<
  T extends { totalBrakingEvents: number; fullBrakingEvents: number; abuseEvents: number },
>(events: T, containedAbuseEventCount: number): T {
  return {
    ...events,
    totalBrakingEvents: Math.max(0, events.totalBrakingEvents - events.fullBrakingEvents),
    fullBrakingEvents: 0,
    abuseEvents: Math.max(0, events.abuseEvents - containedAbuseEventCount),
  };
}

export interface HfAbuseContainmentResult<T> {
  kept: T[];
  suppressed: T[];
  suppressedByType: Record<string, number>;
}

/**
 * Future-derivation gate: drop contained HF abuse detections for R1. For any other
 * family the input is returned unchanged.
 */
/**
 * True when persisted trip/impact signals show the trip may have carried a contained
 * R1 OBD-derived FULL_BRAKING or contained HF abuse claim before read-time containment.
 */
export function hasPersistedR1ContainedClaimIndicators(input: {
  persistedFullBrakingEvents: number;
  containedAbuseEventCount: number;
  impactFullBrakingPer100Km: number | null | undefined;
}): boolean {
  return (
    input.persistedFullBrakingEvents > 0 ||
    input.containedAbuseEventCount > 0 ||
    (input.impactFullBrakingPer100Km ?? 0) > 0
  );
}

/**
 * EXP-021 C0.3B — withhold a persisted driving-stress score at read time when it may
 * embed contained R1 FULL_BRAKING. Does not fabricate a corrected score.
 */
export function shouldWithholdR1PersistedDrivingStressScore(
  family: TelemetrySourceFamily,
  indicators: {
    persistedFullBrakingEvents: number;
    containedAbuseEventCount: number;
    impactFullBrakingPer100Km: number | null | undefined;
  },
): boolean {
  return (
    hasUncertainHistoricalObdRecordTime(family) &&
    hasPersistedR1ContainedClaimIndicators(indicators)
  );
}

export function applyR1HfAbuseContainment<T extends { eventType: string }>(
  events: T[],
  family: TelemetrySourceFamily,
): HfAbuseContainmentResult<T> {
  if (!hasUncertainHistoricalObdRecordTime(family)) {
    return { kept: events, suppressed: [], suppressedByType: {} };
  }
  const kept: T[] = [];
  const suppressed: T[] = [];
  const suppressedByType: Record<string, number> = {};
  for (const e of events) {
    if (isR1ContainedHfAbuseEventType(e.eventType)) {
      suppressed.push(e);
      suppressedByType[e.eventType] = (suppressedByType[e.eventType] ?? 0) + 1;
    } else {
      kept.push(e);
    }
  }
  return { kept, suppressed, suppressedByType };
}
