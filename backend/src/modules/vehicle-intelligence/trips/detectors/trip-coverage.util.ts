/**
 * Containment-aware coverage algebra for repair proposals.
 *
 * Binary overlap ("does any trip touch this window?") is not a coverage
 * predicate. A 98-minute drive containing two short canonical trips totalling
 * 29 minutes overlaps, yet 69 minutes of real driving are unrepresented. This
 * module answers the actual question: how much of a proposed interval is
 * already covered by canonical trips, and where the uncovered time sits.
 *
 * Pure functions only — no Prisma, no I/O — so both the detector and the
 * offline replay harness can execute exactly the same semantics.
 */

export interface CoverageInterval {
  start: Date;
  end: Date;
}

/** A canonical trip as far as coverage is concerned. */
export interface CanonicalTripInterval {
  id: string;
  startTime: Date;
  /** Null for an ONGOING trip: an activity cursor, not a boundary. */
  endTime: Date | null;
  tripStatus: string;
}

export type CoverageVerdict =
  | 'FULLY_COVERED'
  | 'SUBSTANTIALLY_COVERED'
  | 'PARTIALLY_COVERED'
  | 'NOT_COVERED'
  | 'AMBIGUOUS';

export type AmbiguousReason = 'ONGOING_TRIP_INTERSECTS' | 'CANONICAL_SET_TRUNCATED';

export interface CoverageMetrics {
  proposalDurationSeconds: number;
  coveredSeconds: number;
  coverageRatio: number;
  missingSeconds: number;
  prefixMissingSeconds: number;
  suffixMissingSeconds: number;
  interiorMissingSeconds: number;
  longestUncoveredSpanSeconds: number;
  /** Canonical trips that contribute coverage after clipping to the proposal. */
  coveringTripCount: number;
  uncoveredSpans: CoverageInterval[];
}

export interface CoverageAssessment {
  verdict: CoverageVerdict;
  metrics: CoverageMetrics;
  /** Uncovered spans long enough to be worth repairing on their own. */
  repairableSpans: CoverageInterval[];
  /** Ids of the canonical trips that intersect the proposal, CANCELLED included. */
  intersectingTripIds: string[];
  ambiguousReason?: AmbiguousReason;
}

// ── Thresholds ───────────────────────────────────────────────────────────────
//
// Derived from the 90-day production replay (1455 distinct repair candidates),
// not chosen by intuition. See
// architecture/TRIP_DETECTION_HARDENING_DESIGN_2026-08-28.md.
//
// The coverage_ratio distribution of candidates the legacy detector suppressed
// is sharply bimodal: 1143 sit at >= 0.99 with zero uncovered driving (genuine
// duplicates), 135 sit below 0.50 of which 97 contain uncovered driving. Only
// 26 candidates fall in the 0.75–0.90 valley.

/** Missing time at or below this is measurement noise, not a gap. */
export const FULL_COVERAGE_SLACK_SECONDS = 60;

/**
 * Ratio above which a proposal is considered substantially represented.
 * At 0.90, no candidate carrying five or more minutes of uncovered driving is
 * suppressed once the span guard below is applied.
 */
export const SUBSTANTIAL_COVERAGE_RATIO = 0.9;

/**
 * A single uncovered span at or above this length can never be dismissed as
 * coverage noise, whatever the ratio. Equal to TRIP_MID_GAP_SPLIT_MS: a silence
 * this long is precisely what the live path treats as a trip boundary, so
 * calling it "already covered" would contradict the detector. On the replay
 * dataset this guard rescues 6 candidates from DUPLICATE, 5 of which contain
 * real uncovered driving.
 */
export const MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS = 180;

/**
 * Shortest *carved* uncovered span that may be proposed as a repair on its own.
 * Matches the >= 5 min definition of a coverage gap used throughout the audit.
 *
 * It applies only when clipping a partially covered proposal, where the
 * question "is this leftover fragment a trip?" genuinely arises. It is not a
 * minimum trip duration: a proposal that canonical trips do not cover at all is
 * returned whole, however short. Applying the floor there would make coverage
 * suppress candidates that binary overlap accepts, which is the one thing this
 * rework must never do.
 */
export const MIN_REPAIR_SPAN_SECONDS = 300;

/**
 * Upper bound on canonical intervals loaded for a single proposal. Exceeding it
 * means the proposal spans an implausible number of trips, so coverage cannot
 * be proven and the proposal is AMBIGUOUS rather than silently mis-measured.
 */
export const MAX_CANONICAL_INTERVALS = 200;

// ── Interval algebra ─────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
}

