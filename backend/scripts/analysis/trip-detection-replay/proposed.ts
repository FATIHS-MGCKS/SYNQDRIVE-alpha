/**
 * Offline model of the PROPOSED detection semantics (R1–R4 + overlap rework).
 *
 * R1  bounded look-forward pairing        — a drive longer than the query window
 *                                            is still pairable.
 * R2  fragment coalescing before scoring  — one noisy drive is one candidate.
 * R3  multi-signal deterministic scoring  — duration stops being the only input.
 * R4  evidence fusion                     — sources combine instead of suppress.
 * K   containment-aware overlap           — "a trip touches this" stops meaning
 *                                            "this drive is covered".
 *
 * This file is a specification executed against real production evidence. It is
 * not wired into the application and performs no writes.
 */

import { longestStationaryRunMs, maxSpeedInRange, normalizeIntervals, samplesInRange, subtract, totalMs } from './data';
import type { Candidate, Confidence, Interval, MinuteAgg, SignalName, StateChange, Trip } from './types';

// ─── R1 ─────────────────────────────────────────────────────────────────────

/** How far past the query window a closing transition may be sought. */
export const LOOK_FORWARD_MS = 6 * 3600_000;

/** A drive longer than this is treated as a telemetry artifact, not a trip. */
export const MAX_DRIVE_MS = 6 * 3600_000;

export interface PairedSegment extends Interval {
  signal: SignalName;
  /** True when the closing transition was found beyond the query window. */
  closedByLookForward: boolean;
}

/**
 * Pairs every ON transition that *starts* inside [from, to] with its closing
 * transition, searching forward through the full series up to LOOK_FORWARD_MS
 * past the ON edge. Unclosed edges are returned separately: they are deferred,
 * never silently dropped and never turned into a fabricated boundary.
 */
export function findSegmentsLookForward(
  changes: StateChange[],
  signal: SignalName,
  from: number,
  to: number,
  minDurationMs: number,
): { segments: PairedSegment[]; unresolvedOnEdges: number[] } {
  const series = changes.filter((c) => c.signal === signal);
  const segments: PairedSegment[] = [];
  const unresolvedOnEdges: number[] = [];

  for (let i = 0; i < series.length; i++) {
    const row = series[i];
    if (row.newValue !== 1) continue;
    if (row.changedAt < from || row.changedAt > to) continue;
    // Collapse ON,ON runs: only the first edge of a run opens a segment.
    if (i > 0 && series[i - 1].newValue === 1) continue;

    let closedAt: number | null = null;
    for (let j = i + 1; j < series.length; j++) {
      if (series[j].changedAt - row.changedAt > LOOK_FORWARD_MS) break;
      if (series[j].newValue === 0) {
        closedAt = series[j].changedAt;
        break;
      }
    }

    if (closedAt === null) {
      unresolvedOnEdges.push(row.changedAt);
      continue;
    }
    const durationMs = closedAt - row.changedAt;
    if (durationMs < minDurationMs || durationMs > MAX_DRIVE_MS) continue;

    segments.push({
      start: row.changedAt,
      end: closedAt,
      signal,
      closedByLookForward: closedAt > to,
    });
  }

  return { segments, unresolvedOnEdges };
}

// ─── R2 ─────────────────────────────────────────────────────────────────────

/** Maximum silence bridged when merging fragments. Mirrors TRIP_MID_GAP_SPLIT_MS. */
export const COALESCE_GAP_MS = 180_000;

/**
 * A stationary run at least this long inside a gap is a real stop, so the two
 * fragments must stay separate. Kept below COALESCE_GAP_MS so that coalescing
 * can never produce an envelope the live mid-gap splitter would split again.
 */
export const STATIONARY_BREAK_MS = 150_000;

export interface CoalescedCandidate extends Interval {
  fragments: PairedSegment[];
  signals: Set<SignalName>;
}

/**
 * Merges fragments separated by less than COALESCE_GAP_MS.
 *
 * Invariants:
 *  I1  a gap longer than COALESCE_GAP_MS is never bridged;
 *  I2  a gap containing a stationary run of at least STATIONARY_BREAK_MS with
 *      telemetry present is never bridged (that is a genuine stop, not flapping);
 *  I3  a gap with no telemetry at all *is* bridged (short signal loss);
 *  I4  a merged envelope never exceeds MAX_DRIVE_MS.
 */
