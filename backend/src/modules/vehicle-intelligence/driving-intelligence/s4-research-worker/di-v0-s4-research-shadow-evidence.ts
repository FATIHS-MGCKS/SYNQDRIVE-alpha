export type DiV0S4ResearchShadowBucketEvidence = {
  l3SpeedKmh: number | null;
  motionState: string | null;
  qcTrustLevel: string | null;
};

export function shadowBucketKeyFromIntervalStart(intervalStart: Date): string {
  return intervalStart.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildShadowEvidenceByBucket(
  intervals: ReadonlyArray<{
    intervalStart: Date;
    estimatedSpeedKmh: number | null;
    motionState: string;
    speedEvidenceState: string | null;
    valueConfidence: string | null;
  }>,
): Map<string, DiV0S4ResearchShadowBucketEvidence> {
  const map = new Map<string, DiV0S4ResearchShadowBucketEvidence>();
  for (const iv of intervals) {
    const key = shadowBucketKeyFromIntervalStart(iv.intervalStart);
    map.set(key, {
      l3SpeedKmh: iv.estimatedSpeedKmh,
      motionState: iv.motionState ?? null,
      qcTrustLevel: iv.speedEvidenceState ?? iv.valueConfidence ?? null,
    });
  }
  return map;
}

export function summarizeShadowEvidenceCompleteness(
  bucketLabels: readonly string[],
  shadow: ReadonlyMap<string, DiV0S4ResearchShadowBucketEvidence>,
): {
  shadowL3Present: boolean;
  shadowMotionPresent: boolean;
  shadowQcPresent: boolean;
  evidenceIncomplete: boolean;
} {
  if (bucketLabels.length === 0) {
    return { shadowL3Present: false, shadowMotionPresent: false, shadowQcPresent: false, evidenceIncomplete: true };
  }
  let l3 = 0;
  let motion = 0;
  let qc = 0;
  for (const label of bucketLabels) {
    const row = shadow.get(label);
    if (!row) continue;
    if (row.l3SpeedKmh != null) l3 += 1;
    if (row.motionState != null) motion += 1;
    if (row.qcTrustLevel != null) qc += 1;
  }
  const shadowL3Present = l3 > 0;
  const shadowMotionPresent = motion > 0;
  const shadowQcPresent = qc > 0;
  return {
    shadowL3Present,
    shadowMotionPresent,
    shadowQcPresent,
    evidenceIncomplete: !shadowL3Present || !shadowMotionPresent || !shadowQcPresent,
  };
}
