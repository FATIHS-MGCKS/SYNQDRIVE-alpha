import { TripAssignmentStatus, TripAssignmentSubjectType } from '@prisma/client';
import { TripAnalyticsCanonicalService } from './trip-analytics-canonical.service';
import { TripAssignmentService } from './trip-assignment.service';
import { TripAttributionService } from './trip-attribution.service';

function makeMockPrisma() {
  return {
    tripDrivingImpact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    driverAttribution: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicleTrip: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tripBehaviorEvent: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

const R1_RAW_JSON = { aftermarketDevice: { serial: 'R1-TEST-0001' }, syntheticDevice: null };
const TESLA_RAW_JSON = { aftermarketDevice: null, syntheticDevice: { tokenId: 1 } };

function tripWithFullBraking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    vehicleId: 'vehicle-1',
    driverName: null,
    startTime: new Date('2026-03-01T08:00:00Z'),
    endTime: new Date('2026-03-01T09:00:00Z'),
    drivingScore: null,
    speedingSectionCount: 0,
    speedingSegments: null,
    speedingExposurePct: null,
    totalAccelerationEvents: 0,
    hardAccelerationEvents: 0,
    totalBrakingEvents: 6,
    hardBrakingEvents: 4,
    fullBrakingEvents: 2,
    corneringEvents: 0,
    abuseEvents: 3,
    speedingEvents: 0,
    assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
    assignmentSubjectType: null,
    assignmentSubjectId: null,
    assignedBookingId: null,
    bookingLinkSource: null,
    isPrivateTrip: false,
    ...overrides,
  };
}

