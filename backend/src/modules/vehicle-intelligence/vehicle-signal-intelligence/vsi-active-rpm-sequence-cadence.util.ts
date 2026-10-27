import {
  medianSeconds,
  VSI_CADENCE_MIN_INTERVAL_SAMPLES,
} from './vsi-profile-cadence-stats.util';

/**
 * Upper bound for dense ~1–2 s spacing medians within an active sequence (not native Hz).
 * Production replay: sustained Tiguan fast runs median ≤1.5 s; Audi sparse bursts median ≈2 s
 * with 3 s samples mixed in.
 */
export const VSI_ACTIVE_RPM_FAST_MEDIAN_MAX_SECONDS = 1.5;
/** Audi-aligned sparse active-sequence median band (production replay P25 ≈ 3 s). */
export const VSI_ACTIVE_RPM_SPARSE_MEDIAN_MIN_SECONDS = 3;
export const VSI_ACTIVE_RPM_FAST_FRACTION_LE2_MIN = 0.7;

/**
 * Gaps strictly above this threshold break active RPM measurement sequences.
 * Production replay: Tiguan/Audi active spacing stays ≤6 s inside a run; inter-run
 * silences cluster at ≥8 s (P95 sparse gate band).
 */
export const VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS = 8;

/** Minimum intra-sequence intervals before a sequence contributes evidence. */
export const VSI_ACTIVE_RPM_MIN_SEQUENCE_INTERVALS = 4;

/**
 * Minimum intervals inside one fast sequence to treat it as sustained ~1–2 s cadence
 * (b373 stable fast trip: longest fast runs ≫ this; Audi bursts stay shorter).
 */
export const VSI_ACTIVE_RPM_MIN_FAST_SEQUENCE_INTERVALS = 9;

/** Qualifying fast sequences required for per-trip RPM_1HZ. */
export const VSI_ACTIVE_RPM_MIN_QUALIFYING_FAST_SEQUENCES = 1;

export type VsiActiveRpmMeasurementSequence = {
  intervalsSec: number[];
  intervalMedianSeconds: number | null;
  fractionIntervalsLe2s: number | null;
  isFastCadence: boolean;
  isSlowCadence: boolean;
};

function fractionLe(seconds: number[], threshold: number): number | null {
  if (seconds.length === 0) return null;
  return seconds.filter((s) => s <= threshold).length / seconds.length;
}

export function splitIntervalsIntoActiveMeasurementSequences(
  intervalsSec: readonly number[],
  gapBreakSeconds = VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS,
): number[][] {
  const sequences: number[][] = [];
  let current: number[] = [];
  for (const gap of intervalsSec) {
    if (gap > gapBreakSeconds) {
      if (current.length > 0) {
        sequences.push(current);
        current = [];
      }
      continue;
    }
    current.push(gap);
  }
  if (current.length > 0) {
    sequences.push(current);
  }
  return sequences;
}

export function analyzeActiveRpmMeasurementSequence(
  intervalsSec: readonly number[],
): VsiActiveRpmMeasurementSequence {
  const med = medianSeconds([...intervalsSec]);
  const fracLe2 = fractionLe([...intervalsSec], 2);
  const isFastCadence =
    med != null &&
    med <= VSI_ACTIVE_RPM_FAST_MEDIAN_MAX_SECONDS &&
    (fracLe2 ?? 0) >= VSI_ACTIVE_RPM_FAST_FRACTION_LE2_MIN;
  const isSlowCadence =
    med != null &&
    (med >= VSI_ACTIVE_RPM_SPARSE_MEDIAN_MIN_SECONDS ||
      (med >= 2 && (fracLe2 ?? 0) < VSI_ACTIVE_RPM_FAST_FRACTION_LE2_MIN));
  return {
    intervalsSec: [...intervalsSec],
    intervalMedianSeconds: med,
    fractionIntervalsLe2s: fracLe2,
    isFastCadence,
    isSlowCadence,
  };
}

