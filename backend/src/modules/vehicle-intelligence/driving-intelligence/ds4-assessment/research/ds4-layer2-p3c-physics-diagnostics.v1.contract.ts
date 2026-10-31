import type { Ds4Layer2MotionPhysicsApplicabilityV1 } from './ds4-layer2-p3-motion-physics-context.v1.contract';

export const DS4_LAYER2_P3C_PHYSICS_DIAGNOSTICS_SCHEMA_VERSION_V1 =
  'DS4_LAYER2_P3C_PHYSICS_DIAGNOSTICS_V1' as const;

export const DS4_LAYER2_P3C_PHYSICS_FORMULA_VERSION_V1 = 'DS4_LAYER2_P3C_PHYSICS_FORMULAS_V1' as const;

export const DS4_LAYER2_P3C_SIDEcar_ARTIFACT_FILES_V1 = [
  'p3c_manifest.json',
  'p3c_physics_context.csv',
  'p3c_event_diagnostics.csv',
  'p3c_limitations.csv',
] as const;

export type Ds4Layer2P3cTemporalReferenceEvidenceV1 =
  | 'EFFECTIVE_AT_TRIP_END'
  | 'REFERENCE_POSTDATES_TRIP'
  | 'REFERENCE_EXPIRED_BEFORE_TRIP'
  | 'TEMPORAL_AMBIGUOUS';

export type Ds4Layer2P3cPhysicsDiagnosticAvailabilityV1 =
  | 'AVAILABLE'
  | 'UNAVAILABLE';

export type Ds4Layer2P3cLimitationReasonV1 =
  | 'REFERENCE_APPLICABILITY_BLOCKED'
  | 'EXPLORATORY_ESTIMATED_REFERENCE'
  | 'ENGINE_RATED_POWER_NOT_SYSTEM_POWER'
  | 'MISSING_POSITIVE_ACCEL0_TO100'
  | 'MISSING_POSITIVE_CURB_MASS'
  | 'NON_FINITE_EVENT_ACCEL'
  | 'BRAKING_EVENT_NO_ACCEL_REFERENCE_RATIO'
  | 'TEMPORAL_REFERENCE_NOT_APPLICABLE_AT_TRIP'
  | 'P2_IMPULSE_CONSISTENCY_MISMATCH';

export type Ds4Layer2P2AdmissibleEventRowV1 = {
  offlineReconstructionKey: string;
  tripId: string;
  vehicleId: string;
  sourceMotionRunId: string;
  eventIndex: number;
  eventKind: 'ACCELERATION' | 'DECELERATION' | string;
  startLabelUtc: string;
  endLabelUtc: string;
  durationS: number;
  eligibilityClassification: string;
  meanAccelMps2: number | null;
  eventQuality: string | null;
  speedAuthority: string | null;
};

export type Ds4Layer2P2AssessmentTripRowV1 = {
  tripId: string;
  vehicleId: string;
  organizationId: string;
  evaluationCodeSha: string;
  offlineReconstructionKey: string;
  exposureSeconds: number;
  distanceKm: number;
  accelSpecificImpulseMps: number | null;
  brakeSpecificImpulseMps: number | null;
};

export type Ds4Layer2P3cPhysicsContextRowV1 = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripStartUtc: string;
  tripEndUtc: string;
  motionReferenceId: string | null;
  referenceApplicability: Ds4Layer2MotionPhysicsApplicabilityV1;
  referenceEvidenceTier: string | null;
  referenceEffectiveFrom: string | null;
  referenceEffectiveTo: string | null;
  temporalReferenceEvidence: Ds4Layer2P3cTemporalReferenceEvidenceV1;
  currentReferenceApplicability: Ds4Layer2MotionPhysicsApplicabilityV1;
  avgAccelReferenceMps2: number | null;
  curbMassKg: number | null;
  limitationReasonsJson: string;
};

export type Ds4Layer2P3cEventDiagnosticRowV1 = {
  tripId: string;
  vehicleId: string;
  offlineReconstructionKey: string;
  sourceMotionRunId: string;
  eventIndex: number;
  eventKind: string;
  eligibilityClassification: string;
  meanAccelMps2: number | null;
  signedMeanAccelMps2: number | null;
  avgAccelReferenceMps2: number | null;
  accelRatioToReference: number | null;
  estimatedNetLongitudinalForceN: number | null;
  diagnosticAvailability: Ds4Layer2P3cPhysicsDiagnosticAvailabilityV1;
  referenceApplicability: Ds4Layer2MotionPhysicsApplicabilityV1;
  temporalReferenceEvidence: Ds4Layer2P3cTemporalReferenceEvidenceV1;
  limitationReasonsJson: string;
};

export type Ds4Layer2P3cSidecarBuildInputV1 = {
  p3cEvaluationCodeSha: string;
  p2EvaluationCodeSha: string;
  p2InputChecksumsSha256: Record<string, string>;
  p2ManifestChecksumSha256: string;
  organizationId: string;
  builtAtUtc: Date;
  physicsContextRows: readonly Ds4Layer2P3cPhysicsContextRowV1[];
  eventDiagnosticRows: readonly Ds4Layer2P3cEventDiagnosticRowV1[];
  limitationRows: readonly Record<string, unknown>[];
  summary: Record<string, unknown>;
};

export type Ds4Layer2P3cSidecarArtifactsV1 = {
  manifest: Record<string, unknown>;
  physicsContextCsv: string;
  eventDiagnosticsCsv: string;
  limitationsCsv: string;
  fileChecksums: Record<string, string>;
};
