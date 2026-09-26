import type { DiV0VersionTuple } from '../core/versions';

export const DI_V0_SHADOW_RUN_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type DiV0ShadowRunStatus = (typeof DI_V0_SHADOW_RUN_STATUSES)[number];

export const DI_V0_LEGACY_COMPARISON_STATES = [
  'AGREE',
  'DI_ABSTAINS',
  'LEGACY_ONLY',
  'DI_ONLY',
  'CONFLICT',
  'NOT_COMPARABLE',
] as const;

export type DiV0LegacyComparisonState = (typeof DI_V0_LEGACY_COMPARISON_STATES)[number];

export interface DiV0ShadowRunIdentity {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceFamily: string;
  versions: DiV0VersionTuple;
  inputEvidenceVersion: string;
}

export interface DiV0ShadowPersistedIntervalInput {
  intervalStart: Date;
  intervalEnd: Date;
  referenceTime: Date;
  motionState: string;
  positionState: string;
  causalPositionState: string;
  estimatedSpeedKmh: number | null;
  speedRangeMinKmh: number | null;
  speedRangeMaxKmh: number | null;
  speedEvidenceState: string | null;
  temporalConfidence: string;
  valueConfidence: string;
  sourceRelation: string;
  claimLevel: string;
  abstentionReason: string | null;
  evidenceSources: string[];
  sourceQualityFlags: string[];
  supportIntervalStart: Date | null;
  supportIntervalEnd: Date | null;
  derivationMethod: string;
  derivationVersion: string;
  provenance: Record<string, unknown>;
  legacyComparison?: Record<string, unknown> | null;
}

export interface DiV0ShadowCompletionCounts {
  intervalCount: number;
  numericSpeedCount: number;
  abstentionCount: number;
  conflictCount: number;
}
