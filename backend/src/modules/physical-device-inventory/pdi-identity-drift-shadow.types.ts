export const PdiIdentityDriftReasonCode = {
  MATCH: 'MATCH',
  ASSIGNMENT_MISMATCH: 'ASSIGNMENT_MISMATCH',
  SWAP_SUSPECTED: 'SWAP_SUSPECTED',
  UNKNOWN_DEVICE: 'UNKNOWN_DEVICE',
  IDENTITY_UNCONFIRMED: 'IDENTITY_UNCONFIRMED',
} as const;

export type PdiIdentityDriftReasonCode =
  (typeof PdiIdentityDriftReasonCode)[keyof typeof PdiIdentityDriftReasonCode];

export const PdiIdentityDriftConfidence = {
  HIGH: 'HIGH',
  CANDIDATE: 'CANDIDATE',
  CONFIRMED: 'CONFIRMED',
  UNCONFIRMED: 'UNCONFIRMED',
} as const;

export type PdiIdentityDriftConfidence =
  (typeof PdiIdentityDriftConfidence)[keyof typeof PdiIdentityDriftConfidence];

export type PdiIdentityDriftProvenance = {
  source: 'DIMO_VEHICLE_MIRROR';
  mirrorSyncedAt: string | null;
  observationSnapshotFingerprint: string;
  syncRunId: string;
};

export type PdiInstalledDeviceObservationInput = {
  physicalDeviceId: string;
  vehicleId: string;
  dimoTokenId: number | null;
  expectedSerial: string;
  identityStatus: string;
  inventoryStatus: string;
  activeInstallAssignmentCount: number;
  observedSerial: string | null;
  mirrorSyncedAt: Date | null;
  mirrorRawJsonSha256: string | null;
};

export type PdiIdentityDriftEvaluationRow = {
  physicalDeviceId: string;
  vehicleId: string;
  dimoTokenId: number | null;
  reasonCode: PdiIdentityDriftReasonCode;
  confidence: PdiIdentityDriftConfidence;
  expectedSerialMasked: string;
  observedSerialMasked: string | null;
  provenance: PdiIdentityDriftProvenance;
  driftSignature: string | null;
  detailCodes: string[];
};

export type PdiIdentityDriftShadowPersistedStateV1 = {
  version: 1;
  lastSyncRunId: string;
  lastEvaluatedAt: string;
  /** driftSignature → prior observation fingerprints for dual-confirmation */
  driftCandidates: Record<
    string,
    {
      reasonCode: PdiIdentityDriftReasonCode;
      observationFingerprints: string[];
      lastConfidence: PdiIdentityDriftConfidence;
      lastSeenAt: string;
    }
  >;
};

export type PdiIdentityDriftShadowRunResult = {
  evaluatedDeviceCount: number;
  rows: PdiIdentityDriftEvaluationRow[];
  logLines: string[];
  nextPersistedState: PdiIdentityDriftShadowPersistedStateV1;
};
