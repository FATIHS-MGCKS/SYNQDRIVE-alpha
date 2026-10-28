import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bTemporalAnalysis } from './ds4-rpm-hf-v1b-temporal.engine';

export const DS4_RPM_HF_V1B_ENGINE_VERSION = 'ds4-rpm-hf-v1b-engine-v1' as const;
export const DS4_RPM_HF_V1B_CONTRACT_VERSION = 'ds4-rpm-hf-v1b-v1' as const;

/** Max adjacent interval (seconds) to stay in one continuous observed sequence. */
export const DS4_RPM_HF_V1B_CONTINUOUS_SEQUENCE_MAX_GAP_SECONDS = 2;

export type Ds4RpmHfV1bShadowProcessingOutcome =
  | 'SUCCEEDED'
  | 'DEFER_RETRY'
  | 'TERMINAL_INELIGIBLE'
  | 'TERMINAL_FAILED';

export type Ds4RpmHfV1bVsiTripClassificationProvenance = {
  source: 'VSI_ROLLING_TRIP_CLASSIFICATION_LIST';
  /** Trip id must match contract tripId — never vehicle-level promotion. */
  tripId: string;
  tripRpmProfile: string;
  /** Classification row from snapshot when present. */
  snapshotTripClassifications: ReadonlyArray<{ tripId: string; profile: string }>;
  vehicleActiveRpmProfile: string | null;
};

export type Ds4RpmHfV1bTemporalTripWindow = {
  tripStartIso: string;
  tripEndIso: string;
  tripDurationSeconds: number;
  firstRpmOffsetSeconds: number | null;
  lastRpmToTripEndSeconds: number | null;
};

export type Ds4RpmHfV1bRpmValueStats = {
  validPointCount: number;
  invalidValueCount: number;
  duplicateTimestampCount: number;
  rpmMin: number | null;
  rpmMax: number | null;
  rpmMedian: number | null;
};

export type Ds4RpmHfV1bTemporalCoverage = {
  eligibleOneSecondBuckets: number;
  observedUniqueOneSecondBuckets: number;
  observedBucketCoverageRatio: number | null;
  missingBucketCount: number;
  leadingMissingSeconds: number;
  trailingMissingSeconds: number;
  internalMissingBucketCount: number;
  bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ';
  gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF';
};

export type Ds4RpmHfV1bIntervalStats = {
  medianIntervalSeconds: number | null;
  p95IntervalSeconds: number | null;
  maxIntervalSeconds: number | null;
  gapCountOver2Seconds: number;
  longestObservedGapSeconds: number | null;
};

export type Ds4RpmHfV1bSequenceStats = {
  continuousSequenceCount: number;
  longestContinuousSequenceSeconds: number | null;
  /** Sum of per-sequence point-to-point spans (gap rule applied); excludes inter-sequence gaps. */
  observedSequenceDurationSeconds: number | null;
  sequenceGapRuleSeconds: typeof DS4_RPM_HF_V1B_CONTINUOUS_SEQUENCE_MAX_GAP_SECONDS;
};

export type Ds4RpmHfV1bReadCompletenessSlice = {
  clickHouseReadStatus: string;
  hfReadCompletenessLabel: string;
  totalMatchingCount: number | null;
  returnedPointCount: number;
};

export type Ds4RpmHfV1bAdmissionSlice = {
  processingStatus: string;
  processingAllowed: boolean;
  reasonCode: string;
  iceRpmApplicability: string;
  tripRpmProfile: string;
};

export type Ds4RpmHfV1bShadowResultV1 = {
  contractVersion: typeof DS4_RPM_HF_V1B_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string | null;
  v1aContractVersion: typeof DS4_RPM_HF_V1A_CONTRACT_VERSION;
  engineVersion: typeof DS4_RPM_HF_V1B_ENGINE_VERSION;
  inputFingerprint: string;
  computedAtIso: string;
  vsiTripClassification: Ds4RpmHfV1bVsiTripClassificationProvenance;
  readCompleteness: Ds4RpmHfV1bReadCompletenessSlice;
  admission: Ds4RpmHfV1bAdmissionSlice;
  temporalTripWindow: Ds4RpmHfV1bTemporalTripWindow;
  rpmValues: Ds4RpmHfV1bRpmValueStats;
  temporalCoverage: Ds4RpmHfV1bTemporalCoverage;
  intervalStats: Ds4RpmHfV1bIntervalStats;
  sequenceStats: Ds4RpmHfV1bSequenceStats;
  processingOutcome: Ds4RpmHfV1bShadowProcessingOutcome;
  deferReasonCode: string | null;
  rejectionReasonCode: string | null;
  readOnly: true;
  productionActivationForbidden: true;
};

export type Ds4RpmHfV1bTemporalEngineInput = {
  tripStartIso: string;
  tripEndIso: string;
  points: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>;
  invalidValueCount: number;
  duplicateTimestampCount: number;
};

export function buildV1bResultFromV1aInput(input: {
  tripInput: Ds4RpmHfV1aTripInputV1;
  temporal: Ds4RpmHfV1bTemporalAnalysis;
  processingOutcome: Ds4RpmHfV1bShadowProcessingOutcome;
  deferReasonCode: string | null;
  rejectionReasonCode: string | null;
  inputFingerprint: string;
  computedAt: Date;
}): Ds4RpmHfV1bShadowResultV1 {
  const snap = input.tripInput.vsiActiveRpmProfileSnapshot;
  const classifications =
    snap?.tripClassifications?.map((c) => ({ tripId: c.tripId, profile: c.profile })) ?? [];

  return {
    contractVersion: DS4_RPM_HF_V1B_CONTRACT_VERSION,
    organizationId: input.tripInput.organizationId,
    vehicleId: input.tripInput.vehicleId,
    tripId: input.tripInput.tripId,
    providerSourceLinkId: input.tripInput.providerSourceLinkId,
    v1aContractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
    engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION,
    inputFingerprint: input.inputFingerprint,
    computedAtIso: input.computedAt.toISOString(),
    vsiTripClassification: {
      source: 'VSI_ROLLING_TRIP_CLASSIFICATION_LIST',
      tripId: input.tripInput.tripId,
      tripRpmProfile: input.tripInput.admission.tripRpmProfile,
      snapshotTripClassifications: classifications,
      vehicleActiveRpmProfile: input.tripInput.admission.vehicleActiveRpmProfile,
    },
    readCompleteness: {
      clickHouseReadStatus: input.tripInput.clickHouseRead.status,
      hfReadCompletenessLabel: input.tripInput.dataQuality.completenessLabel,
      totalMatchingCount: input.tripInput.dataQuality.totalMatchingCount,
      returnedPointCount: input.tripInput.dataQuality.returnedPointCount,
    },
    admission: {
      processingStatus: input.tripInput.admission.processingStatus,
      processingAllowed: input.tripInput.admission.processingAllowed,
      reasonCode: input.tripInput.admission.reasonCode,
      iceRpmApplicability: input.tripInput.admission.iceRpmApplicability,
      tripRpmProfile: input.tripInput.admission.tripRpmProfile,
    },
    temporalTripWindow: input.temporal.tripWindow,
    rpmValues: input.temporal.rpmValues,
    temporalCoverage: input.temporal.coverage,
    intervalStats: input.temporal.intervals,
    sequenceStats: input.temporal.sequences,
    processingOutcome: input.processingOutcome,
    deferReasonCode: input.deferReasonCode,
    rejectionReasonCode: input.rejectionReasonCode,
    readOnly: true,
    productionActivationForbidden: true,
  };
}
