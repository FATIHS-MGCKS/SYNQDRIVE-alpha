import type { BookingStatus } from '@prisma/client';
import type { RentalDrivingAnalysisStability } from '@prisma/client';
import { passesRentalAnalysisInputGate, type RentalAnalysisInputGateSnapshot } from './rental-driving-analysis.input-gate';

export function resolveRentalDrivingAnalysisStability(
  gateSnapshot: RentalAnalysisInputGateSnapshot,
): RentalDrivingAnalysisStability {
  if (gateSnapshot.bookingStatus !== 'COMPLETED') {
    return 'PROVISIONAL';
  }
  return passesRentalAnalysisInputGate(gateSnapshot) ? 'STABLE' : 'PROVISIONAL';
}

export function isFinalRentalAnalysisStability(
  stability: RentalDrivingAnalysisStability,
  bookingStatus: BookingStatus,
): boolean {
  return bookingStatus === 'COMPLETED' && stability === 'STABLE';
}
