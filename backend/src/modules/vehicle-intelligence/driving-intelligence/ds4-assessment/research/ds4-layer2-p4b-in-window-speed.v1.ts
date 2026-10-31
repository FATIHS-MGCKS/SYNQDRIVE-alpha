import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4Layer2P4bWindowSpeedLimitationV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';

function normalizeLabelUtc(label: string): string {
  return label.endsWith('Z') ? label : `${label.replace(/(\.\d{3})\d+Z$/, '$1Z')}`;
}

function labelInInclusiveWindow(bucketLabelUtc: string, startLabel: string, endLabel: string): boolean {
  const b = normalizeLabelUtc(bucketLabelUtc);
  const s = normalizeLabelUtc(startLabel);
  const e = normalizeLabelUtc(endLabel);
  return b >= s && b <= e;
}

function isRepairInfluenced(repairState: string | null | undefined): boolean {
  if (repairState == null) return false;
  const s = repairState.toUpperCase();
  return s !== 'NONE' && s !== 'UNREPAIRED' && s !== '';
}

export function computeDs4Layer2P4bInWindowSpeedEvidenceV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  startLabel: string;
  endLabel: string;
  durationTier: string;
  steps: number | null;
  coverageRatio: number | null;
}): {
  windowMinSpeedKmh: number | null;
  windowMaxSpeedKmh: number | null;
  windowMeanSpeedKmh: number | null;
  windowSampleCount: number | null;
  windowExpectedSampleCount: number | null;
  windowCoverageRatio: number | null;
  repairInfluenced: boolean;
  limitations: Ds4Layer2P4bWindowSpeedLimitationV1[];
} {
  const limitations: Ds4Layer2P4bWindowSpeedLimitationV1[] = [];
  const speeds = input.payload.speeds ?? [];
  const numeric: number[] = [];
  let repairInfluenced = false;

  for (const row of speeds) {
    if (!labelInInclusiveWindow(row.bucketLabelUtc, input.startLabel, input.endLabel)) continue;
    if (row.speedKmh != null && Number.isFinite(row.speedKmh)) {
      numeric.push(row.speedKmh);
    }
  }

  for (const repair of input.payload.speedRepairs ?? []) {
    if (!labelInInclusiveWindow(repair.bucketLabelUtc, input.startLabel, input.endLabel)) continue;
    if (isRepairInfluenced(repair.repairState)) {
      repairInfluenced = true;
    }
  }

  const expected =
    input.steps != null && Number.isFinite(input.steps) ? Math.max(0, Math.floor(input.steps)) : null;

  if (input.durationTier === 'BIN_ONLY') {
    limitations.push('BIN_ONLY_SPARSE_SUPPORT');
  }

  if (numeric.length === 0) {
    limitations.push('NO_NUMERIC_SPEED_IN_WINDOW');
    return {
      windowMinSpeedKmh: null,
      windowMaxSpeedKmh: null,
      windowMeanSpeedKmh: null,
      windowSampleCount: 0,
      windowExpectedSampleCount: expected,
      windowCoverageRatio: expected && expected > 0 ? 0 : null,
      repairInfluenced,
      limitations,
    };
  }

  if (expected != null && numeric.length < expected) {
    limitations.push('INSUFFICIENT_SPEED_SAMPLES');
  }

  if (repairInfluenced) {
    limitations.push('REPAIR_INFLUENCED_SAMPLE');
  }

  const sum = numeric.reduce((a, b) => a + b, 0);
  const windowCoverageRatio =
    expected != null && expected > 0 ? numeric.length / expected : input.coverageRatio ?? null;

  return {
    windowMinSpeedKmh: Math.min(...numeric),
    windowMaxSpeedKmh: Math.max(...numeric),
    windowMeanSpeedKmh: sum / numeric.length,
    windowSampleCount: numeric.length,
    windowExpectedSampleCount: expected,
    windowCoverageRatio,
    repairInfluenced,
    limitations,
  };
}
