import type { ErdRechargeProjectionDraft } from '../erd-recharge-projection/erd-recharge-projection-mapper';

export const ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE = {
  EXACT_NATIVE_DIMO_ID: 'EXACT_NATIVE_DIMO_ID',
  LEGACY_COALESCED_LINEAGE: 'LEGACY_COALESCED_LINEAGE',
  UNIQUE_PHYSICAL_WINDOW_OVERLAP: 'UNIQUE_PHYSICAL_WINDOW_OVERLAP',
  NONE: 'NONE',
  AMBIGUOUS: 'AMBIGUOUS',
} as const;

export type ErdRechargeShadowPairingEvidence =
  (typeof ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE)[keyof typeof ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE];

export const ERD_RECHARGE_SHADOW_PARITY_CLASS = {
  EXACT_MATCH: 'EXACT_MATCH',
  SEMANTIC_MATCH: 'SEMANTIC_MATCH',
  FIELD_MISMATCH: 'FIELD_MISMATCH',
  CANONICAL_ONLY: 'CANONICAL_ONLY',
  LEGACY_ONLY: 'LEGACY_ONLY',
  AMBIGUOUS_MATCH: 'AMBIGUOUS_MATCH',
  LEGACY_COALESCED_MULTIPLE_CANONICAL: 'LEGACY_COALESCED_MULTIPLE_CANONICAL',
  MULTIPLE_LEGACY_ONE_CANONICAL: 'MULTIPLE_LEGACY_ONE_CANONICAL',
  NOT_COMPARABLE: 'NOT_COMPARABLE',
  PENDING_SETTLEMENT: 'PENDING_SETTLEMENT',
} as const;

export type ErdRechargeShadowParityClass =
  (typeof ERD_RECHARGE_SHADOW_PARITY_CLASS)[keyof typeof ERD_RECHARGE_SHADOW_PARITY_CLASS];

export const ERD_RECHARGE_SHADOW_FINALITY = {
  OBSERVED: 'OBSERVED',
  SETTLED: 'SETTLED',
  PENDING_SETTLEMENT: 'PENDING_SETTLEMENT',
} as const;

export type ErdRechargeShadowFinality =
  (typeof ERD_RECHARGE_SHADOW_FINALITY)[keyof typeof ERD_RECHARGE_SHADOW_FINALITY];

export const ERD_RECHARGE_SHADOW_FIELD_SEVERITY = {
  AUTHORITY_CRITICAL: 'AUTHORITY_CRITICAL',
  PRODUCT_VISIBLE: 'PRODUCT_VISIBLE',
  PROVENANCE_ONLY: 'PROVENANCE_ONLY',
  EXPECTED_BY_DESIGN: 'EXPECTED_BY_DESIGN',
} as const;

export type ErdRechargeShadowFieldSeverity =
  (typeof ERD_RECHARGE_SHADOW_FIELD_SEVERITY)[keyof typeof ERD_RECHARGE_SHADOW_FIELD_SEVERITY];

export interface ErdRechargeShadowLegacySnapshot {
  vehicleEnergyEventId: string;
  dimoSegmentId: string | null;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: string;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  coalescedFromSegmentIds: string[];
}

export interface ErdRechargeShadowCanonicalSnapshot {
  chargeSessionId: string;
  segmentFingerprint: string;
  source: string;
  dimoSegmentId: string | null;
  draft: Pick<
    ErdRechargeProjectionDraft,
    | 'startTime'
    | 'endTime'
    | 'durationSeconds'
    | 'socDeltaPercent'
    | 'energyDeltaKwh'
    | 'odometerStartKm'
    | 'odometerEndKm'
    | 'confidence'
    | 'dimoSegmentId'
    | 'startLatitude'
    | 'startLongitude'
    | 'endLatitude'
    | 'endLongitude'
    | 'sourceEventKey'
    | 'detectionSource'
    | 'detectionMechanism'
  >;
}

export interface ErdRechargeShadowFieldDiff {
  numericDeltas: {
    startDeltaSeconds: number | null;
    endDeltaSeconds: number | null;
    durationDeltaSeconds: number | null;
    socDeltaDifferencePercent: number | null;
    energyDeltaDifferenceKwh: number | null;
    odometerStartDifferenceKm: number | null;
    odometerEndDifferenceKm: number | null;
  };
  mismatches: Array<{
    field: string;
    canonical: unknown;
    legacy: unknown;
    severity: ErdRechargeShadowFieldSeverity;
    reason: string;
  }>;
  relatedCanonicalSessionIds?: string[];
  relatedLegacyVehicleEnergyEventIds?: string[];
}

export interface ErdRechargeShadowCanonicalCandidate {
  sessionId: string;
  snapshot: ErdRechargeShadowCanonicalSnapshot;
}

export interface ErdRechargeShadowLegacyCandidate {
  vehicleEnergyEventId: string;
  snapshot: ErdRechargeShadowLegacySnapshot;
}

export interface ErdRechargeShadowObservationDraft {
  organizationId: string;
  vehicleId: string;
  canonicalChargeSessionId: string | null;
  legacyVehicleEnergyEventId: string | null;
  pairingEvidence: ErdRechargeShadowPairingEvidence;
  parityClass: ErdRechargeShadowParityClass;
  finality: ErdRechargeShadowFinality;
  canonicalProjectionSnapshot: ErdRechargeShadowCanonicalSnapshot | null;
  legacyProjectionSnapshot: ErdRechargeShadowLegacySnapshot | null;
  fieldDiff: ErdRechargeShadowFieldDiff | null;
  comparisonFingerprint: string;
}

export const ERD_RECHARGE_SHADOW_RUN_RESULT = {
  SKIPPED_FLAG_OFF: 'SKIPPED_FLAG_OFF',
  OBSERVED: 'OBSERVED',
  PERSISTED: 'PERSISTED',
  DEDUPED: 'DEDUPED',
  PENDING_SETTLEMENT: 'PENDING_SETTLEMENT',
  FAILED_ISOLATED: 'FAILED_ISOLATED',
} as const;

export type ErdRechargeShadowRunResult =
  (typeof ERD_RECHARGE_SHADOW_RUN_RESULT)[keyof typeof ERD_RECHARGE_SHADOW_RUN_RESULT];