export function coalesceFragments(
  fragments: PairedSegment[],
  minutes: MinuteAgg[] | undefined,
): CoalescedCandidate[] {
  const sorted = [...fragments].sort((a, b) => a.start - b.start);
  const out: CoalescedCandidate[] = [];

  for (const fragment of sorted) {
    const current = out[out.length - 1];
    if (!current) {
      out.push({ start: fragment.start, end: fragment.end, fragments: [fragment], signals: new Set([fragment.signal]) });
      continue;
    }

    const gap = fragment.start - current.end;
    const overlapping = gap <= 0;
    const bridgeable =
      overlapping ||
      (gap <= COALESCE_GAP_MS &&
        !gapContainsRealStop(minutes, current.end, fragment.start) &&
        fragment.end - current.start <= MAX_DRIVE_MS);

    if (bridgeable) {
      current.end = Math.max(current.end, fragment.end);
      current.fragments.push(fragment);
      current.signals.add(fragment.signal);
    } else {
      out.push({ start: fragment.start, end: fragment.end, fragments: [fragment], signals: new Set([fragment.signal]) });
    }
  }

  return out;
}

function gapContainsRealStop(
  minutes: MinuteAgg[] | undefined,
  gapStart: number,
  gapEnd: number,
): boolean {
  const samples = samplesInRange(minutes, gapStart, gapEnd);
  if (samples === 0) return false; // I3: signal loss, not a stop
  return longestStationaryRunMs(minutes, gapStart, gapEnd) >= STATIONARY_BREAK_MS;
}

/**
 * I5 — an envelope is split at internal stationary runs of at least
 * TRIP_MID_GAP_SPLIT_MS.
 *
 * Coalescing controls what is bridged *between* fragments, but a single
 * ignition-ON interval can itself span a stop with the engine running. Without
 * this rule the repair path would persist envelopes that the live mid-gap
 * splitter would immediately split, so the two paths would disagree about what
 * a trip is.
 */
export function splitAtInternalStops(
  candidate: CoalescedCandidate,
  minutes: MinuteAgg[] | undefined,
): CoalescedCandidate[] {
  const slice = (minutes ?? []).filter(
    (m) => m.minute >= candidate.start - 60_000 && m.minute <= candidate.end,
  );
  if (slice.length === 0) return [candidate];

  const stops: Interval[] = [];
  let runStart: number | null = null;
  let previous: number | null = null;
  for (const m of slice) {
    const moving = (m.maxSpeed ?? 0) >= 1;
    if (moving) {
      if (runStart !== null && previous !== null && previous + 60_000 - runStart >= COALESCE_GAP_MS) {
        stops.push({ start: runStart, end: previous + 60_000 });
      }
      runStart = null;
    } else if (runStart === null) {
      runStart = m.minute;
    }
    previous = m.minute;
  }
  if (runStart !== null && previous !== null && previous + 60_000 - runStart >= COALESCE_GAP_MS) {
    stops.push({ start: runStart, end: previous + 60_000 });
  }

  if (stops.length === 0) return [candidate];

  const pieces: CoalescedCandidate[] = [];
  let cursor = candidate.start;
  for (const stop of stops) {
    const end = Math.min(stop.start, candidate.end);
    if (end > cursor) {
      pieces.push({ start: cursor, end, fragments: candidate.fragments, signals: new Set(candidate.signals) });
    }
    cursor = Math.max(cursor, Math.min(stop.end, candidate.end));
  }
  if (cursor < candidate.end) {
    pieces.push({ start: cursor, end: candidate.end, fragments: candidate.fragments, signals: new Set(candidate.signals) });
  }

  return pieces.length > 0 ? pieces : [candidate];
}

// ─── R3 ─────────────────────────────────────────────────────────────────────

export type ScoredConfidence = Confidence | 'REJECT';

export interface ConfidenceScore {
  confidence: ScoredConfidence;
  score: number;
  contributions: Record<string, number>;
}

/**
 * Deterministic, inspectable additive score. Every contribution is recorded so
 * an operator can read why a candidate landed where it did.
 *
 * Duration remains an input but is no longer decisive: strong movement evidence
 * can carry a short segment, and absent movement sinks a long one.
 */
