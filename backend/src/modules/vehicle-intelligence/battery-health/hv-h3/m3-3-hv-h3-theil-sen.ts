export interface TheilSenPoint {
  /** Elapsed whole days from series anchor (first point time). */
  xDays: number;
  y: number;
  observedAtIso: string;
}

export interface TheilSenResult {
  trendAvailability: 'NO_DATA' | 'INSUFFICIENT_DISTINCT_TIMEPOINTS' | 'DESCRIPTIVE_SLOPE_AVAILABLE';
  trendSlopePerDay: number | null;
  trendIntercept: number | null;
  fittedAtSeriesStart: number | null;
  fittedAtSeriesEnd: number | null;
  pairwiseSlopeCount: number;
  distinctTimestampCount: number;
  timeSpanDays: number;
  residualMedian: number | null;
  residualMad: number | null;
  medianAbsoluteStepChange: number | null;
  medianValue: number | null;
  minValue: number | null;
  maxValue: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function mad(values: number[], center: number): number | null {
  if (values.length === 0) return null;
  const deviations = values.map((v) => Math.abs(v - center));
  return median(deviations);
}

/**
 * Deterministic Theil–Sen median pairwise slope on calendar elapsed days.
 * Excludes pairs with zero time delta (same timestamp).
 */
export function computeTheilSenMedianPairwiseSlopeV1(
  points: TheilSenPoint[],
): TheilSenResult {
  const empty: TheilSenResult = {
    trendAvailability: 'NO_DATA',
    trendSlopePerDay: null,
    trendIntercept: null,
    fittedAtSeriesStart: null,
    fittedAtSeriesEnd: null,
    pairwiseSlopeCount: 0,
    distinctTimestampCount: 0,
    timeSpanDays: 0,
    residualMedian: null,
    residualMad: null,
    medianAbsoluteStepChange: null,
    medianValue: null,
    minValue: null,
    maxValue: null,
  };

  if (points.length === 0) return empty;

  const ys = points.map((p) => p.y).filter((y) => Number.isFinite(y));
  if (ys.length === 0) return empty;

  const distinctTimestamps = new Set(points.map((p) => p.observedAtIso));
  const distinctTimestampCount = distinctTimestamps.size;

  const minX = Math.min(...points.map((p) => p.xDays));
  const maxX = Math.max(...points.map((p) => p.xDays));
  const timeSpanDays = maxX - minX;

  const minValue = Math.min(...ys);
  const maxValue = Math.max(...ys);
  const medianValue = median(ys);

  if (distinctTimestampCount < 2) {
    return {
      ...empty,
      trendAvailability: 'INSUFFICIENT_DISTINCT_TIMEPOINTS',
      distinctTimestampCount,
      timeSpanDays,
      medianValue,
      minValue,
      maxValue,
    };
  }

  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pi = points[i]!;
      const pj = points[j]!;
      const dx = pj.xDays - pi.xDays;
      if (dx === 0) continue;
      const slope = (pj.y - pi.y) / dx;
      if (Number.isFinite(slope)) slopes.push(slope);
    }
  }

  if (slopes.length === 0) {
    return {
      ...empty,
      trendAvailability: 'INSUFFICIENT_DISTINCT_TIMEPOINTS',
      distinctTimestampCount,
      timeSpanDays,
      medianValue,
      minValue,
      maxValue,
    };
  }

  const trendSlopePerDay = median(slopes);
  if (trendSlopePerDay == null || !Number.isFinite(trendSlopePerDay)) {
    return {
      ...empty,
      trendAvailability: 'INSUFFICIENT_DISTINCT_TIMEPOINTS',
      distinctTimestampCount,
      timeSpanDays,
      medianValue,
      minValue,
      maxValue,
      pairwiseSlopeCount: slopes.length,
    };
  }

  const interceptCandidates = points.map((p) => p.y - trendSlopePerDay * p.xDays);
  const trendIntercept = median(interceptCandidates);

  const fittedAtSeriesStart =
    trendIntercept != null ? trendIntercept + trendSlopePerDay * minX : null;
  const fittedAtSeriesEnd =
    trendIntercept != null ? trendIntercept + trendSlopePerDay * maxX : null;

  let residualMedian: number | null = null;
  let residualMad: number | null = null;
  if (trendIntercept != null && points.length >= 3) {
    const residuals = points.map(
      (p) => p.y - (trendIntercept + trendSlopePerDay * p.xDays),
    );
    residualMedian = median(residuals);
    if (residualMedian != null) {
      residualMad = mad(residuals, residualMedian);
    }
  }

  const sortedByTime = [...points].sort((a, b) => a.xDays - b.xDays);
  const stepChanges: number[] = [];
  for (let i = 1; i < sortedByTime.length; i++) {
    stepChanges.push(Math.abs(sortedByTime[i]!.y - sortedByTime[i - 1]!.y));
  }
  const medianAbsoluteStepChange = stepChanges.length > 0 ? median(stepChanges) : null;

  return {
    trendAvailability: 'DESCRIPTIVE_SLOPE_AVAILABLE',
    trendSlopePerDay,
    trendIntercept,
    fittedAtSeriesStart,
    fittedAtSeriesEnd,
    pairwiseSlopeCount: slopes.length,
    distinctTimestampCount,
    timeSpanDays,
    residualMedian,
    residualMad,
    medianAbsoluteStepChange,
    medianValue,
    minValue,
    maxValue,
  };
}

export function toElapsedDaysFromAnchor(
  anchorMs: number,
  observedAtIso: string,
): number {
  const t = Date.parse(observedAtIso);
  if (!Number.isFinite(t)) return NaN;
  return (t - anchorMs) / 86_400_000;
}