/** Sorts and merges touching or overlapping spans. */
export function unionSpans(spans: Span[]): Span[] {
  const sorted = [...spans].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** Clips spans to [bounds.start, bounds.end], dropping anything outside. */
export function clipSpans(spans: Span[], bounds: Span): Span[] {
  return spans
    .map((s) => ({ start: Math.max(s.start, bounds.start), end: Math.min(s.end, bounds.end) }))
    .filter((s) => s.end > s.start);
}

/** bounds minus covers. Covers are assumed unioned and clipped. */
export function subtractSpans(bounds: Span, covers: Span[]): Span[] {
  const out: Span[] = [];
  let cursor = bounds.start;
  for (const cover of covers) {
    if (cover.start > cursor) out.push({ start: cursor, end: Math.min(cover.start, bounds.end) });
    cursor = Math.max(cursor, cover.end);
    if (cursor >= bounds.end) break;
  }
  if (cursor < bounds.end) out.push({ start: cursor, end: bounds.end });
  return out.filter((s) => s.end > s.start);
}

// ── Coverage ─────────────────────────────────────────────────────────────────

/**
 * Measures how much of [proposalStart, proposalEnd] canonical trips already
 * represent.
 *
 * Only the part of a trip that falls inside the proposal counts: a trip's
 * duration outside the proposal is not coverage of it. CANCELLED trips are not
 * coverage at all — a cancelled trip records that no trip happened.
 */
export function computeCoverage(
  proposalStart: Date,
  proposalEnd: Date,
  trips: CanonicalTripInterval[],
): CoverageMetrics {
  const bounds: Span = { start: proposalStart.getTime(), end: proposalEnd.getTime() };
  const durationMs = Math.max(0, bounds.end - bounds.start);

  const eligible = trips.filter(
    (t) =>
      t.tripStatus !== 'CANCELLED' &&
      t.endTime != null &&
      t.startTime.getTime() < bounds.end &&
      t.endTime.getTime() > bounds.start,
  );

  const covers = clipSpans(
    unionSpans(
      eligible.map((t) => ({ start: t.startTime.getTime(), end: (t.endTime as Date).getTime() })),
    ),
    bounds,
  );

  const coveredMs = covers.reduce((sum, s) => sum + (s.end - s.start), 0);
  const uncovered = durationMs > 0 ? subtractSpans(bounds, covers) : [];

  let prefixMs = 0;
  let suffixMs = 0;
  let interiorMs = 0;
  for (const span of uncovered) {
    const length = span.end - span.start;
    if (span.start === bounds.start) prefixMs += length;
    else if (span.end === bounds.end) suffixMs += length;
    else interiorMs += length;
  }

  const seconds = (ms: number) => Math.round(ms / 1000);

  return {
    proposalDurationSeconds: seconds(durationMs),
    coveredSeconds: seconds(coveredMs),
    coverageRatio: durationMs > 0 ? coveredMs / durationMs : 1,
    missingSeconds: seconds(durationMs - coveredMs),
    prefixMissingSeconds: seconds(prefixMs),
    suffixMissingSeconds: seconds(suffixMs),
    interiorMissingSeconds: seconds(interiorMs),
    longestUncoveredSpanSeconds: seconds(
      uncovered.reduce((max, span) => Math.max(max, span.end - span.start), 0),
    ),
    coveringTripCount: covers.length,
    uncoveredSpans: uncovered.map((s) => ({ start: new Date(s.start), end: new Date(s.end) })),
  };
}

/**
 * Classifies a proposal against canonical coverage and returns the spans that
 * remain worth repairing.
 *
 * An ONGOING trip that intersects the proposal makes the result AMBIGUOUS: its
 * end_time is a moving cursor, so neither "covered" nor "uncovered" can be
 * asserted about the time it will eventually claim.
 */
export function assessCoverage(
  proposalStart: Date,
  proposalEnd: Date,
  trips: CanonicalTripInterval[],
  options?: { canonicalSetTruncated?: boolean },
): CoverageAssessment {
  const boundsStart = proposalStart.getTime();
  const boundsEnd = proposalEnd.getTime();

  const intersecting = trips.filter(
    (t) => t.startTime.getTime() < boundsEnd && (t.endTime?.getTime() ?? Infinity) > boundsStart,
  );
  const metrics = computeCoverage(proposalStart, proposalEnd, trips);

  const emptyAssessment = (
    verdict: CoverageVerdict,
    ambiguousReason?: AmbiguousReason,
  ): CoverageAssessment => ({
    verdict,
    metrics,
    repairableSpans: [],
    intersectingTripIds: intersecting.map((t) => t.id),
    ...(ambiguousReason ? { ambiguousReason } : {}),
  });

  if (options?.canonicalSetTruncated) {
    return emptyAssessment('AMBIGUOUS', 'CANONICAL_SET_TRUNCATED');
  }

  const ongoing = intersecting.find((t) => t.endTime == null && t.tripStatus !== 'CANCELLED');
  if (ongoing) {
    return emptyAssessment('AMBIGUOUS', 'ONGOING_TRIP_INTERSECTS');
  }

  if (metrics.coveredSeconds === 0) {
    // Nothing is clipped away, so there is no fragment to guard against: the
    // proposal is returned exactly as it arrived.
    return {
      verdict: 'NOT_COVERED',
      metrics,
      repairableSpans: metrics.uncoveredSpans,
      intersectingTripIds: intersecting.map((t) => t.id),
    };
  }

  const repairableSpans = metrics.uncoveredSpans.filter(
    (span) => (span.end.getTime() - span.start.getTime()) / 1000 >= MIN_REPAIR_SPAN_SECONDS,
  );

  if (metrics.missingSeconds <= FULL_COVERAGE_SLACK_SECONDS) {
    return emptyAssessment('FULLY_COVERED');
  }

  if (
    metrics.coverageRatio >= SUBSTANTIAL_COVERAGE_RATIO &&
    metrics.longestUncoveredSpanSeconds < MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS
  ) {
    return emptyAssessment('SUBSTANTIALLY_COVERED');
  }

  return {
    verdict: 'PARTIALLY_COVERED',
    metrics,
    repairableSpans,
    intersectingTripIds: intersecting.map((t) => t.id),
  };
}

/**
 * Whether a verdict means "already represented, do not create a trip".
 *
 * AMBIGUOUS suppresses too: an unresolved ONGOING trip is a reason to wait, not
 * a licence to create a second trip over the same time.
 */
export function isSuppressingVerdict(verdict: CoverageVerdict): boolean {
  return (
    verdict === 'FULLY_COVERED' ||
    verdict === 'SUBSTANTIALLY_COVERED' ||
    verdict === 'AMBIGUOUS'
  );
}
