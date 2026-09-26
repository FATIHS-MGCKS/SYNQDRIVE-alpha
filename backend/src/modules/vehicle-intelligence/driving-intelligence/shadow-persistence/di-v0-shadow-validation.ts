import type {
  AbstentionReason,
  ClaimLevel,
  DerivationMethod,
  MotionState,
  PositionState,
  SourceRelation,
  SpeedEvidenceState,
  TelemetrySourceFamily,
  TemporalConfidence,
  ValueConfidence,
} from '../core/types';
import type { DiV0ShadowPersistedIntervalInput } from './di-v0-shadow-types';

const SOURCE_FAMILIES: TelemetrySourceFamily[] = ['RUPTELA_R1', 'API_SYNTHETIC', 'UNKNOWN'];
const MOTION: MotionState[] = [
  'STATIONARY_SUPPORTED',
  'MOVING_SPEED_ESTIMATED',
  'MOVING_SPEED_UNKNOWN',
  'TRANSITION_UNCERTAIN',
  'NO_MOTION_EVIDENCE',
];
const POSITION: PositionState[] = [
  'FRESH',
  'FROZEN_UNRESOLVED',
  'FROZEN_MOVEMENT_SUPPORTED',
  'FROZEN_STOP_SUPPORTED',
  'RELEASE',
  'ROW_ABSENT',
  'SIGNAL_NULL',
];
const TEMPORAL: TemporalConfidence[] = ['EXACT_PROVEN', 'BUCKET_BOUNDED', 'INTERVAL_ONLY', 'UNKNOWN'];
const VALUE: ValueConfidence[] = ['HIGH', 'MODERATE', 'LOW', 'UNAVAILABLE'];
const RELATION: SourceRelation[] = ['SUPPORTED', 'CONFLICTING', 'CONFLICT_EXPLAINED', 'UNASSESSABLE'];
const CLAIM: ClaimLevel[] = ['L0', 'L1', 'L2', 'L3'];
const ABSTENTION: AbstentionReason[] = [
  'ROW_ABSENT',
  'POSITION_FROZEN',
  'POSITION_RELEASE',
  'INCOMPLETE_SUPPORT',
  'INVALID_POSITION',
  'GEOMETRY_DISCONTINUITY',
  'TEMPORAL_SEMANTICS_INSUFFICIENT',
  'NO_KINEMATIC_EVIDENCE',
  'CALIBRATION_REQUIRED',
  'UNSUPPORTED_SOURCE_FAMILY',
  'ROW_GAP_IN_SUPPORT',
  'SIGNAL_NULL_IN_SUPPORT',
];
const SPEED_EVIDENCE: SpeedEvidenceState[] = [
  'NUMERIC_HIGH',
  'NUMERIC_MODERATE',
  'MOVEMENT_ONLY',
  'STATIONARY_BAND',
  'ABSTAINED',
  'NONE',
];
const DERIVATION: DerivationMethod[] = ['L3_CENTERED_PATH', 'HOLD_INTERVAL_LB', 'NONE'];

function assertMember<T extends string>(value: string, allowed: readonly T[], field: string): void {
  if (!allowed.includes(value as T)) {
    throw new Error(`DI_V0_SHADOW_INVALID_${field}: ${value}`);
  }
}

function assertFiniteSpeed(value: number | null, field: string): void {
  if (value == null) {
    return;
  }
  if (!Number.isFinite(value)) {
    throw new Error(`DI_V0_SHADOW_NONFINITE_${field}`);
  }
}

export function validateShadowIntervalRow(row: DiV0ShadowPersistedIntervalInput): void {
  assertMember(row.motionState, MOTION, 'MOTION_STATE');
  assertMember(row.positionState, POSITION, 'POSITION_STATE');
  assertMember(row.causalPositionState, POSITION, 'CAUSAL_POSITION_STATE');
  assertMember(row.temporalConfidence, TEMPORAL, 'TEMPORAL_CONFIDENCE');
  assertMember(row.valueConfidence, VALUE, 'VALUE_CONFIDENCE');
  assertMember(row.sourceRelation, RELATION, 'SOURCE_RELATION');
  assertMember(row.claimLevel, CLAIM, 'CLAIM_LEVEL');
  assertMember(row.derivationMethod, DERIVATION, 'DERIVATION_METHOD');
  if (row.abstentionReason != null) {
    assertMember(row.abstentionReason, ABSTENTION, 'ABSTENTION_REASON');
  }
  if (row.speedEvidenceState != null) {
    assertMember(row.speedEvidenceState, SPEED_EVIDENCE, 'SPEED_EVIDENCE_STATE');
  }
  assertFiniteSpeed(row.estimatedSpeedKmh, 'ESTIMATED_SPEED_KMH');
  assertFiniteSpeed(row.speedRangeMinKmh, 'SPEED_RANGE_MIN_KMH');
  assertFiniteSpeed(row.speedRangeMaxKmh, 'SPEED_RANGE_MAX_KMH');
  if (row.estimatedSpeedKmh != null && row.claimLevel === 'L3') {
    throw new Error('DI_V0_SHADOW_CLAIM_L3_WITH_NUMERIC_L3');
  }
}

export function validateShadowSourceFamily(sourceFamily: string): void {
  assertMember(sourceFamily, SOURCE_FAMILIES, 'SOURCE_FAMILY');
}
