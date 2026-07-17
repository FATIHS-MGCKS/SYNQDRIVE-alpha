import { TripAssignmentStatus, TripAssignmentSubjectType } from '@prisma/client';
import { TripAnalyticsCanonicalService } from './trip-analytics-canonical.service';
import { TripAssignmentService } from './trip-assignment.service';
import { TripAttributionService } from './trip-attribution.service';

function makePrisma() {
  return {
    tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]) },
    booking: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    driverAttribution: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'vehicle-1' }) },
    vehicleTrip: { aggregate: jest.fn(), count: jest.fn() },
  } as any;
}

function baseTrip(id: string) {
  return {
    id,
    vehicleId: 'vehicle-1',
    driverName: null,
    startTime: new Date('2026-03-01T08:00:00Z'),
    endTime: new Date('2026-03-01T09:00:00Z'),
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
    bookingLinkSource: null,
    bookingCustomerId: null,
    assignedDriverId: null,
    actualDriverId: null,
    isPrivateTrip: false,
  };
}

describe('TripAnalyticsCanonicalService batch hydration', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let assignmentService: TripAssignmentService;
  let attributionService: TripAttributionService;
  let service: TripAnalyticsCanonicalService;

  beforeEach(() => {
    prisma = makePrisma();
    assignmentService = new TripAssignmentService(prisma);
    attributionService = new TripAttributionService(prisma);
    service = new TripAnalyticsCanonicalService(prisma, assignmentService, attributionService);
  });

  it('hydrates a single trip through the shared batch path', async () => {
    prisma.tripDrivingImpact.findMany.mockResolvedValue([
      { tripId: 'trip-1', drivingStressScore: 42, sourceSummaryJson: null },
    ]);

    const result = await service.hydrateTrip('org-1', baseTrip('trip-1') as any);

    expect(result.canonicalTripSummary.scores.drivingStressScore).toBe(42);
    expect(prisma.tripDrivingImpact.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.driverAttribution.findMany).toHaveBeenCalledTimes(1);
  });

  it('preserves API order for list hydration', async () => {
    const trips = [baseTrip('trip-a'), baseTrip('trip-b'), baseTrip('trip-c')];

    const hydrated = await service.hydrateTrips('org-1', trips as any);

    expect(hydrated.map((trip) => trip.id)).toEqual(['trip-a', 'trip-b', 'trip-c']);
  });

  it('matches sequential assignment + attribution semantics for booking overlap', async () => {
    prisma.booking.findFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id) {
        return {
          id: 'booking-9',
          customerId: 'customer-99',
          assignedDriverId: null,
          allowedDrivers: [],
        };
      }
      return {
        id: 'booking-9',
        vehicleId: 'vehicle-1',
        customerId: 'customer-99',
        assignedDriverId: null,
        startDate: new Date('2026-03-01T07:00:00Z'),
        endDate: new Date('2026-03-01T10:00:00Z'),
        customer: { customerType: 'INDIVIDUAL' },
      };
    });
    prisma.booking.findMany
      .mockResolvedValueOnce([
        {
          id: 'booking-9',
          vehicleId: 'vehicle-1',
          customerId: 'customer-99',
          assignedDriverId: null,
          startDate: new Date('2026-03-01T07:00:00Z'),
          endDate: new Date('2026-03-01T10:00:00Z'),
          customer: { customerType: 'INDIVIDUAL' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'booking-9',
          customerId: 'customer-99',
          assignedDriverId: null,
          allowedDrivers: [],
        },
      ]);

    const trip = {
      ...baseTrip('trip-seq'),
      driverName: 'Driver Name',
    };

    const [batched] = await service.hydrateTrips('org-1', [trip as any]);
    const sequentialAssignment = await assignmentService.resolveForTrip(trip as any);
    const sequentialAttribution = await attributionService.resolveAttributionForTrip('org-1', {
      isPrivateTrip: sequentialAssignment.isPrivateTrip,
      assignmentStatus: sequentialAssignment.assignmentStatus,
      assignedBookingId: sequentialAssignment.assignedBookingId,
      assignmentSubjectId: sequentialAssignment.assignmentSubjectId,
      assignmentSubjectType: sequentialAssignment.assignmentSubjectType,
      bookingLinkSource: sequentialAssignment.bookingLinkSource,
      bookingCustomerId: sequentialAssignment.bookingCustomerId,
      assignedDriverId: sequentialAssignment.assignedDriverId,
      actualDriverId: sequentialAssignment.actualDriverId,
      vehicleId: trip.vehicleId,
      startTime: trip.startTime,
      endTime: trip.endTime,
    });

    expect(batched.canonicalTripSummary.assignment).toEqual(sequentialAssignment);
    expect(batched.canonicalTripSummary.attribution).toEqual(sequentialAttribution);
    expect(batched.canonicalTripSummary.assignment.assignmentStatus).toBe(
      TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
    );
    expect(batched.canonicalTripSummary.assignment.assignmentSubjectType).toBe(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
    );
  });
});
