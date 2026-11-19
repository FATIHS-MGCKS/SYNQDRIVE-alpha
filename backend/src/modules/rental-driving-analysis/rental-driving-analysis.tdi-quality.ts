import type { TripDrivingImpactAnalysisStatus } from '@prisma/client';

export type RentalTripStressScoreSource =
  | 'trip_driving_impact'
  | 'vehicle_trip_compat'
  | 'none';

export function isAdmissibleTripDrivingImpactStatus(
  status: TripDrivingImpactAnalysisStatus | string | null | undefined,
): boolean {
  return status === 'COMPLETE' || status === 'PARTIAL';
}

/**
 * Rental assessment settlement for driving impact (F1).
 * READY requires admissible TDI; READY without TDI is not settled (fail-closed).
 */
export function isRentalTripImpactSettledForAssessment(input: {
  drivingImpactStatus: string | null | undefined;
  tdiAnalysisStatus: TripDrivingImpactAnalysisStatus | string | null | undefined;
}): boolean {
  const { drivingImpactStatus, tdiAnalysisStatus } = input;
  if (drivingImpactStatus === 'SKIPPED') return true;
  if (drivingImpactStatus !== 'READY') return false;
  return isAdmissibleTripDrivingImpactStatus(tdiAnalysisStatus);
}

/** Count toward tripsWithReadyImpact — completed trip with admissible authoritative TDI. */
export function isRentalTripWithAdmissibleTdiImpact(input: {
  tripStatus: string;
  drivingImpactStatus: string | null | undefined;
  tdiAnalysisStatus: TripDrivingImpactAnalysisStatus | string | null | undefined;
}): boolean {
  if (input.tripStatus !== 'COMPLETED') return false;
  if (input.drivingImpactStatus !== 'READY') return false;
  return isAdmissibleTripDrivingImpactStatus(input.tdiAnalysisStatus);
}

export type RentalTripDrivingImpactScoreRow = {
  drivingStressScore: number | null;
  analysisStatus: TripDrivingImpactAnalysisStatus;
};

/**
 * P1-3 / F1 — authoritative TDI vs explicit vehicle_trip compat.
 * vehicle_trip_compat only when no TDI row and VehicleTrip is not READY
 * (pre-authority / pipeline-not-finished). READY without TDI never compat.
 */
export function resolveRentalTripStressScore(input: {
  tdiRow: RentalTripDrivingImpactScoreRow | null | undefined;
  tripLegacyDrivingScore: number | null | undefined;
  drivingImpactStatus?: string | null;
}): { score: number | null; source: RentalTripStressScoreSource } {
  const { tdiRow, tripLegacyDrivingScore, drivingImpactStatus } = input;

  if (tdiRow) {
    if (!isAdmissibleTripDrivingImpactStatus(tdiRow.analysisStatus)) {
      return { score: null, source: 'none' };
    }
    const score = tdiRow.drivingStressScore;
    if (score != null && Number.isFinite(score)) {
      return { score, source: 'trip_driving_impact' };
    }
    return { score: null, source: 'trip_driving_impact' };
  }

  if (drivingImpactStatus === 'READY') {
    return { score: null, source: 'none' };
  }

  if (tripLegacyDrivingScore != null && Number.isFinite(tripLegacyDrivingScore)) {
    return { score: tripLegacyDrivingScore, source: 'vehicle_trip_compat' };
  }

  return { score: null, source: 'none' };
}