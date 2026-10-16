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

export type VsiApdsP5b1RowProcessingStatus =
  | 'SKIPPED_NO_ATTRIBUTABLE_LINK'
  | 'PROFILE_NOT_ASSESSABLE'
  | 'CORRELATION_ERROR'
  | 'CORRELATED'
  | 'VERIFIED_CORRELATION';

export type VsiApdsP5b1RateV1 = {
  numerator: number;
  denominator: number;
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
  processingStatus: VsiApdsP5b1RowProcessingStatus;
  errorCode: string | null;
  /** @deprecated Use processingStatus */
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
  verifiedCorrelation: number;
  unknownProvenance: number;
};

export type VsiApdsP5b1ScientificProductMetricsV1 = {
  decisionsTotal: number;
  unattributableApdsDecisions: VsiApdsP5b1RateV1;
  verifiedHistoricalProfileDecisions: VsiApdsP5b1RateV1;
  currentProfileOnlyDecisions: VsiApdsP5b1RateV1;
  declaredSignalCoverage: Record<string, VsiApdsP5b1RateV1>;
  empiricalSignalCoverage: Record<string, VsiApdsP5b1RateV1>;
  verifiedHistoricalSignalEvidence: Record<string, VsiApdsP5b1RateV1>;
  currentProfileOnlySignalObservations: Record<string, VsiApdsP5b1RateV1>;
  approvedConsumerDemand: VsiApdsP5b1RateV1;
  pendingConsumerDemand: VsiApdsP5b1RateV1;
  designOnlyContracts: VsiApdsP5b1RateV1;
  genuineInsufficientCapability: Record<string, VsiApdsP5b1RateV1>;
  notAssessableDueToApprovalOrEvidence: VsiApdsP5b1RateV1;
  policyVersionCounts: Record<string, number>;
  apdsReasonCodeCounts: Record<string, number>;
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
  operatorScope: {
    organizationId: string;
    decisionAtFrom: string;
    decisionAtTo: string;
    batchLimit: number;
    maxTotalDecisions: number;
  };
  coverage: VsiApdsP5b1OfflineReplayCoverageV1;
  scientificMetrics: VsiApdsP5b1ScientificProductMetricsV1;
  productMetrics: VsiApdsP5b1OfflineProductMetricsV1;
  rows: VsiApdsP5b1OfflineCorrelationRowV1[];
  nextCursor: { decisionAt: string; id: string } | null;
  evidenceStoreWriteAttempted: false;
  evidenceStoreRowsAppended: number;
};

export const VSI_APDS_P5B1_DEFAULT_LIMIT = VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT;
