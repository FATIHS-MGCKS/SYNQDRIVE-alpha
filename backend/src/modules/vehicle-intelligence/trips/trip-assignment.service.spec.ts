import {
  TripAssignmentStatus,
  TripAssignmentSubjectType,
} from '@prisma/client';
import { TripAssignmentService } from './trip-assignment.service';

function makeMockPrisma() {
  return {
    vehicleTrip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
    },
  } as any;
}

function makeMockMetrics() {
  return {
    tripAssignmentResolutions: {
      inc: jest.fn(),
    },
  } as any;
}

describe('TripAssignmentService', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let metrics: ReturnType<typeof makeMockMetrics>;
  let service: TripAssignmentService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    metrics = makeMockMetrics();
    service = new TripAssignmentService(prisma, metrics);
  });

  it('resolves explicit driver assignment when driverName exists', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    const result = await service.resolveForTrip({
      id: 'trip-1',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: new Date('2026-03-01T09:00:00Z'),
      driverName: 'Max Mustermann',
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    } as any);

    expect(result.assignmentStatus).toBe(TripAssignmentStatus.ASSIGNED_DRIVER);
    expect(result.assignmentSubjectType).toBe(TripAssignmentSubjectType.DRIVER);
    expect(result.assignmentSubjectId).toBe('Max Mustermann');
    expect(result.scoreEligible).toBe(true);
    expect(metrics.tripAssignmentResolutions.inc).not.toHaveBeenCalled();
  });

  it('marks open trips without assignment as unknown', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    const result = await service.resolveForTrip({
      id: 'trip-2',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: null,
      driverName: null,
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    } as any);

    expect(result.assignmentStatus).toBe(TripAssignmentStatus.UNKNOWN_ASSIGNMENT);
    expect(result.isPrivateTrip).toBe(false);
    expect(result.scoreEligible).toBe(false);
  });

  it('prefers overlapping booking customer assignment', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: 'booking-9',
      customerId: 'customer-99',
    });
    const result = await service.resolveForTrip({
      id: 'trip-3',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: new Date('2026-03-01T09:00:00Z'),
      driverName: 'Driver Name',
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    } as any);

    expect(result.assignmentStatus).toBe(
      TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
    );
    expect(result.assignmentSubjectType).toBe(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
    );
    expect(result.assignmentSubjectId).toBe('customer-99');
    expect(result.assignedBookingId).toBe('booking-9');
  });

  it('records assignment-resolution metric when applying assignment', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue({
      id: 'trip-4',
      vehicleId: 'vehicle-1',
      startTime: new Date('2026-03-01T08:00:00Z'),
      endTime: new Date('2026-03-01T09:00:00Z'),
      driverName: null,
      assignmentStatus: null,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: false,
    });
    prisma.booking.findFirst.mockResolvedValue({
      id: 'booking-11',
      customerId: 'cust-11',
    });
    prisma.vehicleTrip.update.mockResolvedValue({});

    await service.applyAssignmentToTrip('trip-4');

    expect(metrics.tripAssignmentResolutions.inc).toHaveBeenCalledWith({
      status: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      score_eligible: 'yes',
    });
    expect(prisma.vehicleTrip.update).toHaveBeenCalled();
  });
});

