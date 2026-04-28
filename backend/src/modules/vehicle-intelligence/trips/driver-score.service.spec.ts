import { TripAssignmentSubjectType, TripStatus } from '@prisma/client';
import { DriverScoreService } from './driver-score.service';

function makeMockPrisma() {
  return {
    vehicleTrip: {
      findMany: jest.fn(),
    },
    tripDrivingImpact: {
      findMany: jest.fn(),
    },
  } as any;
}

describe('DriverScoreService', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: DriverScoreService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new DriverScoreService(prisma);
  });

  it('aggregates score summary from assigned non-private trips', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      { id: 'trip-1', distanceKm: 100 },
      { id: 'trip-2', distanceKm: 100 },
      { id: 'trip-3', distanceKm: 50 },
    ]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStyleScore: 80, safetyScore: 70, distanceKm: 100 },
      { tripId: 'trip-2', drivingStyleScore: 60, safetyScore: 90, distanceKm: 100 },
    ]);

    const result = await service.getScoreSummary(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
      'customer-1',
      { vehicleId: 'vehicle-1' },
    );

    expect(prisma.vehicleTrip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tripStatus: TripStatus.COMPLETED,
          isPrivateTrip: false,
          assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
          assignmentSubjectId: { in: ['customer-1'] },
          vehicleId: 'vehicle-1',
        }),
      }),
    );
    expect(result.tripCount).toBe(3);
    expect(result.scoredTripCount).toBe(2);
    expect(result.safetyScoredTripCount).toBe(2);
    expect(result.drivingStyleScore).toBe(70);
    expect(result.safetyScore).toBe(80);
    expect(result.assignmentCoveragePct).toBe(66.67);
    expect(result.totalDistanceKm).toBe(250);
    // 2 scored trips < MIN_SCORED_TRIPS=3 ⇒ hasEnoughData stays false even with distance ≥ 50.
    expect(result.hasEnoughData).toBe(false);
    expect(result.dataConfidence).toBe('low');
  });

  it('returns per-subject scores map for grouped trips with distance weighting', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      { id: 'trip-1', assignmentSubjectId: 'driver-1', distanceKm: 100 },
      { id: 'trip-2', assignmentSubjectId: 'driver-1', distanceKm: 100 },
      { id: 'trip-3', assignmentSubjectId: 'driver-2', distanceKm: 100 },
    ]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStyleScore: 88, safetyScore: 77, distanceKm: 100 },
      { tripId: 'trip-2', drivingStyleScore: 92, safetyScore: 83, distanceKm: 100 },
      { tripId: 'trip-3', drivingStyleScore: 75, safetyScore: 70, distanceKm: 100 },
    ]);

    const map = await service.getScoresForSubjects(
      TripAssignmentSubjectType.DRIVER,
      ['driver-1', 'driver-2', ''],
    );

    expect(map.get('driver-1')).toEqual(
      expect.objectContaining({
        subjectType: TripAssignmentSubjectType.DRIVER,
        subjectId: 'driver-1',
        tripCount: 2,
        scoredTripCount: 2,
        drivingStyleScore: 90,
        safetyScore: 80,
        assignmentCoveragePct: 100,
      }),
    );
    expect(map.get('driver-2')).toEqual(
      expect.objectContaining({
        tripCount: 1,
        drivingStyleScore: 75,
        safetyScore: 70,
      }),
    );
  });

  it('uses distance-weighted average so a 3 km bad trip does not equal a 300 km good trip', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      { id: 'short-bad', distanceKm: 3 },
      { id: 'long-good', distanceKm: 300 },
    ]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'short-bad', drivingStyleScore: 20, safetyScore: 30, distanceKm: 3 },
      { tripId: 'long-good', drivingStyleScore: 90, safetyScore: 95, distanceKm: 300 },
    ]);

    const result = await service.getScoreSummary(
      TripAssignmentSubjectType.DRIVER,
      'driver-x',
    );

    // Plain mean would be (20+90)/2 = 55. Distance-weighted is much closer to 90.
    expect(result.drivingStyleScore).toBeGreaterThan(85);
    expect(result.drivingStyleScore).toBeLessThan(91);
    // Plain mean would be (30+95)/2 = 62.5. Distance-weighted is much closer to 95.
    expect(result.safetyScore).toBeGreaterThan(90);
    expect(result.safetyScore).toBeLessThan(96);
    expect(result.totalDistanceKm).toBe(303);
  });

  it('ignores null safetyScore rows independently from drivingStyleScore aggregation', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      { id: 'trip-1', distanceKm: 100 },
      { id: 'trip-2', distanceKm: 100 },
      { id: 'trip-3', distanceKm: 100 },
    ]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStyleScore: 80, safetyScore: null, distanceKm: 100 },
      { tripId: 'trip-2', drivingStyleScore: 60, safetyScore: 70, distanceKm: 100 },
      { tripId: 'trip-3', drivingStyleScore: 90, safetyScore: null, distanceKm: 100 },
    ]);

    const result = await service.getScoreSummary(
      TripAssignmentSubjectType.DRIVER,
      'driver-x',
    );

    // Style averages all 3 trips; Safety only the one with non-null safetyScore.
    expect(result.scoredTripCount).toBe(3);
    expect(result.safetyScoredTripCount).toBe(1);
    expect(result.drivingStyleScore).toBe(76.67);
    expect(result.safetyScore).toBe(70);
  });

  it('reports hasEnoughData=true when ≥3 scored trips and ≥50 km, false otherwise', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      { id: 'trip-1', distanceKm: 30 },
      { id: 'trip-2', distanceKm: 30 },
      { id: 'trip-3', distanceKm: 30 },
    ]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStyleScore: 80, safetyScore: 80, distanceKm: 30 },
      { tripId: 'trip-2', drivingStyleScore: 80, safetyScore: 80, distanceKm: 30 },
      { tripId: 'trip-3', drivingStyleScore: 80, safetyScore: 80, distanceKm: 30 },
    ]);

    const result = await service.getScoreSummary(
      TripAssignmentSubjectType.DRIVER,
      'driver-x',
    );

    expect(result.scoredTripCount).toBe(3);
    expect(result.totalDistanceKm).toBe(90);
    expect(result.hasEnoughData).toBe(true);
  });

  it('returns hasEnoughData=false and dataConfidence=none for an empty set', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);

    const result = await service.getScoreSummary(
      TripAssignmentSubjectType.DRIVER,
      'driver-x',
    );

    expect(result.tripCount).toBe(0);
    expect(result.scoredTripCount).toBe(0);
    expect(result.drivingStyleScore).toBeNull();
    expect(result.safetyScore).toBeNull();
    expect(result.hasEnoughData).toBe(false);
    expect(result.dataConfidence).toBe('none');
  });
});
