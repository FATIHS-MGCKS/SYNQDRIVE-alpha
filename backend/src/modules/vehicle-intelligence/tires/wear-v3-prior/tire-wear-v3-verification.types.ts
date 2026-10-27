import type { WheelPos } from '../tire-evidence-provenance';

export type TireWearV3VerificationStatus =
  | 'CURRENT'
  | 'DUE_SOON'
  | 'DUE'
  | 'OVERDUE'
  | 'INSUFFICIENT_EVIDENCE';

/** Setup-level aggregation precedence (higher = more urgent). */
export const TIRE_WEAR_V3_VERIFICATION_STATUS_PRECEDENCE: Record<
  TireWearV3VerificationStatus,
  number
> = {
  INSUFFICIENT_EVIDENCE: 5,
  OVERDUE: 4,
  DUE: 3,
  DUE_SOON: 2,
  CURRENT: 1,
};

export interface TireWearV3WheelVerificationState {
  position: WheelPos;
  /** Latest accepted ground-truth tread + odometer anchor exists for this wheel. */
  hasAcceptedVerification: boolean;
  verificationStatus: TireWearV3VerificationStatus;
  lastAcceptedMeasurementId: string | null;
  lastAcceptedMeasurementAt: string | null;
  lastAcceptedOdometerKm: number | null;
  kmSinceAcceptedMeasurement: number | null;
  daysSinceAcceptedMeasurement: number | null;
  nextDueOdometerKm: number | null;
  qualityFlags: string[];
}

export interface TireWearV3VerificationResult {
  /** Aggregated from per-wheel statuses (max precedence). */
  status: TireWearV3VerificationStatus;
  /** Fields mirror the wheel that drives `status` (tie-break: higher kmSince). */
  kmSinceAcceptedMeasurement: number | null;
  daysSinceAcceptedMeasurement: number | null;
  nextDueOdometerKm: number | null;
  acceptedMeasurementId: string | null;
  acceptedMeasurementAt: string | null;
  acceptedOdometerKm: number | null;
  wheels: TireWearV3WheelVerificationState[];
  /** Setup-level flags (odometer integrity, mount period, rotation summary). */
  qualityFlags: string[];
}
