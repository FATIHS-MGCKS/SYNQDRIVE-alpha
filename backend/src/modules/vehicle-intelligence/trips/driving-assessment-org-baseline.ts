/**
 * Org-relative LTE_R1 fleet baseline for driving-assessment device quality.
 * Calibrated from Phase-0 peer comparison (median ~0.2 events/km, ~2 events/trip).
 */

export const ORG_BASELINE_MIN_SAMPLE_TRIPS = 5;
export const ORG_BASELINE_LOOKBACK_DAYS = 90;

export interface OrgLteR1Baseline {
  sampleTrips: number;
  medianEventsPerKm: number | null;
  p95EventsPerKm: number | null;
  medianRawEventsPerTrip: number | null;
  p95RawEventsPerTrip: number | null;
  sufficient: boolean;
  computedAt: string;
}

export interface TripBaselineSample {
  eventsPerKm: number | null;
  rawNativeCount: number;
}

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export function buildOrgLteR1Baseline(samples: TripBaselineSample[]): OrgLteR1Baseline {
  const eventsPerKm = samples
    .map((s) => s.eventsPerKm)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  const rawCounts = samples
    .map((s) => s.rawNativeCount)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const sampleTrips = Math.max(eventsPerKm.length, rawCounts.length);
  const sufficient = eventsPerKm.length >= ORG_BASELINE_MIN_SAMPLE_TRIPS;

  return {
    sampleTrips,
    medianEventsPerKm: percentile(eventsPerKm, 50),
    p95EventsPerKm: percentile(eventsPerKm, 95),
    medianRawEventsPerTrip: percentile(rawCounts, 50),
    p95RawEventsPerTrip: percentile(rawCounts, 95),
    sufficient,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Returns human-readable reason tokens when a trip exceeds org fleet norms.
 */
export function evaluateAgainstOrgBaseline(input: {
  eventsPerKm: number | null;
  rawNativeCount: number;
  medianInterEventGapMs: number | null;
  durationMin: number | null;
  baseline: OrgLteR1Baseline;
}): string[] {
  if (!input.baseline.sufficient) return [];

  const reasons: string[] = [];
  const durationMin = input.durationMin ?? 0;

  if (
    input.eventsPerKm != null &&
    input.baseline.p95EventsPerKm != null &&
    input.eventsPerKm > Math.max(2, input.baseline.p95EventsPerKm * 1.5)
  ) {
    reasons.push(
      `above_org_p95_events_per_km=${input.eventsPerKm.toFixed(2)}>${input.baseline.p95EventsPerKm.toFixed(2)}`,
    );
  } else if (
    input.eventsPerKm != null &&
    input.baseline.medianEventsPerKm != null &&
    input.baseline.medianEventsPerKm > 0 &&
    input.eventsPerKm > input.baseline.medianEventsPerKm * 5
  ) {
    reasons.push(
      `above_org_median_events_per_km_x5=${input.eventsPerKm.toFixed(2)}`,
    );
  }

  if (
    durationMin >= 3 &&
    input.baseline.p95RawEventsPerTrip != null &&
    input.rawNativeCount > Math.max(8, input.baseline.p95RawEventsPerTrip * 2)
  ) {
    reasons.push(`above_org_p95_raw_events=${input.rawNativeCount}`);
  }

  if (
    input.rawNativeCount >= 5 &&
    input.medianInterEventGapMs != null &&
    input.medianInterEventGapMs <= 30_000 &&
    reasons.length > 0
  ) {
    reasons.push(`org_baseline_cadence_ms=${input.medianInterEventGapMs}`);
  }

  return reasons;
}
