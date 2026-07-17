import { createHash } from 'crypto';
import type { RentalDrivingAnalysisCompleteness } from '@prisma/client';
import { RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION } from './rental-driving-analysis.versioning';

export type RentalDrivingAnalysisTripFingerprint = {
  tripId: string;
  distanceKm: number;
  drivingStressScore: number | null;
  endTimeIso: string | null;
};

export type RentalDrivingAnalysisInputIdentity = {
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  periodStartIso: string;
  periodEndIso: string;
  bookingCustomerId: string;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  attributionType: string | null;
  analysisSource: string;
  scoredTripCount: number;
  dtcCountInPeriod: number;
  hintTripIds: string[];
  trips: RentalDrivingAnalysisTripFingerprint[];
  calculationVersion?: string;
};

function normalizePart(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

export function buildRentalDrivingAnalysisInputFingerprint(
  identity: RentalDrivingAnalysisInputIdentity,
): string {
  const tripParts = [...identity.trips]
    .sort((a, b) => a.tripId.localeCompare(b.tripId))
    .map(
      (trip) =>
        `${trip.tripId}:${normalizePart(trip.distanceKm)}:${normalizePart(trip.drivingStressScore)}:${normalizePart(trip.endTimeIso)}`,
    );

  const parts = [
    identity.organizationId,
    identity.bookingId,
    identity.vehicleId,
    identity.periodStartIso,
    identity.periodEndIso,
    identity.bookingCustomerId,
    normalizePart(identity.assignedDriverId),
    normalizePart(identity.actualDriverId),
    normalizePart(identity.attributionType),
    identity.analysisSource,
    normalizePart(identity.scoredTripCount),
    normalizePart(identity.dtcCountInPeriod),
    identity.calculationVersion ?? RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
    ...tripParts,
    ...[...identity.hintTripIds].sort(),
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function requiresNewRentalDrivingAnalysis(
  existing: { calculationVersion: string; inputFingerprint: string } | null,
  next: { calculationVersion: string; inputFingerprint: string },
): boolean {
  if (!existing) return true;
  return (
    existing.calculationVersion !== next.calculationVersion ||
    existing.inputFingerprint !== next.inputFingerprint
  );
}

export function resolveRentalDrivingAnalysisCompleteness(input: {
  analysisSource: string;
  scoredTripCount: number;
  aggregateConfidence: 'low' | 'medium' | 'high' | 'none';
}): RentalDrivingAnalysisCompleteness {
  if (input.analysisSource === 'none' || input.scoredTripCount === 0) {
    return 'INSUFFICIENT';
  }
  if (
    input.analysisSource === 'time_window_fallback' ||
    input.aggregateConfidence === 'low' ||
    input.aggregateConfidence === 'none' ||
    input.scoredTripCount < 3
  ) {
    return 'PARTIAL';
  }
  return 'FULL';
}
