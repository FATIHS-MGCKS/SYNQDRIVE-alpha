import type { DiV0CalibrationBundle } from '../calibration/types';
import type { NormalizedR1ObdObservation, SourceRelation } from '../types';

/**
 * R1 historical OBD is INTERVAL_ONLY — never overrides fresh L3 at a label.
 */
export function assessSourceRelationAtLabel(
  l3SpeedKmh: number | null,
  r1: NormalizedR1ObdObservation | undefined,
  calibration: DiV0CalibrationBundle,
): SourceRelation {
  if (l3SpeedKmh == null) {
    return r1?.speedKmh != null ? 'UNASSESSABLE' : 'UNASSESSABLE';
  }
  if (r1?.speedKmh == null || !Number.isFinite(r1.speedKmh)) {
    return 'SUPPORTED';
  }
  const delta = Math.abs(r1.speedKmh - l3SpeedKmh);
  const conflictThreshold = Math.max(calibration.r1ConflictAbsKmh, l3SpeedKmh * 0.25);
  if (delta <= Math.max(calibration.r1CorroborationAbsKmh, l3SpeedKmh * 0.1)) {
    return 'SUPPORTED';
  }
  if (delta >= conflictThreshold) {
    return 'CONFLICT_EXPLAINED';
  }
  return 'CONFLICTING';
}
