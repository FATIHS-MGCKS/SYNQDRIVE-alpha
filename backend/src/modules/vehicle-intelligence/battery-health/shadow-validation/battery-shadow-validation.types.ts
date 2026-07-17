export const BATTERY_SHADOW_VALIDATION_SCRIPT_VERSION = '1.0.0';

export const BATTERY_SHADOW_VALIDATION_DISCLAIMER =
  'Interner Shadow-Validierungsreport — keine Kundenpublication, keine Readiness-Freigabe. ' +
  'Ergebnisse dienen ausschließlich der technischen Auswertung vor einem manuellen Go/No-Go.';

export type BatteryShadowValidationGateStatus =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'insufficient_data'
  | 'not_applicable';

export type BatteryShadowValidationRecommendation =
  | 'continue_shadow'
  | 'insufficient_data'
  | 'review_required'
  | 'gates_ready_for_manual_review';

export interface BatteryShadowValidationObservationPeriod {
  startAt: string;
  endAt: string;
  durationDays: number;
  minimumRecommendedDays: number;
  maximumRecommendedDays: number;
  meetsMinimumPeriod: boolean;
  withinRecommendedWindow: boolean;
}

export interface BatteryShadowValidationFlagsSnapshot {
  restShadowEnabled: boolean;
  startProxyEnabled: boolean;
  hvRechargeSessionEnabled: boolean;
  hvFallbackChargeSessionEnabled: boolean;
  hvCapacityShadowEnabled: boolean;
  publicationEnabled: boolean;
  hvSohPublicationEnabled: boolean;
  readinessEnabled: boolean;
}

export interface BatteryShadowValidationLvMetrics {
  vehiclesWithRestWindows: number;
  restWindowCount: number;
  rest60m: { scheduled: number; captured: number; missed: number; captureRatePct: number | null };
  rest6h: { scheduled: number; captured: number; missed: number; captureRatePct: number | null };
  wakeContaminationCount: number;
  wakeContaminationRatePct: number | null;
  chargingContaminationCount: number;
  missedTotal: number;
  profileDistribution: Array<{ profile: string; vehicleCount: number }>;
  startProxySessions: number;
  startProxyMeasurements: number;
  startProxyInsufficientCoverage: number;
  shadowLvAssessmentCount: number;
  shadowLvScoreStdDevMedian: number | null;
  shadowLvScoreRange: { min: number | null; max: number | null };
  falsePositiveCandidates: number;
  rentalBlockedFromBatteryInPeriod: number;
}

export interface BatteryShadowValidationHvMetrics {
  vehiclesWithRechargeSessions: number;
  rechargeSessionCount: number;
  rechargeSegmentCoveragePct: number | null;
  sessionQualityDistribution: Array<{ quality: string; count: number }>;
  qualifiedSessionCount: number;
  m2ObservationCount: number;
  m2SessionsWithSamples: number;
  m2SessionCvP95: number | null;
  m2SessionCvMedian: number | null;
  crossSessionAssessmentCount: number;
  crossSessionScatterPct: number | null;
  m3ValidationCount: number;
  m3AgreementCount: number;
  m3ConflictCount: number;
  m3AgreementRatePct: number | null;
  capabilityStableCount: number;
  capabilityChangedCount: number;
  capabilityUnavailableCount: number;
  referenceCapacityActiveCount: number;
  referenceCapacityUnverifiedCount: number;
  storageGrowth: {
    batteryMeasurements: number;
    batteryMeasurementSessions: number;
    hvChargeSessions: number;
    hvCapacityObservations: number;
    batteryAssessments: number;
  };
}

export interface BatteryShadowValidationGateResult {
  id: string;
  domain: 'observation' | 'lv' | 'hv' | 'safety';
  label: string;
  status: BatteryShadowValidationGateStatus;
  threshold: string;
  observed: string;
  detail?: string;
}

export interface BatteryShadowValidationVehicleSample {
  vehicleId: string;
  licensePlate: string | null;
  fuelType: string | null;
  lvRestCaptureRate60mPct: number | null;
  lvWakeContamination: number;
  startProxyAvailability: string | null;
  hvSessionCount: number;
  hvM2SampleCount: number;
  hvM3Conflict: boolean | null;
}

export interface BatteryShadowValidationReport {
  mode: 'shadow_validation';
  scriptVersion: string;
  readOnly: true;
  publicationBlocked: true;
  readinessBlocked: true;
  disclaimer: string;
  generatedAt: string;
  observationPeriod: BatteryShadowValidationObservationPeriod;
  organizationId: string | null;
  organizationName: string | null;
  vehiclesInScope: number;
  vehicleSamples: BatteryShadowValidationVehicleSample[];
  flags: BatteryShadowValidationFlagsSnapshot;
  lv: BatteryShadowValidationLvMetrics;
  hv: BatteryShadowValidationHvMetrics;
  gates: BatteryShadowValidationGateResult[];
  overallRecommendation: BatteryShadowValidationRecommendation;
  summary: {
    gatesPassed: number;
    gatesWarned: number;
    gatesFailed: number;
    gatesInsufficientData: number;
  };
}

export interface BatteryShadowValidationRunOptions {
  organizationId?: string;
  vehicleId?: string;
  referenceNow?: Date;
  observationStartAt?: Date;
  observationDays?: number;
  vehicleSampleLimit?: number;
  includeVehicleSamples?: boolean;
}