describe('TripAnalyticsCanonicalService', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: TripAnalyticsCanonicalService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new TripAnalyticsCanonicalService(
      prisma,
      new TripAssignmentService(prisma),
      new TripAttributionService(prisma),
    );
  });

  it('hydrates trip list with canonical stress score + event summary', async () => {
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStressScore: 82, sourceSummaryJson: null },
    ]);

    const result = await service.hydrateTrips('org-1', [
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
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
        assignmentSubjectId: 'cust-1',
        assignedBookingId: 'booking-1',
        bookingLinkSource: 'EXPLICIT',
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

    const result = await service.hydrateTrips('org-1', [
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
        assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
        assignmentSubjectType: null,
        assignmentSubjectId: null,
        assignedBookingId: null,
        bookingLinkSource: null,
        isPrivateTrip: true,
      },
    ] as any);

    expect(result[0].canonicalTripSummary.scores.drivingStressScore).toBe(55);
    expect(result[0].canonicalTripSummary.scores.stressLevel).toBe('high');
    expect(result[0].canonicalTripSummary.scores.scoreSource).toBe('vehicle_trip_compat');
  });

  it('does not expose safety score fields', async () => {
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStressScore: 30, sourceSummaryJson: null },
    ]);

    const result = await service.hydrateTrips('org-1', [
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
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
        assignmentSubjectId: 'cust-1',
        assignedBookingId: 'booking-1',
        bookingLinkSource: 'EXPLICIT',
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

    const stats = await service.getVehicleStats('org-1', 'vehicle-1');

    expect(stats.totalTrips).toBe(12);
    expect(stats.avgDrivingStressScore).toBe(74.46);
    expect(stats.stressLevel).toBe('high');
    expect((stats as any).avgSafetyScore).toBeUndefined();
  });

  describe('EXP-021 C0.3 R1 temporal containment (read-time counters)', () => {
    beforeEach(() => {
      prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    });

    it('removes FULL_BRAKING and contained HF abuse from R1 trip counters without writes', async () => {
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'vehicle-1', dimoVehicle: { rawJson: R1_RAW_JSON } }]);
      prisma.tripBehaviorEvent.groupBy.mockResolvedValue([{ tripId: 'trip-1', _count: { _all: 2 } }]);
      prisma.tripDrivingImpact.findMany.mockResolvedValue([
        {
          tripId: 'trip-1',
          drivingStressScore: 88,
          fullBrakingPer100Km: 4,
          sourceSummaryJson: null,
        },
      ]);

      const [hydrated] = await service.hydrateTrips('org-1', [tripWithFullBraking()] as any);

      expect(hydrated.canonicalTripSummary.events).toMatchObject({
        fullBrakingEvents: 0,
        totalBrakingEvents: 4,
        hardBrakingEvents: 4,
        abuseEvents: 1,
      });
      expect(hydrated.canonicalTripSummary.scores.drivingStressScore).toBeNull();
      expect(hydrated.canonicalTripSummary.scores.scoreSource).toBe(
        'r1_temporal_containment_unavailable',
      );
      expect(prisma.tripBehaviorEvent.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tripId: { in: ['trip-1'] },
            eventCategory: 'ABUSE',
            eventType: { in: ['FULL_BRAKING', 'POSSIBLE_IMPACT', 'ENGINE_SHUTDOWN_WHILE_DRIVING'] },
          }),
        }),
      );
      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['vehicle-1'] }, organizationId: 'org-1' } }),
      );
    });

    it('leaves Tesla (API synthetic, hardwareType LTE_R1) counters untouched', async () => {
      prisma.vehicle.findMany.mockResolvedValue([
        { id: 'vehicle-1', dimoVehicle: { rawJson: TESLA_RAW_JSON } },
      ]);

      const [hydrated] = await service.hydrateTrips('org-1', [tripWithFullBraking()] as any);

      expect(hydrated.canonicalTripSummary.events).toMatchObject({
        fullBrakingEvents: 2,
        totalBrakingEvents: 6,
        abuseEvents: 3,
      });
      expect(prisma.tripBehaviorEvent.groupBy).not.toHaveBeenCalled();
    });

    it('does not subtract preserved rows again for trips re-enriched under containment', async () => {
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'vehicle-1', dimoVehicle: { rawJson: R1_RAW_JSON } }]);
      prisma.tripBehaviorEvent.groupBy.mockResolvedValue([{ tripId: 'trip-1', _count: { _all: 2 } }]);
      prisma.vehicleTrip.findMany.mockResolvedValue([
        {
          id: 'trip-1',
          behaviorSummaryJson: { r1TemporalContainment: { version: 'r1-temporal-containment-v1' } },
        },
      ]);

      const [hydrated] = await service.hydrateTrips('org-1', [
        tripWithFullBraking({ totalBrakingEvents: 4, fullBrakingEvents: 0, abuseEvents: 1 }),
      ] as any);

      expect(hydrated.canonicalTripSummary.events).toMatchObject({
        fullBrakingEvents: 0,
        totalBrakingEvents: 4,
        abuseEvents: 1,
      });
    });

    it('leaves UNKNOWN-family (missing rawJson) counters untouched', async () => {
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'vehicle-1', dimoVehicle: null }]);

      const [hydrated] = await service.hydrateTrips('org-1', [tripWithFullBraking()] as any);

      expect(hydrated.canonicalTripSummary.events.fullBrakingEvents).toBe(2);
      expect(hydrated.canonicalTripSummary.events.abuseEvents).toBe(3);
    });

    it('withholds R1 vehicle avg stress when persisted full-braking indicators exist', async () => {
      prisma.vehicleTrip.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: {
          distanceKm: 20,
          totalAccelerationEvents: 0,
          hardAccelerationEvents: 0,
          totalBrakingEvents: 4,
          hardBrakingEvents: 4,
          fullBrakingEvents: 2,
          abuseEvents: 2,
          speedingEvents: 0,
        },
      });
      prisma.tripDrivingImpact.aggregate.mockResolvedValue({
        _avg: { drivingStressScore: 72, fullBrakingPer100Km: 3 },
      });
      prisma.vehicleTrip.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'vehicle-1', dimoVehicle: { rawJson: R1_RAW_JSON } }]);
      prisma.tripBehaviorEvent.groupBy.mockResolvedValue([{ tripId: 'trip-a', _count: { _all: 2 } }]);
      prisma.vehicleTrip.findMany.mockResolvedValue([{ id: 'trip-a', behaviorSummaryJson: {} }]);

      const stats = await service.getVehicleStats('org-1', 'vehicle-1');
      expect(stats.avgDrivingStressScore).toBeNull();
    });

    it('contains R1 vehicle stats totals', async () => {
      prisma.vehicleTrip.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _sum: {
          distanceKm: 40,
          totalAccelerationEvents: 0,
          hardAccelerationEvents: 0,
          totalBrakingEvents: 10,
          hardBrakingEvents: 7,
          fullBrakingEvents: 3,
          abuseEvents: 5,
          speedingEvents: 0,
        },
      });
      prisma.tripDrivingImpact.aggregate.mockResolvedValue({ _avg: { drivingStressScore: null } });
      prisma.vehicleTrip.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.vehicle.findMany.mockResolvedValue([{ id: 'vehicle-1', dimoVehicle: { rawJson: R1_RAW_JSON } }]);
      prisma.tripBehaviorEvent.groupBy.mockResolvedValue([
        { tripId: 'trip-a', _count: { _all: 4 } },
        { tripId: 'trip-b', _count: { _all: 3 } },
      ]);
      prisma.vehicleTrip.findMany.mockResolvedValue([
        { id: 'trip-a', behaviorSummaryJson: { abuseTotal: 5 } },
        { id: 'trip-b', behaviorSummaryJson: { r1TemporalContainment: { version: 'v1' } } },
      ]);

      const stats = await service.getVehicleStats('org-1', 'vehicle-1');

      expect(stats.totalBrakingEvents).toBe(7);
      expect(stats.totalHardBrakingEvents).toBe(7);
      expect(stats.totalAbuseEvents).toBe(1);
    });
  });
});
