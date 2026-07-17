import { passesRentalAnalysisInputGate } from './rental-driving-analysis.input-gate';

describe('rental-driving-analysis.input-gate', () => {
  it('rejects active bookings and incomplete trip inputs', () => {
    expect(
      passesRentalAnalysisInputGate({
        bookingStatus: 'ACTIVE',
        analysisCompleteness: 'FULL',
        assignedTripCount: 2,
        completedAssignedTripCount: 2,
        tripsWithReadyImpact: 2,
        pendingTripAnalysisJobCount: 0,
      }),
    ).toBe(false);

    expect(
      passesRentalAnalysisInputGate({
        bookingStatus: 'COMPLETED',
        analysisCompleteness: 'PARTIAL',
        assignedTripCount: 2,
        completedAssignedTripCount: 2,
        tripsWithReadyImpact: 2,
        pendingTripAnalysisJobCount: 0,
      }),
    ).toBe(false);
  });

  it('passes only when completed booking has full inputs settled', () => {
    expect(
      passesRentalAnalysisInputGate({
        bookingStatus: 'COMPLETED',
        analysisCompleteness: 'FULL',
        assignedTripCount: 3,
        completedAssignedTripCount: 3,
        tripsWithReadyImpact: 3,
        pendingTripAnalysisJobCount: 0,
      }),
    ).toBe(true);
  });
});