export type VsiActiveRpmSequenceCadenceEvidence = {
  sequences: VsiActiveRpmMeasurementSequence[];
  qualifyingFastSequenceCount: number;
  qualifyingSlowSequenceCount: number;
  activeIntervalCount: number;
  fastActiveIntervalCount: number;
};

export function summarizeTripActiveIntervalCadence(intervalsSec: readonly number[]): {
  activeIntervalCount: number;
  intervalMedianSeconds: number | null;
  fractionIntervalsLe2s: number | null;
} {
  const active = intervalsSec.filter(
    (s) => s <= VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS,
  );
  return {
    activeIntervalCount: active.length,
    intervalMedianSeconds: medianSeconds(active),
    fractionIntervalsLe2s: fractionLe(active, 2),
  };
}

/** Trip-level active cadence corroboration for RPM_1HZ (excludes inter-sequence silences). */
export const VSI_ACTIVE_RPM_TRIP_ACTIVE_FAST_MEDIAN_MAX_SECONDS = 1.5;
/** Tiguan fast production replay (7e72506d): active ≤2s fraction ≈0.79; b373 ≈0.89. */
export const VSI_ACTIVE_RPM_TRIP_ACTIVE_FAST_FRACTION_LE2_MIN = 0.78;

/**
 * Trip-level corroboration for RPM_1HZ.
 * When qualifying fast sequences already strictly dominate active intervals, the
 * trip-wide ≤2s fraction gate is redundant (sequence-level fast rules apply);
 * only the active median and sample floor are required.
 */
export function tripActiveCadenceSupportsFastProfile(
  intervalsSec: readonly number[],
  options?: { strictFastIntervalDominance?: boolean },
): boolean {
  const active = summarizeTripActiveIntervalCadence(intervalsSec);
  if (
    active.activeIntervalCount < VSI_CADENCE_MIN_INTERVAL_SAMPLES ||
    active.intervalMedianSeconds == null ||
    active.intervalMedianSeconds > VSI_ACTIVE_RPM_TRIP_ACTIVE_FAST_MEDIAN_MAX_SECONDS
  ) {
    return false;
  }
  if (options?.strictFastIntervalDominance) {
    return true;
  }
  return (
    (active.fractionIntervalsLe2s ?? 0) >= VSI_ACTIVE_RPM_TRIP_ACTIVE_FAST_FRACTION_LE2_MIN
  );
}

export function summarizeActiveRpmSequenceCadence(
  intervalsSec: readonly number[],
): VsiActiveRpmSequenceCadenceEvidence {
  const rawSequences = splitIntervalsIntoActiveMeasurementSequences(intervalsSec);
  const sequences: VsiActiveRpmMeasurementSequence[] = [];
  let qualifyingFastSequenceCount = 0;
  let qualifyingSlowSequenceCount = 0;
  let activeIntervalCount = 0;
  let fastActiveIntervalCount = 0;

  for (const seqIntervals of rawSequences) {
    if (seqIntervals.length < VSI_ACTIVE_RPM_MIN_SEQUENCE_INTERVALS) {
      continue;
    }
    const analyzed = analyzeActiveRpmMeasurementSequence(seqIntervals);
    sequences.push(analyzed);
    activeIntervalCount += seqIntervals.length;

    if (
      analyzed.isFastCadence &&
      seqIntervals.length >= VSI_ACTIVE_RPM_MIN_FAST_SEQUENCE_INTERVALS
    ) {
      qualifyingFastSequenceCount += 1;
      fastActiveIntervalCount += seqIntervals.length;
    }
    if (analyzed.isSlowCadence && seqIntervals.length >= VSI_CADENCE_MIN_INTERVAL_SAMPLES) {
      qualifyingSlowSequenceCount += 1;
    }
  }

  return {
    sequences,
    qualifyingFastSequenceCount,
    qualifyingSlowSequenceCount,
    activeIntervalCount,
    fastActiveIntervalCount,
  };
}
