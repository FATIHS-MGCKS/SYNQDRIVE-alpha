import {
  HV_M2_SESSION_SUMMARY_GATE_REASONS,
  HV_M2_SESSION_SUMMARY_GATE_VERSION,
  HV_M2_SESSION_SUMMARY_MAX_CV,
  HV_M2_SESSION_SUMMARY_MAX_DOMINANT_DUPLICATE_RATIO,
  HV_M2_SESSION_SUMMARY_MAX_PROVIDER_GAPS,
  HV_M2_SESSION_SUMMARY_MIN_PREFERRED_SOC_SAMPLES,
  HV_M2_SESSION_SUMMARY_MIN_SOC_SPAN_PERCENT,
  HV_M2_SESSION_SUMMARY_MIN_VALID_SAMPLES,
  HV_M2_SESSION_SUMMARY_MODEL_VERSION,
  HV_M2_SESSION_SUMMARY_PROVIDER_GAP_MS,
  HV_M2_SESSION_SUMMARY_STATUSES,
  type AggregateHvCapacitySessionSummaryInput,
  type HvCapacitySessionSummary,
  type HvCapacitySessionSummaryInputObservation,
  type HvCapacitySessionSummaryStats,
  type HvM2SessionSummaryGateReasonCode,
} from './hv-capacity-session-summary.types';

const MAD_NORMAL_CONSISTENCY_FACTOR = 1.4826;

function isValidObservation(row: HvCapacitySessionSummaryInputObservation): boolean {
  return (
    !row.outlier &&
    row.quality === 'SHADOW' &&
    Number.isFinite(row.estimatedCapacityKwh) &&
    row.estimatedCapacityKwh > 0
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];

  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mad(values: number[], center: number): number | null {
  if (values.length === 0) return null;
  const deviations = values.map((value) => Math.abs(value - center));
  return median(deviations);
}

function countProviderGaps(
  observations: HvCapacitySessionSummaryInputObservation[],
  minGapThresholdMs: number,
): { gapCount: number; maxGapMs: number | null } {
  if (observations.length < 2) {
    return { gapCount: 0, maxGapMs: null };
  }

  const sorted = [...observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );

  const intervals: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    intervals.push(
      sorted[index].observedAt.getTime() - sorted[index - 1].observedAt.getTime(),
    );
  }

  const medianInterval = median(intervals) ?? minGapThresholdMs;
  const gapThresholdMs = Math.max(minGapThresholdMs, medianInterval * 3);

  let gapCount = 0;
  let maxGapMs: number | null = null;

  for (const gapMs of intervals) {
    if (gapMs > gapThresholdMs) {
      gapCount += 1;
      maxGapMs = maxGapMs == null ? gapMs : Math.max(maxGapMs, gapMs);
    }
  }

  return { gapCount, maxGapMs };
}

