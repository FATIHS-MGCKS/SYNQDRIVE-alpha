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
      { id: 'trip-1' },
      { id: 'trip-2' },
      { id: 'trip-3' },
    ]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStyleScore: 80, safetyScore: 70 },
      { tripId: 'trip-2', drivingStyleScore: 60, safetyScore: 90 },
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
    expect(result.drivingStyleScore).toBe(70);
    expect(result.safetyScore).toBe(80);
    expect(result.assignmentCoveragePct).toBe(66.67);
  });

  it('returns per-subject scores map for grouped trips', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      { id: 'trip-1', assignmentSubjectId: 'driver-1' },
      { id: 'trip-2', assignmentSubjectId: 'driver-1' },
      { id: 'trip-3', assignmentSubjectId: 'driver-2' },
    ]);
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStyleScore: 88, safetyScore: 77 },
      { tripId: 'trip-2', drivingStyleScore: 92, safetyScore: 83 },
      { tripId: 'trip-3', drivingStyleScore: 75, safetyScore: 70 },
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
});

