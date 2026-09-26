/**
 * Frozen S0/S1 contract literals for DI V0 shadow persistence (DB CHECK + runtime validation).
 * Keep aligned with `core/types.ts` — do not invent alternate semantics here.
 */
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
import { DI_V0_SHADOW_RUN_STATUSES } from './di-v0-shadow-types';

export const DI_V0_SHADOW_SOURCE_FAMILIES: TelemetrySourceFamily[] = [
  'RUPTELA_R1',
  'API_SYNTHETIC',
  'UNKNOWN',
];

export const DI_V0_SHADOW_MOTION_STATES: MotionState[] = [
  'STATIONARY_SUPPORTED',
  'MOVING_SPEED_ESTIMATED',
  'MOVING_SPEED_UNKNOWN',
  'TRANSITION_UNCERTAIN',
  'NO_MOTION_EVIDENCE',
];

export const DI_V0_SHADOW_POSITION_STATES: PositionState[] = [
  'FRESH',
  'FROZEN_UNRESOLVED',
  'FROZEN_MOVEMENT_SUPPORTED',
  'FROZEN_STOP_SUPPORTED',
  'RELEASE',
  'ROW_ABSENT',
  'SIGNAL_NULL',
];

export const DI_V0_SHADOW_TEMPORAL_CONFIDENCE: TemporalConfidence[] = [
  'EXACT_PROVEN',
  'BUCKET_BOUNDED',
  'INTERVAL_ONLY',
  'UNKNOWN',
];

export const DI_V0_SHADOW_VALUE_CONFIDENCE: ValueConfidence[] = [
  'HIGH',
  'MODERATE',
  'LOW',
  'UNAVAILABLE',
];

export const DI_V0_SHADOW_SOURCE_RELATIONS: SourceRelation[] = [
  'SUPPORTED',
  'CONFLICTING',
  'CONFLICT_EXPLAINED',
  'UNASSESSABLE',
];

export const DI_V0_SHADOW_CLAIM_LEVELS: ClaimLevel[] = ['L0', 'L1', 'L2', 'L3'];

export const DI_V0_SHADOW_ABSTENTION_REASONS: AbstentionReason[] = [
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

export const DI_V0_SHADOW_SPEED_EVIDENCE: SpeedEvidenceState[] = [
  'NUMERIC_HIGH',
  'NUMERIC_MODERATE',
  'MOVEMENT_ONLY',
  'STATIONARY_BAND',
  'ABSTAINED',
  'NONE',
];

export const DI_V0_SHADOW_DERIVATION_METHODS: DerivationMethod[] = [
  'L3_CENTERED_PATH',
  'HOLD_INTERVAL_LB',
  'NONE',
];

export { DI_V0_SHADOW_RUN_STATUSES };

/** SQL fragment helpers for migration CHECK constraints (PostgreSQL). */
export function sqlTextInList(values: readonly string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}
