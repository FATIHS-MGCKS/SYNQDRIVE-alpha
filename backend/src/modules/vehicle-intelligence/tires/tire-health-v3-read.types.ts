import type {
  NumericInterval,
  TireWearV3TreadEvidenceClass,
} from './wear-v3-prior/tire-wear-v3-prior.types';
import type { TireWearV3VerificationStatus } from './wear-v3-prior/tire-wear-v3-verification.types';

export type TireHealthWearReadModel = 'v2' | 'v3';

export interface TireHealthV3WheelReadModel {
  position: string;
  treadDepthMm: NumericInterval | null;
  pointEstimateTreadMm: number | null;
  treadEvidenceClass: TireWearV3TreadEvidenceClass;
  remainingKm: NumericInterval | null;
  replacementThresholdMm: number;
  evidenceLevel: string;
  uncertaintyFlags: string[];
  verificationStatus: TireWearV3VerificationStatus;
  lastAcceptedMeasurementAt: string | null;
  kmSinceAcceptedMeasurement: number | null;
  nextDueOdometerKm: number | null;
  mountPeriodQualityFlags: string[];
}

export interface TireHealthV3CustomerReadModel {
  modelVersion: string;
  computedAt: string;
  inputFingerprint: string;
  rated: boolean;
  setupFlags: string[];
  verificationStatus: TireWearV3VerificationStatus;
  verificationQualityFlags: string[];
  wheels: TireHealthV3WheelReadModel[];
  lowestTreadPosition: string | null;
  lowestTreadMm: NumericInterval | null;
  insufficientEvidence: boolean;
}
