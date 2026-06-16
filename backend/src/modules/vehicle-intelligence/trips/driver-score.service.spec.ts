import { DriverScoreService } from './driver-score.service';
import { TripAssignmentSubjectType } from '@prisma/client';

describe('DriverScoreService', () => {
  const service = new DriverScoreService({} as any);

  it('aggregates drivingStressScore with distance weighting', () => {
    const result = service.aggregateRows(TripAssignmentSubjectType.BOOKING_CUSTOMER, 'cust-1', [
      { drivingStressScore: 80, distanceKm: 100 },
      { drivingStressScore: 60, distanceKm: 100 },
    ]);
    expect(result.scoredTripCount).toBe(2);
    expect(result.drivingStressScore).toBe(70);
    expect(result.stressLevel).toBe('high');
  });

  it('classifies low stress for low scores', () => {
    const result = service.aggregateRows(TripAssignmentSubjectType.BOOKING_CUSTOMER, 'cust-1', [
      { drivingStressScore: 15, distanceKm: 100 },
      { drivingStressScore: 20, distanceKm: 100 },
      { drivingStressScore: 10, distanceKm: 100 },
    ]);
    expect(result.stressLevel).toBe('low');
  });

  it('weights long low-stress trips higher than short high-stress trips', () => {
    const result = service.aggregateRows(TripAssignmentSubjectType.BOOKING_CUSTOMER, 'cust-1', [
      { drivingStressScore: 20, distanceKm: 3 },
      { drivingStressScore: 90, distanceKm: 300 },
    ]);
    expect(result.drivingStressScore).toBeGreaterThan(85);
    expect(result.drivingStressScore).toBeLessThan(91);
  });

  it('returns null stress when no scored trips', () => {
    const result = service.aggregateRows(TripAssignmentSubjectType.BOOKING_CUSTOMER, 'cust-1', []);
    expect(result.drivingStressScore).toBeNull();
    expect(result.stressLevel).toBeNull();
  });

  it('sets hasEnoughData when thresholds met', () => {
    const result = service.aggregateRows(TripAssignmentSubjectType.BOOKING_CUSTOMER, 'cust-1', [
      { drivingStressScore: 40, distanceKm: 30 },
      { drivingStressScore: 45, distanceKm: 30 },
      { drivingStressScore: 50, distanceKm: 30 },
    ]);
    expect(result.hasEnoughData).toBe(true);
    expect(result.dataConfidence).toBe('medium');
  });
});
