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
export type TireDs4ShadowTemporalCoverage =
  | 'UNVERIFIED'
  | 'NONE'
  | 'PARTIAL'
  | 'VERIFIED';

export type TireDs4ShadowChannelSummary = {
  okCount: number;
  okDurationS: number;
  okDeltaKmhAbsSum: number;
  okM3JPerKgPerKmSum: number;
  okM3EventCount: number;
  degradedCount: number;
  limitedCount: number;
  excludedArtefactCount: number;
  excludedOtherQualityCount: number;
};

export type TireDs4ShadowTemporalCoverageDetail = {
  tripWindowSeconds: number;
  labelledSampleSeconds: number;
  validDrivingSeconds: number;
  confirmedStationarySeconds: number;
  gapSeconds: number;
  unknownSeconds: number;
  labelledFraction: number | null;
  /** Documented Fable research hypothesis only — not used as product gate in P3B. */
  fableHypothesis85PctThreshold: number;
  verified: boolean;
};

export type TireDs4ShadowInputPayloadV2 = {
  schemaVersion: 2;
  neutral: boolean;
  shadowBundleVersion: string | null;
  acceleration: Omit<TireDs4ShadowChannelSummary, 'okM3JPerKgPerKmSum' | 'okM3EventCount'>;
  deceleration: Omit<TireDs4ShadowChannelSummary, 'okM3JPerKgPerKmSum' | 'okM3EventCount'>;
  eventQualityCoverage: TireDs4ShadowEventQualityCoverage;
  temporalCoverage: TireDs4ShadowTemporalCoverage;
  limitations: string[];
  newerFailedRunId: string | null;
  newerFailedRunStatus: string | null;
};

export type TireDs4ShadowInputPayloadV3 = {
  schemaVersion: 3;
  neutral: boolean;
  shadowBundleVersion: string | null;
  tripDistanceKm: number | null;
  speedAuthority: string | null;
  acceleration: TireDs4ShadowChannelSummary;
  deceleration: TireDs4ShadowChannelSummary;
  eventQualityCoverage: TireDs4ShadowEventQualityCoverage;
  temporalCoverage: TireDs4ShadowTemporalCoverage;
  temporalCoverageDetail: TireDs4ShadowTemporalCoverageDetail;
  limitations: string[];
  newerFailedRunId: string | null;
  newerFailedRunStatus: string | null;
};

export type TireDs4ShadowInputPayload = TireDs4ShadowInputPayloadV3;

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
  inputPayload: TireDs4ShadowInputPayload;
};
