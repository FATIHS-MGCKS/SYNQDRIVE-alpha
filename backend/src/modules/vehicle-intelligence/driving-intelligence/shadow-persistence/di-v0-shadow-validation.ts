import type { DiV0ShadowPersistedIntervalInput } from './di-v0-shadow-types';
import {
  DI_V0_SHADOW_ABSTENTION_REASONS,
  DI_V0_SHADOW_CLAIM_LEVELS,
  DI_V0_SHADOW_DERIVATION_METHODS,
  DI_V0_SHADOW_MOTION_STATES,
  DI_V0_SHADOW_POSITION_STATES,
  DI_V0_SHADOW_SOURCE_FAMILIES,
  DI_V0_SHADOW_SOURCE_RELATIONS,
  DI_V0_SHADOW_SPEED_EVIDENCE,
  DI_V0_SHADOW_TEMPORAL_CONFIDENCE,
  DI_V0_SHADOW_VALUE_CONFIDENCE,
} from './di-v0-shadow-contract';

function assertMember<T extends string>(value: string, allowed: readonly T[], field: string): void {
  if (!allowed.includes(value as T)) {
    throw new Error(`DI_V0_SHADOW_INVALID_${field}: ${value}`);
  }
}

function assertFiniteNonNegativeSpeed(value: number | null, field: string): void {
  if (value == null) {
    return;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`DI_V0_SHADOW_INVALID_${field}`);
  }
}

function assertTemporalOrdering(start: Date, end: Date, field: string): void {
  if (start.getTime() >= end.getTime()) {
    throw new Error(`DI_V0_SHADOW_INVALID_${field}_ORDER`);
  }
}

export function validateShadowIntervalRow(row: DiV0ShadowPersistedIntervalInput): void {
  assertMember(row.motionState, DI_V0_SHADOW_MOTION_STATES, 'MOTION_STATE');
  assertMember(row.positionState, DI_V0_SHADOW_POSITION_STATES, 'POSITION_STATE');
  assertMember(row.causalPositionState, DI_V0_SHADOW_POSITION_STATES, 'CAUSAL_POSITION_STATE');
  assertMember(row.temporalConfidence, DI_V0_SHADOW_TEMPORAL_CONFIDENCE, 'TEMPORAL_CONFIDENCE');
  assertMember(row.valueConfidence, DI_V0_SHADOW_VALUE_CONFIDENCE, 'VALUE_CONFIDENCE');
  assertMember(row.sourceRelation, DI_V0_SHADOW_SOURCE_RELATIONS, 'SOURCE_RELATION');
  assertMember(row.claimLevel, DI_V0_SHADOW_CLAIM_LEVELS, 'CLAIM_LEVEL');
  assertMember(row.derivationMethod, DI_V0_SHADOW_DERIVATION_METHODS, 'DERIVATION_METHOD');
  if (row.abstentionReason != null) {
    assertMember(row.abstentionReason, DI_V0_SHADOW_ABSTENTION_REASONS, 'ABSTENTION_REASON');
  }
  if (row.speedEvidenceState != null) {
    assertMember(row.speedEvidenceState, DI_V0_SHADOW_SPEED_EVIDENCE, 'SPEED_EVIDENCE_STATE');
  }

  assertTemporalOrdering(row.intervalStart, row.intervalEnd, 'INTERVAL');
  if (row.supportIntervalStart != null && row.supportIntervalEnd != null) {
    assertTemporalOrdering(row.supportIntervalStart, row.supportIntervalEnd, 'SUPPORT_INTERVAL');
  }
  if (
    (row.supportIntervalStart != null && row.supportIntervalEnd == null) ||
    (row.supportIntervalStart == null && row.supportIntervalEnd != null)
  ) {
    throw new Error('DI_V0_SHADOW_INVALID_SUPPORT_INTERVAL_PARTIAL');
  }

  assertFiniteNonNegativeSpeed(row.estimatedSpeedKmh, 'ESTIMATED_SPEED_KMH');
  assertFiniteNonNegativeSpeed(row.speedRangeMinKmh, 'SPEED_RANGE_MIN_KMH');
  assertFiniteNonNegativeSpeed(row.speedRangeMaxKmh, 'SPEED_RANGE_MAX_KMH');

  const hasMin = row.speedRangeMinKmh != null;
  const hasMax = row.speedRangeMaxKmh != null;
  if (hasMin !== hasMax) {
    throw new Error('DI_V0_SHADOW_INVALID_SPEED_RANGE_PARTIAL');
  }
  if (hasMin && hasMax && row.speedRangeMinKmh! > row.speedRangeMaxKmh!) {
    throw new Error('DI_V0_SHADOW_INVALID_SPEED_RANGE_ORDER');
  }

  if (row.estimatedSpeedKmh != null && row.claimLevel === 'L3') {
    throw new Error('DI_V0_SHADOW_CLAIM_L3_WITH_NUMERIC_L3');
  }
}

export function validateShadowSourceFamily(sourceFamily: string): void {
  assertMember(sourceFamily, DI_V0_SHADOW_SOURCE_FAMILIES, 'SOURCE_FAMILY');
}
