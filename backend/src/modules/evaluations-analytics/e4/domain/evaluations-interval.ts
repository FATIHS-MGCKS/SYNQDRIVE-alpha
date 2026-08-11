/**
 * E4 pure interval algebra (framework-free, deterministic).
 *
 * All intervals use half-open `[startMs, endExclusiveMs)` semantics on absolute
 * UTC millisecond instants. Because durations are computed on absolute instants,
 * DST transitions are handled correctly by construction: a 23-hour or 25-hour
 * local day is simply the real elapsed milliseconds between the two UTC instants.
 *
 * Invariants enforced here (and covered by unit fixtures):
 *  - intervals are clipped to the requested period (no time outside the period),
 *  - overlapping intervals are unioned before duration is summed (no double
 *    counting → OVERLAPPING_INTERVAL_DOUBLE_COUNT_COUNT = 0),
 *  - a summed occupied duration can never exceed the clipped capacity
 *    (→ UTILIZATION_OVER_100_COUNT = 0 downstream).
 */

export interface EvaluationsInterval {
  readonly startMs: number;
  readonly endExclusiveMs: number;
}

/** True when the interval is a valid, positive-length half-open interval. */
export function isValidInterval(interval: EvaluationsInterval): boolean {
  return (
    Number.isFinite(interval.startMs) &&
    Number.isFinite(interval.endExclusiveMs) &&
    interval.endExclusiveMs > interval.startMs
  );
}

/**
 * Clip a single interval to `[periodStartMs, periodEndExclusiveMs)`.
 * Returns null when the interval is invalid or does not intersect the period.
 */
export function clipInterval(
  interval: EvaluationsInterval,
  periodStartMs: number,
  periodEndExclusiveMs: number,
): EvaluationsInterval | null {
  if (!isValidInterval(interval)) return null;
  if (periodEndExclusiveMs <= periodStartMs) return null;
  const startMs = Math.max(interval.startMs, periodStartMs);
  const endExclusiveMs = Math.min(interval.endExclusiveMs, periodEndExclusiveMs);
  if (endExclusiveMs <= startMs) return null;
  return { startMs, endExclusiveMs };
}

/** Clip every interval to the period, dropping non-intersecting/invalid ones. */
export function clipIntervals(
  intervals: readonly EvaluationsInterval[],
  periodStartMs: number,
  periodEndExclusiveMs: number,
): EvaluationsInterval[] {
  const out: EvaluationsInterval[] = [];
  for (const interval of intervals) {
    const clipped = clipInterval(interval, periodStartMs, periodEndExclusiveMs);
    if (clipped) out.push(clipped);
  }
  return out;
}

/**
 * Union overlapping/adjacent intervals into a minimal disjoint, sorted set.
 * Deterministic: sorted by start then end, so identical inputs always yield an
 * identical result.
 */
export function mergeIntervals(
  intervals: readonly EvaluationsInterval[],
): EvaluationsInterval[] {
  const valid = intervals.filter(isValidInterval);
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) =>
    a.startMs !== b.startMs ? a.startMs - b.startMs : a.endExclusiveMs - b.endExclusiveMs,
  );
  const merged: EvaluationsInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.startMs <= last.endExclusiveMs) {
      // Overlap or adjacency → extend the running union.
      if (current.endExclusiveMs > last.endExclusiveMs) {
        merged[merged.length - 1] = {
          startMs: last.startMs,
          endExclusiveMs: current.endExclusiveMs,
        };
      }
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Total covered duration of a set after unioning overlaps (no double counting). */
export function unionDurationMs(intervals: readonly EvaluationsInterval[]): number {
  return mergeIntervals(intervals).reduce(
    (acc, interval) => acc + (interval.endExclusiveMs - interval.startMs),
    0,
  );
}

/**
 * Count of pairwise overlaps in the raw (unmerged) set. Used to surface data
 * anomalies (e.g. overlapping realized bookings on one vehicle) without letting
 * them inflate a duration.
 */
export function countOverlappingPairs(
  intervals: readonly EvaluationsInterval[],
): number {
  const valid = intervals.filter(isValidInterval).sort((a, b) => a.startMs - b.startMs);
  let overlaps = 0;
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      if (valid[j].startMs >= valid[i].endExclusiveMs) break;
      overlaps += 1;
    }
  }
  return overlaps;
}

/**
 * Duration of `base` that is NOT covered by any interval in `subtract`.
 * Both sides are unioned first, so the result is overlap-safe and never negative.
 */
export function subtractDurationMs(
  base: readonly EvaluationsInterval[],
  subtract: readonly EvaluationsInterval[],
): number {
  const baseMerged = mergeIntervals(base);
  const subMerged = mergeIntervals(subtract);
  let remaining = 0;
  for (const b of baseMerged) {
    let cursor = b.startMs;
    for (const s of subMerged) {
      if (s.endExclusiveMs <= cursor) continue;
      if (s.startMs >= b.endExclusiveMs) break;
      if (s.startMs > cursor) remaining += s.startMs - cursor;
      cursor = Math.max(cursor, s.endExclusiveMs);
      if (cursor >= b.endExclusiveMs) break;
    }
    if (cursor < b.endExclusiveMs) remaining += b.endExclusiveMs - cursor;
  }
  return remaining;
}

/** Portion of `base` intervals that overlaps `mask` (unioned, overlap-safe). */
export function intersectDurationMs(
  base: readonly EvaluationsInterval[],
  mask: readonly EvaluationsInterval[],
): number {
  const baseUnion = unionDurationMs(base);
  return baseUnion - subtractDurationMs(base, mask);
}