export function scoreCandidate(params: {
  durationMs: number;
  hasMotionEvidence: boolean;
  hasIgnitionEvidence: boolean;
  maxSpeedKmh: number | null;
  telemetrySamples: number;
  distanceKm: number | null;
  hasDimoSegment?: boolean;
}): ConfidenceScore {
  const contributions: Record<string, number> = {};

  // Hard gate before scoring: a trip requires positive movement evidence.
  // Engine-on-while-parked produces a long, well-sampled ignition segment that
  // would otherwise score MEDIUM on duration alone. Absence of telemetry is not
  // absence of movement, so the gate only applies when we actually observed the
  // vehicle and saw it stationary throughout.
  const observedStationary =
    params.telemetrySamples > 0 &&
    !params.hasMotionEvidence &&
    (params.maxSpeedKmh ?? 0) <= 1 &&
    !params.hasDimoSegment;
  if (observedStationary) {
    return {
      confidence: 'REJECT',
      score: -99,
      contributions: { movementGate: -99 },
    };
  }

  const minutes = params.durationMs / 60_000;
  contributions.duration = minutes >= 15 ? 2 : minutes >= 5 ? 1 : minutes >= 2 ? 0 : -1;

  contributions.motion = params.hasMotionEvidence ? 2 : 0;
  contributions.ignition = params.hasIgnitionEvidence ? 1 : 0;

  const speed = params.maxSpeedKmh;
  contributions.speed = speed == null ? 0 : speed >= 30 ? 2 : speed >= 10 ? 1 : speed > 1 ? 0 : -2;

  contributions.telemetry = params.telemetrySamples >= 10 ? 1 : params.telemetrySamples > 0 ? 0 : -1;
  contributions.distance = params.distanceKm != null && params.distanceKm >= 1 ? 1 : 0;
  contributions.dimo = params.hasDimoSegment ? 2 : 0;

  const score = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  const confidence: ScoredConfidence =
    score >= 4 ? 'HIGH' : score >= 2 ? 'MEDIUM' : score >= 1 ? 'LOW' : 'REJECT';

  return { confidence, score, contributions };
}

// ─── R4 ─────────────────────────────────────────────────────────────────────

/**
 * Fuses per-source segments into one candidate set.
 *
 * Unlike the current dedupe — which picks a single winner when two candidates
 * are within ±2 minutes on *both* edges and otherwise keeps both — fusion takes
 * the union envelope of overlapping evidence. A weak candidate from one source
 * can therefore never shadow a stronger independent candidate; it can only
 * widen or corroborate it.
 */
export function fuseCandidates(groups: CoalescedCandidate[]): CoalescedCandidate[] {
  const sorted = [...groups].sort((a, b) => a.start - b.start);
  const fused: CoalescedCandidate[] = [];

  for (const group of sorted) {
    const current = fused[fused.length - 1];
    if (current && group.start <= current.end && group.end - current.start <= MAX_DRIVE_MS) {
      current.end = Math.max(current.end, group.end);
      current.fragments.push(...group.fragments);
      for (const signal of group.signals) current.signals.add(signal);
    } else {
      fused.push({ ...group, signals: new Set(group.signals), fragments: [...group.fragments] });
    }
  }

  return fused;
}

// ─── K: containment-aware overlap ───────────────────────────────────────────

export const DUPLICATE_COVERAGE_RATIO = 0.9;
export const MIN_REPAIR_SPAN_MS = 5 * 60_000;
export const OBSERVABLE_GAP_MS = 60_000;

export type OverlapVerdict = 'DUPLICATE' | 'REPAIRABLE_GAP' | 'AMBIGUOUS';

export interface OverlapAssessment {
  verdict: OverlapVerdict;
  coverageRatio: number;
  repairableSpans: Interval[];
  observedGapSpans: Interval[];
  ambiguousReason?: string;
}

/**
 * Replaces "does any trip touch this window?" with "how much of this drive is
 * already represented?".
 *
 * CANCELLED trips never count as coverage. An ONGOING trip intersecting the
 * candidate yields AMBIGUOUS rather than a guess, because its rolling end_time
 * is an activity cursor rather than a boundary.
 */
