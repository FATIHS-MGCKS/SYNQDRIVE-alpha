import { resolveRentalDrivingAnalysisStability } from './rental-driving-analysis.stability';

describe('rental-driving-analysis.stability', () => {
  it('marks active bookings as PROVISIONAL', () => {
    expect(
      resolveRentalDrivingAnalysisStability({
        bookingStatus: 'ACTIVE',
        analysisCompleteness: 'FULL',
        assignedTripCount: 2,
        completedAssignedTripCount: 2,
        tripsWithReadyImpact: 2,
        pendingTripAnalysisJobCount: 0,
      }),
    ).toBe('PROVISIONAL');
  });

  it('marks completed bookings STABLE only after input gate', () => {
    expect(
      resolveRentalDrivingAnalysisStability({
        bookingStatus: 'COMPLETED',
        analysisCompleteness: 'FULL',
        assignedTripCount: 2,
        completedAssignedTripCount: 1,
        tripsWithReadyImpact: 1,
        pendingTripAnalysisJobCount: 0,
      }),
    ).toBe('PROVISIONAL');

    expect(
      resolveRentalDrivingAnalysisStability({
        bookingStatus: 'COMPLETED',
        analysisCompleteness: 'FULL',
        assignedTripCount: 2,
        completedAssignedTripCount: 2,
        tripsWithReadyImpact: 2,
        pendingTripAnalysisJobCount: 0,
      }),
    ).toBe('STABLE');
  });
});
