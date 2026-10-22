import type { MotionCoreSpeedSample } from './speed-sample.types';

export type ShadowGatingCategory =
  | 'BOTH_NULL'
  | 'SHADOW_NULL_L3_ONLY'
  | 'SHADOW_ONLY'
  | 'BOTH_NON_NULL_ALIGNED'
  | 'BOTH_NON_NULL_MISMATCH';

export interface ShadowGatingRow {
  label: string;
  category: ShadowGatingCategory;
  shadowSpeedKmh: number | null;
  l3ReplayKmh: number | null;
  c4SpeedKmh: number | null;
  shadowMotionState: string | null;
  shadowSpeedEvidenceState: string | null;
  c4AddsCoverage: boolean;
}

export interface ShadowIntervalShadowRow {
  estimatedSpeedKmh: number | null;
  motionState?: string;
  speedEvidenceState?: string;
  abstentionReason?: string;
}

/**
 * Classifies per-label differences between frozen L3 replay, C4 candidate, and published shadow export.
 * Shadow null with L3 non-null is expected when motionState !== MOVING_SPEED_ESTIMATED (gating), not C4 parity.
 */
export function reconcileShadowGating(
  replay: Array<{ bucketLabelUtc: string; l3SpeedKmh: number | null }>,
  c4: MotionCoreSpeedSample[],
  shadowByLabel: Map<string, ShadowIntervalShadowRow | undefined>,
  toleranceKmh = 0.05,
): {
  rows: ShadowGatingRow[];
  summary: {
    shadowNullL3Only: number;
    shadowOnly: number;
    c4AddsBeyondShadow: number;
    c4AddsBeyondL3: number;
    bothNull: number;
  };
} {
  const c4m = new Map(c4.map((s) => [s.label, s]));
  const rows: ShadowGatingRow[] = [];
  let shadowNullL3Only = 0;
  let shadowOnly = 0;
  let c4AddsBeyondShadow = 0;
  let c4AddsBeyondL3 = 0;
  let bothNull = 0;

  for (const r of replay) {
    const lab = r.bucketLabelUtc;
    const sh = shadowByLabel.get(lab);
    const shadowSpeed = sh?.estimatedSpeedKmh ?? null;
    const l3 = r.l3SpeedKmh;
    const c4s = c4m.get(lab);
    const c4v = c4s?.valueKmh ?? null;
    const motion = sh?.motionState ?? null;

    let category: ShadowGatingCategory;
    if (shadowSpeed == null && l3 == null) {
      category = 'BOTH_NULL';
      bothNull += 1;
    } else if (shadowSpeed == null && l3 != null) {
      category = 'SHADOW_NULL_L3_ONLY';
      shadowNullL3Only += 1;
    } else if (shadowSpeed != null && l3 == null) {
      category = 'SHADOW_ONLY';
      shadowOnly += 1;
    } else if (
      shadowSpeed != null &&
      l3 != null &&
      Math.abs(shadowSpeed - l3) <= toleranceKmh
    ) {
      category = 'BOTH_NON_NULL_ALIGNED';
    } else {
      category = 'BOTH_NON_NULL_MISMATCH';
    }

    const c4AddsCoverage = c4v != null && shadowSpeed == null;
    if (c4AddsCoverage) {
      c4AddsBeyondShadow += 1;
    }
    if (c4v != null && l3 == null) {
      c4AddsBeyondL3 += 1;
    }

    rows.push({
      label: lab,
      category,
      shadowSpeedKmh: shadowSpeed,
      l3ReplayKmh: l3,
      c4SpeedKmh: c4v,
      shadowMotionState: motion,
      shadowSpeedEvidenceState: sh?.speedEvidenceState ?? null,
      c4AddsCoverage,
    });
  }

  return {
    rows,
    summary: {
      shadowNullL3Only,
      shadowOnly,
      c4AddsBeyondShadow,
      c4AddsBeyondL3,
      bothNull,
    },
  };
}

/** Typical shadow gating: speed published only when motionState is MOVING_SPEED_ESTIMATED. */
export function isShadowSpeedGatedOut(motionState: string | null | undefined): boolean {
  return motionState != null && motionState !== 'MOVING_SPEED_ESTIMATED';
}

