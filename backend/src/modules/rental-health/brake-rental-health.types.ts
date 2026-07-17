import type {
  BrakeCondition,
  BrakeConfidenceLevel,
} from '../vehicle-intelligence/brakes/brake-status';
import type { HealthState } from './rental-health.types';

export type BrakeRentalReviewRequirement =
  | 'NONE'
  | 'MEASUREMENT_REQUIRED'
  | 'REVIEW_REQUIRED';

export type BrakeRentalDecision =
  | 'ALLOW'
  | 'WARNING'
  | 'MEASUREMENT_REQUIRED'
  | 'DATA_QUALITY_WARNING'
  | 'REVIEW_REQUIRED'
  | 'HARD_BLOCK'
  | 'UNAVAILABLE';

export type BrakeRentalBlockingAction = 'NONE' | 'HARD_BLOCK';

export type BrakeMeasurementFreshness = 'fresh' | 'aging' | 'stale' | 'no_data';
export type BrakeModelFreshness = 'fresh' | 'stale' | 'no_data';

export type BrakeDataQualityCondition = 'GOOD' | 'WARNING' | 'UNKNOWN';

export type BrakeRentalReasonCode =
  | 'WEAR_MEASURED_CRITICAL'
  | 'WEAR_MEASURED_BELOW_THRESHOLD'
  | 'WEAR_ESTIMATED_CRITICAL'
  | 'WEAR_ESTIMATED_WARNING'
  | 'SAFETY_DTC_CRITICAL'
  | 'SAFETY_DTC_REVIEW'
  | 'SAFETY_ABS_CRITICAL'
  | 'SAFETY_ABS_REVIEW'
  | 'SAFETY_FLUID_CRITICAL'
  | 'SAFETY_IMMEDIATE_REPLACEMENT'
  | 'SAFETY_WEAR_SENSOR'
  | 'DATA_NO_BASELINE'
  | 'DATA_SPEC_ONLY'
  | 'DATA_COVERAGE_GAP'
  | 'DATA_DISTANCE_CONFLICT'
  | 'DATA_MEASUREMENT_REQUIRED'
  | 'DATA_STALE_EVIDENCE'
  | 'UNKNOWN_STATE'
  | 'MODULE_UNAVAILABLE'
  | 'REVIEW_OVERRIDE_ACTIVE';

export interface BrakeActiveSafetyEvidence {
  alertType: string;
  reasonCode: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  messageEn: string;
  displayMode: string;
  axle?: string;
}

export interface BrakeRentalBlockingEvidence {
  action: BrakeRentalBlockingAction;
  reasonCode: BrakeRentalReasonCode;
  source: string;
  value: number | string | null;
  threshold: number | string | null;
  timestamp: string | null;
  message: string;
  messageEn: string;
}

export interface BrakeRentalReviewOverrideSummary {
  id: string;
  reason: string;
  grantedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

export interface BrakeRentalHealthReadModel {
  wearCondition: BrakeCondition | 'UNKNOWN';
  safetyCondition: BrakeCondition | 'UNKNOWN';
  dataQualityCondition: BrakeDataQualityCondition;
  measurementFreshness: BrakeMeasurementFreshness;
  modelFreshness: BrakeModelFreshness;
  activeSafetyEvidence: BrakeActiveSafetyEvidence[];
  confidence: BrakeConfidenceLevel;
  reviewRequirement: BrakeRentalReviewRequirement;
  rentalDecision: BrakeRentalDecision;
  blockingReasons: string[];
  rentalBlockingEvidence: BrakeRentalBlockingEvidence | null;
  structuredReasonCodes: BrakeRentalReasonCode[];
  activeReviewOverride: BrakeRentalReviewOverrideSummary | null;
  /** Wear or safety alert present — single semantic for operational alerting. */
  hasWearOrSafetyAlert: boolean;
  primaryReason: string;
  primaryReasonEn: string;
  lastMeasurementAt: string | null;
  lastSafetyEvidenceAt: string | null;
  lastModelCalculatedAt: string | null;
  lastDataReceivedAt: string | null;
  /** Max relevant signal timestamp for module `last_updated_at`. */
  lastUpdatedAt: string | null;
  dataStale: boolean;
  source: string;
  evidenceType: 'measured' | 'estimated' | 'document' | 'sensor' | 'unknown';
}

export interface BrakeRentalHealthModuleHealth {
  state: HealthState;
  reason: string;
  last_updated_at: string | null;
  data_stale: boolean;
  source?: string;
  evidence_type?:
    | 'measured'
    | 'estimated'
    | 'provider'
    | 'manual'
    | 'document'
    | 'sensor'
    | 'complaint'
    | 'unknown';
  brake_read_model: BrakeRentalHealthReadModel;
}
