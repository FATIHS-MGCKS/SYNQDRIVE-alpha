/**
 * EXP021 stationary prototype v2 — corrected evaluation order and video cross-tabs.
 */
import type { EvGroundTruthPerSecondRow } from './exp021-ev-ground-truth-baseline.lib';
import type { EvGtForensicBucketExport } from './exp021-ev-ground-truth-forensic-export.lib';
import { PROTOTYPE_LIMITS, type PrototypeMotionLabel } from './exp021-stationary-offline-prototype.lib';
import type { VideoComparisonRow } from './exp021-ev-ground-truth-forensic-supplement-v3.lib';

export const PROTOTYPE_VERSION_V2 = 'EXP021_STATIONARY_OFFLINE_PROTOTYPE_V0_2';

export type VideoTachoCategory = 'VIDEO_TACHO_0' | 'VIDEO_TACHO_1_3' | 'VIDEO_TACHO_GT_3' | 'VIDEO_UNKNOWN';

export function videoTachoCategory(v: VideoComparisonRow | undefined): VideoTachoCategory {
  if (!v) return 'VIDEO_UNKNOWN';
  if (v.tachoKmh == null) return 'VIDEO_UNKNOWN';
  if (v.tachoKmh === 0) return 'VIDEO_TACHO_0';
  if (v.tachoKmh >= 1 && v.tachoKmh <= 3) return 'VIDEO_TACHO_1_3';
  if (v.tachoKmh > 3) return 'VIDEO_TACHO_GT_3';
  return 'VIDEO_UNKNOWN';
}

function maxLegImpliedKmh(forensic: EvGtForensicBucketExport): number | null {
  const legs = forensic.qcLegImpliedSpeedMps;
  if (!legs) return null;
  const vals = [legs.prevToCenter, legs.centerToNext].filter((x) => x != null && Number.isFinite(x)) as number[];
  if (vals.length === 0) return null;
  return Math.max(...vals) * 3.6;
}

/** CREEP before V2 band — V2 band is slow-movement semantics, not strict stop. */
export function classifyPrototypeSecondV2(args: {
  forensic: EvGtForensicBucketExport;
  baseline: EvGroundTruthPerSecondRow;
}): { label: PrototypeMotionLabel; reasons: string[]; noNumericCause: string; creepBlockedByV2Order: boolean } {
  const reasons: string[] = [];
  const { forensic, baseline } = args;
  const maxLeg = maxLegImpliedKmh(forensic);

  const v2Band =
    baseline.motionState === 'STATIONARY_SUPPORTED' &&
    baseline.speedEvidenceState === 'STATIONARY_BAND' &&
    baseline.qcTrustLevel === 'TRUSTED_LIMITED';

  if (forensic.positionGapDiagnosis !== 'PRESENT_OK') {
    return {
      label: 'UNKNOWN_GAP',
      reasons: [`center_gap=${forensic.positionGapDiagnosis}`],
      noNumericCause: forensic.noNumericDisjointV2 ?? baseline.abstentionReason ?? 'POSITION_GAP',
      creepBlockedByV2Order: false,
    };
  }
  if (baseline.supportWindowNote?.includes('ROW_ABSENT')) {
    return {
      label: 'UNKNOWN_GAP',
      reasons: [`support_note=${baseline.supportWindowNote}`],
      noNumericCause: 'L3_SUPPORT_ROW_ABSENT',
      creepBlockedByV2Order: false,
    };
  }
  if (baseline.l3SpeedKmh != null && baseline.l3SpeedKmh >= PROTOTYPE_LIMITS.creepBandMaxKmh) {
    return {
      label: 'MOVING',
      reasons: [`baseline_l3=${baseline.l3SpeedKmh}`],
      noNumericCause: 'NUMERIC_L3_PRESENT',
      creepBlockedByV2Order: false,
    };
  }
  if (baseline.motionState === 'MOVING_SPEED_ESTIMATED' && baseline.l3SpeedKmh != null) {
    return {
      label: 'MOVING',
      reasons: ['S1_MOVING_SPEED_ESTIMATED'],
      noNumericCause: 'NUMERIC_L3',
      creepBlockedByV2Order: false,
    };
  }

  const calendarComplete = forensic.qcSupportCalendarComplete === true;
  if (
    calendarComplete &&
    maxLeg != null &&
    maxLeg >= PROTOTYPE_LIMITS.strictStopMaxLegImpliedKmh &&
    maxLeg < PROTOTYPE_LIMITS.creepBandMaxKmh
  ) {
    return {
      label: 'CREEP',
      reasons: [`creep_legs=${maxLeg.toFixed(3)}kmh`],
      noNumericCause: 'SLOW_LEG_GEOMETRY',
      creepBlockedByV2Order: v2Band,
    };
  }

  if (calendarComplete && maxLeg != null && maxLeg < PROTOTYPE_LIMITS.strictStopMaxLegImpliedKmh) {
    return {
      label: 'STOP_STRICT',
      reasons: [`maxLegImpliedKmh=${maxLeg.toFixed(3)}`],
      noNumericCause: baseline.abstentionReason ?? 'LOW_LEG_SPEED_NO_NUMERIC',
      creepBlockedByV2Order: false,
    };
  }

  if (v2Band) {
    return {
      label: 'STOP_V2_BAND',
      reasons: ['V2_STATIONARY_BAND_TRUSTED_LIMITED'],
      noNumericCause: 'INTENTIONAL_NULL_STATIONARY_BAND',
      creepBlockedByV2Order: false,
    };
  }

  if (baseline.motionState === 'TRANSITION_UNCERTAIN') {
    return {
      label: 'TRANSITION',
      reasons: ['S1_TRANSITION_UNCERTAIN'],
      noNumericCause: baseline.abstentionReason ?? 'TRANSITION',
      creepBlockedByV2Order: false,
    };
  }
  if (baseline.motionState === 'NO_MOTION_EVIDENCE') {
    return {
      label: 'UNKNOWN_GAP',
      reasons: ['S1_NO_MOTION_EVIDENCE'],
      noNumericCause: baseline.abstentionReason ?? 'NO_MOTION',
      creepBlockedByV2Order: false,
    };
  }

  return {
    label: 'UNKNOWN_AMBIGUOUS',
    reasons: ['INSUFFICIENT_CLASSIFICATION_SIGNAL'],
    noNumericCause: baseline.abstentionReason ?? 'UNKNOWN',
    creepBlockedByV2Order: false,
  };
}