export function assessOverlap(candidate: Interval, trips: Trip[]): OverlapAssessment {
  const relevant = trips.filter(
    (trip) => trip.status !== 'CANCELLED' && trip.start < candidate.end && (trip.end ?? Infinity) > candidate.start,
  );

  const ongoing = relevant.find((trip) => trip.end === null);
  if (ongoing) {
    return {
      verdict: 'AMBIGUOUS',
      coverageRatio: 0,
      repairableSpans: [],
      observedGapSpans: [],
      ambiguousReason: `ongoing trip ${ongoing.id} intersects candidate`,
    };
  }

  const covers: Interval[] = normalizeIntervals(
    relevant.map((trip) => ({ start: trip.start, end: trip.end as number })),
  );
  const candidateMs = candidate.end - candidate.start;
  const coveredMs = totalMs(
    covers
      .map((cover) => ({
        start: Math.max(cover.start, candidate.start),
        end: Math.min(cover.end, candidate.end),
      }))
      .filter((i) => i.end > i.start),
  );
  const coverageRatio = candidateMs > 0 ? coveredMs / candidateMs : 1;

  if (coverageRatio >= DUPLICATE_COVERAGE_RATIO) {
    return { verdict: 'DUPLICATE', coverageRatio, repairableSpans: [], observedGapSpans: [] };
  }

  const uncovered = subtract(candidate, covers);
  return {
    verdict: 'REPAIRABLE_GAP',
    coverageRatio,
    repairableSpans: uncovered.filter((span) => span.end - span.start >= MIN_REPAIR_SPAN_MS),
    observedGapSpans: uncovered.filter(
      (span) => span.end - span.start >= OBSERVABLE_GAP_MS && span.end - span.start < MIN_REPAIR_SPAN_MS,
    ),
  };
}

// ─── full proposed pipeline for one window ──────────────────────────────────

export interface ProposedResult {
  proposals: Array<Candidate & { confidence: Confidence; score: number; coverageRatio: number }>;
  duplicates: number;
  ambiguous: number;
  rejected: number;
  observedGaps: number;
  unresolvedEdges: number;
}

export function runProposedWindow(params: {
  changes: StateChange[];
  minutes: MinuteAgg[] | undefined;
  trips: Trip[];
  vehicleId: string;
  from: number;
  to: number;
}): ProposedResult {
  const { changes, minutes, trips, vehicleId, from, to } = params;

  // R1 + R4: both sources are always evaluated, for every profile.
  const ignition = findSegmentsLookForward(changes, 'ignition', from, to, 60_000);
  const motion = findSegmentsLookForward(changes, 'motion', from, to, 30_000);

  // R2: coalesce per source, then fuse across sources.
  const coalesced = [
    ...coalesceFragments(ignition.segments, minutes),
    ...coalesceFragments(motion.segments, minutes),
  ];
  const fused = fuseCandidates(coalesced).flatMap((candidate) =>
    splitAtInternalStops(candidate, minutes),
  );

  const result: ProposedResult = {
    proposals: [],
    duplicates: 0,
    ambiguous: 0,
    rejected: 0,
    observedGaps: 0,
    unresolvedEdges: ignition.unresolvedOnEdges.length + motion.unresolvedOnEdges.length,
  };

  for (const candidate of fused) {
    const assessment = assessOverlap(candidate, trips);
    if (assessment.verdict === 'DUPLICATE') {
      result.duplicates++;
      continue;
    }
    if (assessment.verdict === 'AMBIGUOUS') {
      result.ambiguous++;
      continue;
    }
    result.observedGaps += assessment.observedGapSpans.length;

    for (const span of assessment.repairableSpans) {
      // R3: score the span actually being persisted, not the whole envelope.
      const scored = scoreCandidate({
        durationMs: span.end - span.start,
        hasMotionEvidence: candidate.signals.has('motion'),
        hasIgnitionEvidence: candidate.signals.has('ignition'),
        maxSpeedKmh: maxSpeedInRange(minutes, span.start, span.end),
        telemetrySamples: samplesInRange(minutes, span.start, span.end),
        distanceKm: null,
      });

      if (scored.confidence === 'REJECT' || scored.confidence === 'LOW') {
        result.rejected++;
        continue;
      }

      result.proposals.push({
        vehicleId,
        start: span.start,
        end: span.end,
        source: 'FUSED',
        confidence: scored.confidence,
        fragmentCount: candidate.fragments.length,
        score: scored.score,
        coverageRatio: assessment.coverageRatio,
        evidence: {
          signals: [...candidate.signals],
          contributions: scored.contributions,
          closedByLookForward: candidate.fragments.some((f) => f.closedByLookForward),
        },
      });
    }
  }

  return result;
}
