export const TIRE_DS4_SHADOW_JOB_NAME = 'tire.ds4-shadow.materialize';

export type TireDs4ShadowJobData = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tireTripUsageLedgerId: string;
  attempt: number;
};

export type TireDs4ShadowCoverage = 'NONE' | 'PARTIAL' | 'FULL';

export type TireDs4ShadowChannelSummary = {
  okCount: number;
  okDurationS: number;
  degradedCount: number;
  limitedCount: number;
  excludedArtefactCount: number;
  excludedOtherQualityCount: number;
  ordinalDeltaKmhBuckets: {
    low: number;
    medium: number;
    high: number;
  };
};

export type TireDs4ShadowInputPayloadV1 = {
  schemaVersion: 1;
  neutral: boolean;
  intensityAdmissible: boolean;
  acceleration: TireDs4ShadowChannelSummary;
  deceleration: TireDs4ShadowChannelSummary;
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
  coverage: TireDs4ShadowCoverage;
  ds4ReadStatus: string;
  inputPayload: TireDs4ShadowInputPayloadV1;
};