export function isStrictStop(label: PrototypeMotionLabel): boolean {
  return label === 'STOP_STRICT';
}

export function isV2LowSpeedBand(label: PrototypeMotionLabel): boolean {
  return label === 'STOP_V2_BAND';
}

export function buildVideoCrossTab(
  rows: Array<{ label: PrototypeMotionLabel; video: VideoComparisonRow | undefined }>,
): Record<string, Record<VideoTachoCategory, number>> {
  const out: Record<string, Record<VideoTachoCategory, number>> = {};
  for (const r of rows) {
    const cat = videoTachoCategory(r.video);
    out[r.label] ??= {
      VIDEO_TACHO_0: 0,
      VIDEO_TACHO_1_3: 0,
      VIDEO_TACHO_GT_3: 0,
      VIDEO_UNKNOWN: 0,
    };
    out[r.label][cat] += 1;
  }
  return out;
}

export function strictStopConflicts(video: VideoComparisonRow | undefined): {
  tacho0: boolean;
  tacho1to3: boolean;
  tachoGt3: boolean;
  unknown: boolean;
} {
  const cat = videoTachoCategory(video);
  return {
    tacho0: false,
    tacho1to3: cat === 'VIDEO_TACHO_1_3',
    tachoGt3: cat === 'VIDEO_TACHO_GT_3',
    unknown: cat === 'VIDEO_UNKNOWN',
  };
}

export type HoldoutSuitability = {
  developmentFraction: number;
  holdoutFromUtc: string;
  holdoutSeconds: number;
  videoTachoZeroInHoldout: number;
  v2BandInHoldout: number;
  verdict: string;
};

export function assessHoldoutSuitability(
  sortedLabels: string[],
  perLabel: Map<string, { baseline: EvGroundTruthPerSecondRow; video: VideoComparisonRow | undefined }>,
): HoldoutSuitability {
  const n = sortedLabels.length;
  const devCount = Math.floor(n * 0.8);
  const holdoutLabels = sortedLabels.slice(devCount);
  const holdoutFromUtc = holdoutLabels[0] ?? '';
  let videoTachoZeroInHoldout = 0;
  let v2BandInHoldout = 0;
  for (const l of holdoutLabels) {
    const row = perLabel.get(l);
    if (!row) continue;
    if (row.video?.tachoKmh === 0) videoTachoZeroInHoldout += 1;
    if (
      row.baseline.motionState === 'STATIONARY_SUPPORTED' &&
      row.baseline.speedEvidenceState === 'STATIONARY_BAND' &&
      row.baseline.qcTrustLevel === 'TRUSTED_LIMITED'
    ) {
      v2BandInHoldout += 1;
    }
  }
  const verdict =
    videoTachoZeroInHoldout < 10
      ? 'HOLDOUT_NOT_SUITABLE_FOR_STOP_VALIDATION — majority of annotated stops lie in development prefix; do not claim blind holdout validation.'
      : 'HOLDOUT_MARGINAL';
  return {
    developmentFraction: 0.8,
    holdoutFromUtc,
    holdoutSeconds: holdoutLabels.length,
    videoTachoZeroInHoldout,
    v2BandInHoldout,
    verdict,
  };
}
