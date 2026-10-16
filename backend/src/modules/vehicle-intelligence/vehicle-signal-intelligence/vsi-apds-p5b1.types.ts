import type {
  VsiApdsReadonlyCapabilityObservationV1,
  VsiApdsShadowCorrelationResultV1,
} from './vsi-apds-p5.types';
import {
  VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT,
  VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
} from './vsi-apds-p5b1.contract';

export type VsiApdsP5b1DecisionIdentityV1 = {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  policyVersion: string;
  decisionAt: string;
  activationEpochId: string | null;
  shadowExecutionVersion: string | null;
};

export type VsiApdsP5b1SourceLinkAttributionV1 = {
  status: 'UNIQUE_ATTRIBUTED' | 'AMBIGUOUS' | 'NONE_AT_DECISION' | 'UNPROVEN';
  providerSourceLinkId: string | null;
  historicalActiveLinkCountAtDecision: number | null;
  reasons: string[];
};

export type VsiApdsP5b1OfflineCorrelationRowV1 = {
  contractVersion: typeof VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION;
  decisionIdentity: VsiApdsP5b1DecisionIdentityV1;
  originalApdsDecision: string;
  originalApdsReason: string;
  sourceLinkAttribution: VsiApdsP5b1SourceLinkAttributionV1;
  observation: VsiApdsReadonlyCapabilityObservationV1 | null;
  correlation: VsiApdsShadowCorrelationResultV1 | null;
  investigationHints: string[];
  skippedReason: string | null;
};

export type VsiApdsP5b1OfflineReplayFilterV1 = {
  organizationId?: string;
  vehicleId?: string;
  opportunityId?: string;
  activationEpochId?: string | null;
  policyVersions?: readonly string[];
  decisionAtFrom?: Date;
  decisionAtTo?: Date;
};

export type VsiApdsP5b1OfflineReplayPaginationV1 = {
  cursorDecisionAt?: Date;
  cursorId?: string;
  limit?: number;
};

export type VsiApdsP5b1OfflineReplayCoverageV1 = {
  decisionsLoaded: number;
  correlated: number;
  skippedNoAttributableLink: number;
  skippedErrors: number;
  verifiedHistoricalProfile: number;
  unknownProvenance: number;
};

export type VsiApdsP5b1OfflineProductMetricsV1 = {
  decisionsAvailable: number;
  attributedDecisions: number;
  verifiedHistoricalProfileEvidence: number;
  unknownOrMissingProvenance: number;
  signalCoverageByCanonicalKey: Record<string, number>;
  pendingConsumerRequirements: number;
  approvedConsumerRequirements: number;
  capabilityGapsByDomain: Record<string, number>;
  policyVersionCounts: Record<string, number>;
  apdsReasonCodeCounts: Record<string, number>;
  profileFingerprintCoverage: number;
};

export type VsiApdsP5b1OfflineReplayResultV1 = {
  contractVersion: typeof VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION;
  dryRun: true;
  readOnly: true;
  replayRunId: string;
  coverage: VsiApdsP5b1OfflineReplayCoverageV1;
  productMetrics: VsiApdsP5b1OfflineProductMetricsV1;
  rows: VsiApdsP5b1OfflineCorrelationRowV1[];
  nextCursor: { decisionAt: string; id: string } | null;
  evidenceStoreWriteAttempted: false;
  evidenceStoreRowsAppended: number;
};

export const VSI_APDS_P5B1_DEFAULT_LIMIT = VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT;
