export const TIRE_DS4_SHADOW_JOB_NAME = 'tire.ds4-shadow.materialize';

export type TireDs4ShadowJobData = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tireTripUsageLedgerId: string;
  attempt: number;
};

/** Event-quality signal only (not temporal trip coverage). Never FULL in v1. */
export type TireDs4ShadowEventQualityCoverage = 'NONE' | 'PARTIAL';

/** Temporal manoeuvre coverage vs trip window — conservative until proven. */
export type TireDs4ShadowTemporalCoverage = 'UNVERIFIED' | 'NONE';

export type TireDs4ShadowChannelSummary = {
  okCount: number;
  okDurationS: number;
  okDeltaKmhAbsSum: number;
  degradedCount: number;
  limitedCount: number;
  excludedArtefactCount: number;
  excludedOtherQualityCount: number;
};

export type TireDs4ShadowInputPayloadV2 = {
  schemaVersion: 2;
  neutral: boolean;
  shadowBundleVersion: string | null;
  acceleration: TireDs4ShadowChannelSummary;
  deceleration: TireDs4ShadowChannelSummary;
  eventQualityCoverage: TireDs4ShadowEventQualityCoverage;
  temporalCoverage: TireDs4ShadowTemporalCoverage;
  limitations: string[];
  newerFailedRunId: string | null;
  newerFailedRunStatus: string | null;
};

export type TireDs4ShadowPersistInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tireSetupId: string;
  tireTripUsageLedgerId: string;
  diV0MotionCoreShadowRunId: string;
  workItemId: string | null;
  combinedInputIdentity: string;
  pinnedSnapshotHash: string;
  contentFingerprint: string;
  shadowBundleVersion: string;
  speedAuthority: string;
  eventsAlgorithmVersion: string;
  adapterVersion: string;
  eventQualityCoverage: TireDs4ShadowEventQualityCoverage;
  temporalCoverage: TireDs4ShadowTemporalCoverage;
  ds4ReadStatus: string;
  inputPayload: TireDs4ShadowInputPayloadV2;
};
