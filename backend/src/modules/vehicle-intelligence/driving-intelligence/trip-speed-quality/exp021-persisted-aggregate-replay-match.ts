export type Exp021PersistedAggregateReplayMatchStatus = 'N/A' | 'PASS' | 'FAIL';

export type Exp021PersistedAggregateReplayMatch = {
  status: Exp021PersistedAggregateReplayMatchStatus;
  reason: string;
  projectionId?: string;
  qcPolicyVersion?: string;
  projectionVersion?: string;
  lifecycleStatus?: string;
  createdAtUtc?: string;
  fieldResults?: {
    trustedNumericCoveragePercent: boolean;
    numericCoveragePercent: boolean;
    trustedLimitedStationaryCount: boolean;
    qcTrustedMaxKmh: boolean;
  };
};

export type Exp021ReplayQualityAggregates = {
  trustedNumericCoveragePercent: number;
  numericCoveragePercent: number;
  trustedLimitedStationaryCount: number;
  qcTrustedMaxKmh: number;
};

import { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from './di-v0-trip-speed-quality-projection.version';

export type Exp021PersistedProjectionRow = {
  id: string;
  qc_policy_version: string;
  projection_version: string;
  lifecycle_status: string;
  created_at: Date;
  projection_json: unknown;
};

/** Canonical CURRENT V2-policy persisted row filter (do not use projection_version = 'V2'). */
export function exp021CanonicalPersistedV2WhereClause(): {
  qcPolicyVersion: string;
  projectionVersion: string;
} {
  return {
    qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    projectionVersion: DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1,
  };
}

export function evaluateExp021PersistedAggregateReplayMatch(input: {
  persisted: Exp021PersistedProjectionRow | null;
  replay: Exp021ReplayQualityAggregates;
}): Exp021PersistedAggregateReplayMatch {
  if (input.persisted == null) {
    return {
      status: 'N/A',
      reason: 'NO_PERSISTED_CURRENT_V2_ROW',
    };
  }
  const pq = (input.persisted.projection_json as { quality?: Record<string, unknown> })?.quality;
  if (pq == null) {
    return {
      status: 'N/A',
      reason: 'PERSISTED_ROW_MISSING_QUALITY_AGGREGATES',
      projectionId: input.persisted.id,
      qcPolicyVersion: input.persisted.qc_policy_version,
      projectionVersion: input.persisted.projection_version,
      lifecycleStatus: input.persisted.lifecycle_status,
      createdAtUtc: input.persisted.created_at.toISOString(),
    };
  }
  const speed = (input.persisted.projection_json as { speed?: { qcTrustedMaxKmh?: number } })?.speed;
  const fieldResults = {
    trustedNumericCoveragePercent:
      pq.trustedNumericCoveragePercent === input.replay.trustedNumericCoveragePercent,
    numericCoveragePercent: pq.numericCoveragePercent === input.replay.numericCoveragePercent,
    trustedLimitedStationaryCount:
      pq.trustedLimitedStationaryCount === input.replay.trustedLimitedStationaryCount,
    qcTrustedMaxKmh: speed?.qcTrustedMaxKmh === input.replay.qcTrustedMaxKmh,
  };
  const allMatch = Object.values(fieldResults).every(Boolean);
  return {
    status: allMatch ? 'PASS' : 'FAIL',
    reason: allMatch ? 'AGGREGATE_FIELDS_MATCH_REPLAY' : 'AGGREGATE_FIELD_MISMATCH',
    projectionId: input.persisted.id,
    qcPolicyVersion: input.persisted.qc_policy_version,
    projectionVersion: input.persisted.projection_version,
    lifecycleStatus: input.persisted.lifecycle_status,
    createdAtUtc: input.persisted.created_at.toISOString(),
    fieldResults,
  };
}
