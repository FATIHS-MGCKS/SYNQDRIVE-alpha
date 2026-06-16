import { TripAssignmentStatus, TripAssignmentSubjectType } from '@prisma/client';
import { TripAnalyticsCanonicalService } from './trip-analytics-canonical.service';

function makeMockPrisma() {
  return {
    tripDrivingImpact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
    },
    vehicleTrip: {
      aggregate: jest.fn(),
      count: jest.fn(),
    },
  } as any;
}

function makeMockAssignmentService() {
  return {
    resolveForTrip: jest.fn(),
  } as any;
}

describe('TripAnalyticsCanonicalService', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let assignmentService: ReturnType<typeof makeMockAssignmentService>;
  let service: TripAnalyticsCanonicalService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    assignmentService = makeMockAssignmentService();
    service = new TripAnalyticsCanonicalService(prisma, assignmentService);
  });

  it('hydrates trip list with canonical stress score + event summary', async () => {
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStressScore: 82 },
    ]);
    assignmentService.resolveForTrip.mockResolvedValue({
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: 'cust-1',
      assignedBookingId: 'booking-1',
      isPrivateTrip: false,
      scoreEligible: true,
    });

    const result = await service.hydrateTrips([
      {
        id: 'trip-1',
        vehicleId: 'vehicle-1',
        driverName: null,
        startTime: new Date('2026-03-01T08:00:00Z'),
        endTime: new Date('2026-03-01T09:00:00Z'),
        drivingScore: null,
        speedingSectionCount: 3,
        speedingSegments: null,
        speedingExposurePct: 12.5,
        maxOverSpeedKmh: 15,
        accelerationEventCount: 5,
        hardAccelerationCount: 2,
        brakingEventCount: 4,
        hardBrakingCount: 1,
        fullBrakingCount: 1,
        harshCornerCount: 0,
        abuseEventCount: 2,
        totalAccelerationEvents: 7,
        hardAccelerationEvents: 2,
        totalBrakingEvents: 6,
        hardBrakingEvents: 1,
        fullBrakingEvents: 1,
        corneringEvents: 0,
        abuseEvents: 2,
        speedingEvents: 3,
        assignmentStatus: null,
        assignmentSubjectType: null,
        assignmentSubjectId: null,
        assignedBookingId: null,
        isPrivateTrip: false,
      },
    ] as any);

    expect(result).toHaveLength(1);
    expect(result[0].canonicalTripSummary.scores.drivingStressScore).toBe(82);
    expect(result[0].canonicalTripSummary.scores.stressLevel).toBe('critical');
    expect(result[0].canonicalTripSummary.events.totalBrakingEvents).toBe(6);
  });

  it('falls back to legacy drivingScore when impact row is missing', async () => {
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    assignmentService.resolveForTrip.mockResolvedValue({
      assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: true,
      scoreEligible: false,
    });

    const result = await service.hydrateTrips([
      {
        id: 'trip-legacy',
        vehicleId: 'vehicle-1',
        driverName: null,
        startTime: new Date('2026-03-01T08:00:00Z'),
        endTime: new Date('2026-03-01T09:00:00Z'),
        drivingScore: 55,
        speedingSectionCount: null,
        speedingSegments: 0,
        speedingExposurePct: null,
        maxOverSpeedKmh: null,
        accelerationEventCount: 3,
        hardAccelerationCount: 1,
        brakingEventCount: 2,
        hardBrakingCount: 1,
        fullBrakingCount: 0,
        harshCornerCount: 0,
        abuseEventCount: 0,
        totalAccelerationEvents: 0,
        hardAccelerationEvents: 0,
        totalBrakingEvents: 0,
        hardBrakingEvents: 0,
        fullBrakingEvents: 0,
        corneringEvents: 0,
        abuseEvents: 0,
        speedingEvents: 0,
        assignmentStatus: null,
        assignmentSubjectType: null,
        assignmentSubjectId: null,
        assignedBookingId: null,
        isPrivateTrip: true,
      },
    ] as any);

    expect(result[0].canonicalTripSummary.scores.drivingStressScore).toBe(55);
    expect(result[0].canonicalTripSummary.scores.stressLevel).toBe('high');
    expect(result[0].canonicalTripSummary.scores.scoreSource).toBe('vehicle_trip_compat');
  });

  it('does not expose safety score fields', async () => {
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStressScore: 30 },
    ]);
    assignmentService.resolveForTrip.mockResolvedValue({
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: 'cust-1',
      assignedBookingId: 'booking-1',
      isPrivateTrip: false,
      scoreEligible: true,
    });

    const result = await service.hydrateTrips([
      {
        id: 'trip-1',
        vehicleId: 'vehicle-1',
        driverName: null,
        startTime: new Date(),
        endTime: new Date(),
        drivingScore: null,
        speedingSectionCount: 0,
        speedingSegments: 0,
        speedingExposurePct: 0,
        maxOverSpeedKmh: 0,
        avgOverSpeedKmh: 0,
        accelerationEventCount: 0,
        hardAccelerationCount: 0,
        brakingEventCount: 0,
        hardBrakingCount: 0,
        fullBrakingCount: 0,
        harshCornerCount: 0,
        abuseEventCount: 0,
        totalAccelerationEvents: 0,
        hardAccelerationEvents: 0,
        totalBrakingEvents: 0,
        hardBrakingEvents: 0,
        fullBrakingEvents: 0,
        corneringEvents: 0,
        abuseEvents: 0,
        speedingEvents: 0,
        assignmentStatus: null,
        assignmentSubjectType: null,
        assignmentSubjectId: null,
        assignedBookingId: null,
        isPrivateTrip: false,
      },
    ] as any);

    expect((result[0].canonicalTripSummary.scores as any).safetyScore).toBeUndefined();
  });

  it('returns canonical trip stats from aggregates', async () => {
    prisma.vehicleTrip.aggregate.mockResolvedValue({
      _count: { _all: 12 },
      _sum: {
        distanceKm: 420,
        totalAccelerationEvents: 110,
        hardAccelerationEvents: 35,
        totalBrakingEvents: 96,
        hardBrakingEvents: 28,
        abuseEvents: 12,
        speedingEvents: 19,
      },
    });
    prisma.tripDrivingImpact.aggregate.mockResolvedValue({
      _avg: { drivingStressScore: 74.456 },
    });
    prisma.vehicleTrip.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(9);

    const stats = await service.getVehicleStats('vehicle-1');

    expect(stats.totalTrips).toBe(12);
    expect(stats.avgDrivingStressScore).toBe(74.46);
    expect(stats.stressLevel).toBe('high');
    expect((stats as any).avgSafetyScore).toBeUndefined();
  });
});
