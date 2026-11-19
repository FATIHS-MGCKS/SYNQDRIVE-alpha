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

/** Count trip as impact-ready for rental scoring when VehicleTrip is READY and TDI (if present) is admissible. */
export function isRentalTdiScoreAdmissible(
  tdiAnalysisStatus: TripDrivingImpactAnalysisStatus | string | null | undefined,
): boolean {
  if (tdiAnalysisStatus == null) return true;
  return isAdmissibleTripDrivingImpactStatus(tdiAnalysisStatus);
}

export type RentalTripDrivingImpactScoreRow = {
  drivingStressScore: number | null;
  analysisStatus: TripDrivingImpactAnalysisStatus;
};

/**
 * P1-3 — authoritative TDI vs explicit vehicle_trip compat.
 * Never use trip.drivingScore when an inadmissible TDI row exists.
 */
export function resolveRentalTripStressScore(input: {
  tdiRow: RentalTripDrivingImpactScoreRow | null | undefined;
  tripLegacyDrivingScore: number | null | undefined;
}): { score: number | null; source: RentalTripStressScoreSource } {
  const { tdiRow, tripLegacyDrivingScore } = input;

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

  if (tripLegacyDrivingScore != null && Number.isFinite(tripLegacyDrivingScore)) {
    return { score: tripLegacyDrivingScore, source: 'vehicle_trip_compat' };
  }

  return { score: null, source: 'none' };
}