function dominantDuplicateRatio(
  observations: HvCapacitySessionSummaryInputObservation[],
): number | null {
  if (observations.length === 0) return null;

  const counts = new Map<number, number>();
  for (const row of observations) {
    const key = row.observedAt.getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const maxCount = Math.max(...counts.values());
  return maxCount / observations.length;
}

export function computeHvCapacitySessionSummaryStats(input: {
  observations: HvCapacitySessionSummaryInputObservation[];
  sessionStartAt: Date;
  sessionEndAt: Date | null;
  providerGapThresholdMs?: number;
}): HvCapacitySessionSummaryStats {
  const {
    observations,
    sessionStartAt,
    sessionEndAt,
    providerGapThresholdMs = HV_M2_SESSION_SUMMARY_PROVIDER_GAP_MS,
  } = input;

  const valid = observations.filter(isValidObservation);
  const values = valid.map((row) => row.estimatedCapacityKwh);
  const center = median(values);
  const madValue = center == null ? null : mad(values, center);
  const robustSpread =
    madValue == null ? null : madValue * MAD_NORMAL_CONSISTENCY_FACTOR;
  const coefficientOfVariation =
    center != null && center > 0 && madValue != null ? madValue / center : null;

  const preferredValid = valid.filter((row) => row.preferredSocBand);
  const socValues = valid.map((row) => row.socPercent);
  const minSoc = socValues.length > 0 ? Math.min(...socValues) : null;
  const maxSoc = socValues.length > 0 ? Math.max(...socValues) : null;

  const sortedValid = [...valid].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const firstObservedAt = sortedValid[0]?.observedAt ?? null;
  const lastObservedAt = sortedValid[sortedValid.length - 1]?.observedAt ?? null;
  const temporalSpanMs =
    firstObservedAt && lastObservedAt
      ? lastObservedAt.getTime() - firstObservedAt.getTime()
      : null;
  const sessionDurationMs =
    sessionEndAt != null
      ? Math.max(0, sessionEndAt.getTime() - sessionStartAt.getTime())
      : null;
  const temporalCoverageRatio =
    temporalSpanMs != null && sessionDurationMs != null && sessionDurationMs > 0
      ? Math.min(1, temporalSpanMs / sessionDurationMs)
      : null;

  const { gapCount, maxGapMs } = countProviderGaps(valid, providerGapThresholdMs);

  return {
    validSampleCount: valid.length,
    totalSampleCount: observations.length,
    outlierCount: observations.filter((row) => row.outlier).length,
    medianCapacityKwh: center,
    p10CapacityKwh: percentile(values, 10),
    p90CapacityKwh: percentile(values, 90),
    madKwh: madValue,
    robustSpreadKwh: robustSpread,
    coefficientOfVariation,
    minSocPercent: minSoc,
    maxSocPercent: maxSoc,
    preferredBandSampleCount: preferredValid.length,
    socSpanPercent:
      minSoc != null && maxSoc != null ? maxSoc - minSoc : null,
    temporalCoverageRatio,
    temporalSpanMs,
    providerGapCount: gapCount,
    maxProviderGapMs: maxGapMs,
    dominantDuplicateRatio: dominantDuplicateRatio(valid),
  };
}

export function evaluateHvCapacitySessionSummaryGates(input: {
  stats: HvCapacitySessionSummaryStats;
  session: AggregateHvCapacitySessionSummaryInput['session'];
  maxCv?: number;
}): {
  shadowGatePassed: boolean;
  gateReasonCodes: HvM2SessionSummaryGateReasonCode[];
} {
  const gateReasonCodes: HvM2SessionSummaryGateReasonCode[] = [];
  const maxCv = input.maxCv ?? HV_M2_SESSION_SUMMARY_MAX_CV;

  if (input.session.isOngoing) {
    gateReasonCodes.push(HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_ONGOING);
  }
  if (!input.session.capacityShadowEligible) {
    gateReasonCodes.push(HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_NOT_QUALIFIED);
  }

  if (input.stats.validSampleCount === 0) {
    gateReasonCodes.push(HV_M2_SESSION_SUMMARY_GATE_REASONS.NO_VALID_SAMPLES);
  } else if (input.stats.validSampleCount < HV_M2_SESSION_SUMMARY_MIN_VALID_SAMPLES) {
    gateReasonCodes.push(
      HV_M2_SESSION_SUMMARY_GATE_REASONS.INSUFFICIENT_VALID_SAMPLES,
    );
  }

  if (
    input.stats.preferredBandSampleCount <
    HV_M2_SESSION_SUMMARY_MIN_PREFERRED_SOC_SAMPLES
  ) {
    gateReasonCodes.push(
      HV_M2_SESSION_SUMMARY_GATE_REASONS.INSUFFICIENT_PREFERRED_SOC_SAMPLES,
    );
  }

  if (
    input.stats.socSpanPercent == null ||
    input.stats.socSpanPercent < HV_M2_SESSION_SUMMARY_MIN_SOC_SPAN_PERCENT
  ) {
    gateReasonCodes.push(HV_M2_SESSION_SUMMARY_GATE_REASONS.INSUFFICIENT_SOC_SPAN);
  }

  if (
    input.stats.coefficientOfVariation != null &&
    input.stats.coefficientOfVariation > maxCv
  ) {
    gateReasonCodes.push(HV_M2_SESSION_SUMMARY_GATE_REASONS.CV_ABOVE_SHADOW_LIMIT);
  }

  if (
    input.stats.dominantDuplicateRatio != null &&
    input.stats.dominantDuplicateRatio > HV_M2_SESSION_SUMMARY_MAX_DOMINANT_DUPLICATE_RATIO
  ) {
    gateReasonCodes.push(
      HV_M2_SESSION_SUMMARY_GATE_REASONS.DOMINANT_DUPLICATE_TIMESTAMPS,
    );
  }

  if (input.stats.providerGapCount > HV_M2_SESSION_SUMMARY_MAX_PROVIDER_GAPS) {
    gateReasonCodes.push(HV_M2_SESSION_SUMMARY_GATE_REASONS.EXCESSIVE_PROVIDER_GAPS);
  }

  const disqualifying = new Set<HvM2SessionSummaryGateReasonCode>([
    HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_ONGOING,
    HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_NOT_QUALIFIED,
    HV_M2_SESSION_SUMMARY_GATE_REASONS.NO_VALID_SAMPLES,
  ]);

  const hasDisqualifier = gateReasonCodes.some((code) => disqualifying.has(code));
  const shadowGatePassed = !hasDisqualifier && gateReasonCodes.length === 0;

  return { shadowGatePassed, gateReasonCodes };
}

export function resolveHvCapacitySessionSummaryStatus(input: {
  shadowGatePassed: boolean;
  gateReasonCodes: HvM2SessionSummaryGateReasonCode[];
  stats: HvCapacitySessionSummaryStats;
}): HvCapacitySessionSummary['status'] {
  const disqualifying = new Set<HvM2SessionSummaryGateReasonCode>([
    HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_ONGOING,
    HV_M2_SESSION_SUMMARY_GATE_REASONS.SESSION_NOT_QUALIFIED,
    HV_M2_SESSION_SUMMARY_GATE_REASONS.NO_VALID_SAMPLES,
  ]);

  if (input.gateReasonCodes.some((code) => disqualifying.has(code))) {
    return HV_M2_SESSION_SUMMARY_STATUSES.DISQUALIFIED;
  }

  if (input.shadowGatePassed) {
    return HV_M2_SESSION_SUMMARY_STATUSES.STABLE_SHADOW;
  }

  if (input.stats.validSampleCount < HV_M2_SESSION_SUMMARY_MIN_VALID_SAMPLES) {
    return HV_M2_SESSION_SUMMARY_STATUSES.INSUFFICIENT;
  }

  return HV_M2_SESSION_SUMMARY_STATUSES.UNSTABLE_SHADOW;
}

export function aggregateHvCapacitySessionSummary(
  input: AggregateHvCapacitySessionSummaryInput,
): HvCapacitySessionSummary {
  const computedAt = input.computedAt ?? new Date();
  const stats = computeHvCapacitySessionSummaryStats({
    observations: input.observations,
    sessionStartAt: input.session.sessionStartAt,
    sessionEndAt: input.session.sessionEndAt,
  });
  const gates = evaluateHvCapacitySessionSummaryGates({
    stats,
    session: input.session,
  });
  const status = resolveHvCapacitySessionSummaryStatus({
    shadowGatePassed: gates.shadowGatePassed,
    gateReasonCodes: gates.gateReasonCodes,
    stats,
  });

  return {
    method: input.method,
    gateVersion: input.gateVersion ?? HV_M2_SESSION_SUMMARY_GATE_VERSION,
    modelVersion: input.modelVersion ?? HV_M2_SESSION_SUMMARY_MODEL_VERSION,
    computedAt: computedAt.toISOString(),
    status,
    shadowGatePassed: gates.shadowGatePassed,
    gateReasonCodes: gates.gateReasonCodes,
    stats,
  };
}
