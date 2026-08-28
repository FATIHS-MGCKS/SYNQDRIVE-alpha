/**
 * Faithful offline reproduction of the CURRENT production detection semantics.
 *
 * Mirrors, as of the audited revision:
 *  - ClickHouseAnalyticsService.findIgnitionSegments / findMotionSegments
 *    (window-bounded `leadInFrame` pairing, 60s / 30s minimum duration,
 *     duration-only confidence at 15min HIGH / 5min MEDIUM)
 *  - TripReconciliationService.collectRepairCandidates
 *    (ICE runs motion only when ignition yields zero candidates,
 *     ±2min dedupe by rank, HIGH|MEDIUM gate before persistence)
 *  - TripOverlapDetector (±5min tolerance, no trip-status filter)
 *  - TripReconciliationScheduler (fast 15min/45min, warm 4h/12h, cold daily/7d)
 */

import type { Candidate, Confidence, DetectionProfile, Interval, StateChange, Trip } from './types';

export const MIN_IGNITION_SEGMENT_DURATION_MS = 60_000;
export const MIN_MOTION_SEGMENT_DURATION_MS = 30_000;
export const OVERLAP_TOLERANCE_MS = 5 * 60_000;
export const DEDUPE_TOLERANCE_MS = 2 * 60_000;

export function durationConfidence(durationMs: number): Confidence {
  if (durationMs >= 15 * 60_000) return 'HIGH';
  if (durationMs >= 5 * 60_000) return 'MEDIUM';
  return 'LOW';
}

/**
 * Reproduces the production SQL exactly.
 *
 * The `leadInFrame(... ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING)` window
 * function is evaluated *after* the window predicate, so the closing transition
 * must itself fall inside [from, to]. The last row in the window has a NULL
 * lead and is therefore dropped — this is the structural window-bounded pairing
 * limitation. The lead is taken regardless of the next row's value, so two
 * consecutive ON rows pair with each other.
 */
export function findSegmentsWindowBounded(
  changes: StateChange[],
  signal: 'ignition' | 'motion',
  from: number,
  to: number,
  minDurationMs: number,
): Interval[] {
  const rows = changes.filter(
    (c) => c.signal === signal && c.changedAt >= from && c.changedAt <= to,
  );
  const segments: Interval[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].newValue !== 1) continue;
    const next = rows[i + 1];
    if (!next) continue; // NULL lead → row dropped
    const durationMs = next.changedAt - rows[i].changedAt;
    if (durationMs >= minDurationMs) {
      segments.push({ start: rows[i].changedAt, end: next.changedAt });
    }
  }
  return segments;
}

function rank(candidate: Candidate): number {
  const confidenceRank =
    candidate.confidence === 'HIGH' ? 30 : candidate.confidence === 'MEDIUM' ? 20 : 10;
  // DIMO_SEGMENT would score 2; ClickHouse sources score 1.
  return confidenceRank + 1;
}

function nearlyOverlap(a: Candidate, b: Candidate): boolean {
  return (
    Math.abs(a.start - b.start) <= DEDUPE_TOLERANCE_MS &&
    Math.abs(a.end - b.end) <= DEDUPE_TOLERANCE_MS
  );
}

export function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const deduped: Candidate[] = [];
  const sorted = [...candidates].sort((a, b) => a.start - b.start || rank(b) - rank(a));
  for (const candidate of sorted) {
    const index = deduped.findIndex((existing) => nearlyOverlap(existing, candidate));
    if (index === -1) {
      deduped.push(candidate);
    } else if (rank(candidate) > rank(deduped[index])) {
      deduped[index] = candidate;
    }
  }
  return deduped;
}

/**
 * `collectRepairCandidates` without the DIMO branch.
 *
 * Omitting the DIMO early-return is deliberate and charitable to the baseline:
 * the DIMO segments API is not replayable offline, and the early-return can
 * only suppress ClickHouse candidates, never add them. A gap the baseline
 * misses here is therefore missed under the real implementation too.
 */
export function collectRepairCandidatesBaseline(
  changes: StateChange[],
  profile: DetectionProfile,
  from: number,
  to: number,
): Candidate[] {
  const candidates: Candidate[] = [];

  const ignition = findSegmentsWindowBounded(
    changes,
    'ignition',
    from,
    to,
    MIN_IGNITION_SEGMENT_DURATION_MS,
  );
  for (const segment of ignition) {
    candidates.push({
      vehicleId: '',
      start: segment.start,
      end: segment.end,
      source: 'CLICKHOUSE_IGNITION',
      confidence: durationConfidence(segment.end - segment.start),
      fragmentCount: 1,
      evidence: { repairSource: 'CLICKHOUSE_IGNITION' },
    });
  }

  const motionProfileEligible =
    profile === 'EV' || profile === 'HYBRID' || profile === 'UNKNOWN';
  const useMotion = motionProfileEligible || candidates.length === 0;

  if (useMotion) {
    const motion = findSegmentsWindowBounded(
      changes,
      'motion',
      from,
      to,
      MIN_MOTION_SEGMENT_DURATION_MS,
    );
    for (const segment of motion) {
      candidates.push({
        vehicleId: '',
        start: segment.start,
        end: segment.end,
        source: 'CLICKHOUSE_MOTION',
        confidence: durationConfidence(segment.end - segment.start),
        fragmentCount: 1,
        evidence: { repairSource: 'CLICKHOUSE_MOTION' },
      });
    }
  }

  return dedupeCandidates(candidates);
}

/**
 * Current `TripOverlapDetector` semantics.
 *
 * Any trip whose window touches the candidate ±5 minutes triggers, including
 * CANCELLED trips (the production query applies no `tripStatus` filter) and
 * including a short trip wholly contained inside a long candidate.
 */
export function overlapTriggered(trips: Trip[], candidate: Interval): Trip | null {
  const windowStart = candidate.start - OVERLAP_TOLERANCE_MS;
  const windowEnd = candidate.end + OVERLAP_TOLERANCE_MS;
  for (const trip of trips) {
    if (trip.end !== null) {
      if (trip.end >= windowStart && trip.start <= windowEnd) return trip;
    } else if (trip.start <= windowEnd && trip.start >= windowStart) {
      return trip;
    }
  }
  return null;
}

export interface TierRun {
  tier: 'fast' | 'warm' | 'cold';
  from: number;
  to: number;
}

export function buildTierRuns(
  windowFrom: number,
  windowTo: number,
  phaseOffsetMs: number,
): TierRun[] {
  const runs: TierRun[] = [];

  for (let t = windowFrom + phaseOffsetMs; t <= windowTo; t += 15 * 60_000) {
    runs.push({ tier: 'fast', from: t - 45 * 60_000, to: t });
  }
  for (let t = windowFrom + phaseOffsetMs; t <= windowTo; t += 4 * 3600_000) {
    runs.push({ tier: 'warm', from: t - 12 * 3600_000, to: t });
  }
  // Cold runs at 03:00 UTC daily.
  const firstDay = new Date(windowFrom);
  firstDay.setUTCHours(3, 0, 0, 0);
  for (let t = firstDay.getTime(); t <= windowTo; t += 24 * 3600_000) {
    if (t >= windowFrom) runs.push({ tier: 'cold', from: t - 7 * 24 * 3600_000, to: t });
  }

  return runs.sort((a, b) => a.to - b.to);
}
