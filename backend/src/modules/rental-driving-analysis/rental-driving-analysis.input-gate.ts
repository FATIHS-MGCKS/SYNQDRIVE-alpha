import type { BookingStatus, RentalDrivingAnalysisCompleteness } from '@prisma/client';

export type RentalAnalysisInputGateSnapshot = {
  bookingStatus: BookingStatus;
  analysisCompleteness: RentalDrivingAnalysisCompleteness;
  assignedTripCount: number;
  completedAssignedTripCount: number;
  tripsWithReadyImpact: number;
  pendingTripAnalysisJobCount: number;
};

/**
 * Completed bookings become STABLE only when trip inputs and analysis pipeline are settled.
 * Active bookings never pass the gate.
 */
export function passesRentalAnalysisInputGate(
  snapshot: RentalAnalysisInputGateSnapshot,
): boolean {
  if (snapshot.bookingStatus !== 'COMPLETED') {
    return false;
  }
  if (snapshot.analysisCompleteness !== 'FULL') {
    return false;
  }
  if (snapshot.assignedTripCount === 0) {
    return false;
  }
  if (snapshot.completedAssignedTripCount < snapshot.assignedTripCount) {
    return false;
  }
  if (snapshot.tripsWithReadyImpact < snapshot.completedAssignedTripCount) {
    return false;
  }
  if (snapshot.pendingTripAnalysisJobCount > 0) {
    return false;
  }
  return true;
}
