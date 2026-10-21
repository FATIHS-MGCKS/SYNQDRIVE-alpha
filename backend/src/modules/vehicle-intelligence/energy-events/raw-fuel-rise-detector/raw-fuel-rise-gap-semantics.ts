import { maxGapSeconds } from './raw-fuel-rise-normalizer';

/** Evidence regions for gap semantics (F10.6.6-A). Bridge regions tolerate provider sparsity. */
export type RawFuelRiseSemanticGapRegion =
  | 'PRE_PLATEAU_INTERNAL'
  | 'PRE_TO_RISE_BRIDGE'
  | 'RISE_INTERNAL'
  | 'RISE_TO_POST_BRIDGE'
  | 'POST_PLATEAU_INTERNAL';

export interface RawFuelRiseGapPoint {
  timestamp: Date;
}

export interface RawFuelRiseSemanticGapEvaluation {
  /** Largest inter-sample gap inside PRE, RISE, or POST strict regions. */
  strictMaxGapSeconds: number;
  /** Largest gap on concatenated critical path (audit / persisted diagnostic). */
  globalMaxGapSeconds: number;
  /** Strict region whose internal gap exceeded the limit, if any. */
  failedStrictRegion: RawFuelRiseSemanticGapRegion | null;
  preToRiseBridgeGapSeconds: number;
  riseToPostBridgeGapSeconds: number | null;
}

function bridgeGapSeconds(
  earlier: RawFuelRiseGapPoint | undefined,
  later: RawFuelRiseGapPoint | undefined,
): number {
  if (!earlier || !later) return 0;
  return Math.round(
    (later.timestamp.getTime() - earlier.timestamp.getTime()) / 1000,
  );
}

/**
 * Strict continuity is required only inside stable PRE, material RISE, and stable POST.
 * PRE→RISE and RISE→POST bridges may be sparse without failing readiness when strict
 * regions themselves are valid.
 */
export function evaluateRawFuelRiseSemanticGaps(input: {
  preSamples: RawFuelRiseGapPoint[];
  risePoints: RawFuelRiseGapPoint[];
  postSamples: RawFuelRiseGapPoint[];
  maxSampleGapMs: number;
}): RawFuelRiseSemanticGapEvaluation {
  const { preSamples, risePoints, postSamples, maxSampleGapMs } = input;
  const limitSeconds = maxSampleGapMs / 1000;

  const preInternal = maxGapSeconds(preSamples);
  const riseInternal = maxGapSeconds(risePoints);
  const postInternal = postSamples.length > 0 ? maxGapSeconds(postSamples) : 0;

  const preToRiseBridgeGapSeconds = bridgeGapSeconds(
    preSamples[preSamples.length - 1],
    risePoints[0],
  );
  const riseToPostBridgeGapSeconds =
    postSamples.length > 0
      ? bridgeGapSeconds(risePoints[risePoints.length - 1], postSamples[0])
      : null;

  const criticalPath = [...preSamples, ...risePoints, ...postSamples];
  const globalMaxGapSeconds = maxGapSeconds(criticalPath);

  const strictChecks: Array<{ region: RawFuelRiseSemanticGapRegion; gapSeconds: number }> =
    [
      { region: 'PRE_PLATEAU_INTERNAL', gapSeconds: preInternal },
      { region: 'RISE_INTERNAL', gapSeconds: riseInternal },
    ];
  if (postSamples.length >= 2) {
    strictChecks.push({ region: 'POST_PLATEAU_INTERNAL', gapSeconds: postInternal });
  }

  let failedStrictRegion: RawFuelRiseSemanticGapRegion | null = null;
  let strictMaxGapSeconds = 0;
  for (const check of strictChecks) {
    if (check.gapSeconds > strictMaxGapSeconds) {
      strictMaxGapSeconds = check.gapSeconds;
    }
    if (!failedStrictRegion && check.gapSeconds > limitSeconds) {
      failedStrictRegion = check.region;
    }
  }

  return {
    strictMaxGapSeconds,
    globalMaxGapSeconds,
    failedStrictRegion,
    preToRiseBridgeGapSeconds,
    riseToPostBridgeGapSeconds,
  };
}

export function isStrictSampleGapWithinLimit(
  evaluation: RawFuelRiseSemanticGapEvaluation,
  maxSampleGapMs: number,
): boolean {
  return evaluation.failedStrictRegion == null && evaluation.strictMaxGapSeconds * 1000 <= maxSampleGapMs;
}
