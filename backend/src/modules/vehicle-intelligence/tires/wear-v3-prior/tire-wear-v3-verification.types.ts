import type { WheelPos } from '../tire-evidence-provenance';

export type TireWearV3VerificationStatus =
  | 'CURRENT'
  | 'DUE_SOON'
  | 'DUE'
  | 'OVERDUE'
  | 'INSUFFICIENT_EVIDENCE';

export interface TireWearV3WheelVerificationState {
  position: WheelPos;
  /** At least one accepted ground-truth measurement with odometer + tread in mount window. */
  hasAcceptedVerification: boolean;
}

export interface TireWearV3VerificationResult {
  status: TireWearV3VerificationStatus;
  kmSinceAcceptedMeasurement: number | null;
  daysSinceAcceptedMeasurement: number | null;
  /** lastAcceptedOdometerKm + policy.dueKm when anchor is valid. */
  nextDueOdometerKm: number | null;
  acceptedMeasurementId: string | null;
  acceptedMeasurementAt: string | null;
  acceptedOdometerKm: number | null;
  wheels: TireWearV3WheelVerificationState[];
  qualityFlags: string[];
}
