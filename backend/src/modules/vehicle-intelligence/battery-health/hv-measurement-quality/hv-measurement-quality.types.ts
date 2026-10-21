export const HV_MEASUREMENT_QUALITY_LEVEL = {
  Q1: 'Q1',
  Q2: 'Q2',
  Q3: 'Q3',
  Q4: 'Q4',
} as const;

export type HvMeasurementQualityLevel =
  (typeof HV_MEASUREMENT_QUALITY_LEVEL)[keyof typeof HV_MEASUREMENT_QUALITY_LEVEL];

export const HV_MEASUREMENT_CAPACITY_CONFIDENCE = {
  NOT_ESTIMABLE: 'NOT_ESTIMABLE',
  INSUFFICIENT: 'INSUFFICIENT',
  PROVISIONAL: 'PROVISIONAL',
  CONSISTENT_MULTI_SESSION: 'CONSISTENT_MULTI_SESSION',
} as const;

export type HvMeasurementCapacityConfidence =
  (typeof HV_MEASUREMENT_CAPACITY_CONFIDENCE)[keyof typeof HV_MEASUREMENT_CAPACITY_CONFIDENCE];

export const HV_MEASUREMENT_REFERENCE_CONFIDENCE = {
  NONE: 'NONE',
  UNVERIFIED: 'UNVERIFIED',
  VERIFIED: 'VERIFIED',
  INCOMPATIBLE: 'INCOMPATIBLE',
} as const;

export type HvMeasurementReferenceConfidence =
  (typeof HV_MEASUREMENT_REFERENCE_CONFIDENCE)[keyof typeof HV_MEASUREMENT_REFERENCE_CONFIDENCE];

export const HV_MEASUREMENT_SOH_PUBLICATION_READINESS = {
  BLOCKED: 'BLOCKED',
  INTERNAL_ONLY: 'INTERNAL_ONLY',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;

export type HvMeasurementSohPublicationReadiness =
  (typeof HV_MEASUREMENT_SOH_PUBLICATION_READINESS)[keyof typeof HV_MEASUREMENT_SOH_PUBLICATION_READINESS];

/** Research SOC windows (Tesla pilot); not mandatory limits. */
export const HV_MEASUREMENT_RESEARCH_SOC_CHARGE_WINDOWS = [
  { id: '20-80', labelDe: '20–80 % SOC', socStartMax: 25, socEndMin: 75 },
  { id: '30-90', labelDe: '30–90 % SOC', socStartMax: 35, socEndMin: 85 },
  { id: '15-85', labelDe: '15–85 % SOC', socStartMax: 20, socEndMin: 80 },
] as const;

export const HV_MEASUREMENT_QUALITY_MIN_VALID_SESSIONS_FOR_Q4 = 3;
export const HV_MEASUREMENT_QUALITY_MAX_SESSION_CAPACITY_CV = 0.03;

export const HV_MEASUREMENT_QUALITY_SCORE_BAND = {
  Q1_MAX: 25,
  Q2_MAX: 66,
  Q3_MAX: 89,
  Q4_MAX: 100,
} as const;

export interface HvMeasurementQualitySessionInput {
  sessionId: string;
  startAt: Date;
  endAt: Date | null;
  source: string;
  isOngoing: boolean;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  measurementQuality: string;
  metadata: Record<string, unknown> | null;
}

export interface HvMeasurementQualitySessionResult {
  sessionId: string;
  startAt: string;
  endAt: string | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  deltaSocPercent: number | null;
  energyAddedKwh: number | null;
  energyProvenance: string | null;
  coverageDurationSeconds: number | null;
  measurementQuality: string;
  qualityStatus: string | null;
  qualityReasonCodes: string[];
  m3GateEligible: boolean;
  m3GateReasonCodes: string[];
  m3EstimatedCapacityKwh: number | null;
  qualityLevel: HvMeasurementQualityLevel;
  qualityScore: number;
  exclusionReasons: string[];
  contributesToQ4Cohort: boolean;
}

export interface HvMeasurementQualityVehicleResult {
  schemaVersion: 'hv-measurement-quality-mvp-v1';
  vehicleId: string;
  organizationId: string;
  evaluatedAt: string;
  /** @deprecated Use exploratoryMeasurementCount — explorative ≠ policy-validated. */
  validMeasurementCount: number;
  validMeasurementCountSemantics: 'EXPLORATORY_NON_Q1';
  exploratoryMeasurementCount: number;
  policyValidatedMeasurementCount: number;
  validationGatePassCount: number;
  qualifiedCapacityMedianKwh: number | null;
  exploratoryCapacityMedianKwh: number | null;
  persistedCrossSessionSessionCount: number;
  persistedCrossSessionGatePassed: boolean;
  recommendedAdditionalMeasurements: number;
  recommendedAdditionalMeasurementsDisclaimer: string;
  vehicleQualityLevel: HvMeasurementQualityLevel;
  qualityScore: number;
  qualityLevelCounts: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number>;
  capacityConfidence: HvMeasurementCapacityConfidence;
  referenceConfidence: HvMeasurementReferenceConfidence;
  sohPublicationReadiness: HvMeasurementSohPublicationReadiness;
  sohGateReasonCodes: string[];
  sohPercentPublicDisplayAllowed: false;
  recommendedSocChargeWindows: Array<{
    id: string;
    labelDe: string;
    coveredByValidMeasurement: boolean;
  }>;
  exclusionSummary: string[];
  sessions: HvMeasurementQualitySessionResult[];
}
