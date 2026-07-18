import { ConflictException } from '@nestjs/common';
import { BookingsHandoverService } from './bookings-handover.service';
import { StationValidationService } from '@modules/stations/station-validation.service';

const ORG = 'org-handover-position';
const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STATION_PICKUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_RETURN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STATION_OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID = 'user-handover';

describe('BookingsHandoverService station position wiring', () => {
  const booking = {
    id: BOOKING_ID,
    vehicleId: VEHICLE_ID,
    customerId: 'cust-1',
    status: 'CONFIRMED' as const,
    startDate: new Date('2026-07-18T08:00:00.000Z'),
    endDate: new Date('2026-07-20T18:00:00.000Z'),
    pickupStationId: STATION_PICKUP,
    returnStationId: STATION_RETURN,
  };

  const vehicleState = {
    status: 'AVAILABLE' as const,
    homeStationId: STATION_PICKUP,
    currentStationId: STATION_PICKUP,
    expectedStationId: STATION_RETURN,
    currentStationSource: 'MANUAL' as const,
    stationPositionVersion: 3,
  };

  const tx = {
    bookingHandoverProtocol: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    booking: {
      update: jest.fn(),
      count: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    vehicleDamage: {
      updateMany: jest.fn(),
    },
    vehicleComplaint: {
      create: jest.fn(),
    },
  };

  const prisma = {
    booking: {
      findFirst: jest.fn(),
    },
    bookingHandoverProtocol: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const stationValidation = {
    assertVehicleStationAssignment: jest.fn(),
  } as unknown as StationValidationService;

  const bookingDocumentBundleService = {
    generatePickupProtocolDocument: jest.fn().mockResolvedValue(undefined),
    generateReturnProtocolDocument: jest.fn().mockResolvedValue(undefined),
    generateFinalInvoiceAndDocument: jest.fn().mockResolvedValue(undefined),
  };

  const taskAutomation = {
    onPickupHandoverCompleted: jest.fn().mockResolvedValue(undefined),
    onReturnHandoverCompleted: jest.fn().mockResolvedValue(undefined),
  };

  const service = new BookingsHandoverService(
    prisma as never,
    bookingDocumentBundleService as never,
    { scheduleEmit: jest.fn() } as never,
    taskAutomation as never,
    { invalidate: jest.fn() } as never,
    stationValidation,
  );

  const basePayload = {
    odometerKm: 1000,
    fuelPercent: 80,
    performedByUserId: USER_ID,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (booking as { status: string }).status = 'CONFIRMED';
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ ...booking });
    (prisma.bookingHandoverProtocol.findUnique as jest.Mock).mockResolvedValue(null);
    (tx.bookingHandoverProtocol.create as jest.Mock).mockResolvedValue({
      id: 'proto-1',
      bookingId: BOOKING_ID,
      vehicleId: VEHICLE_ID,
      kind: 'PICKUP',
      performedAt: new Date('2026-07-18T09:00:00.000Z'),
      performedByUserId: USER_ID,
      performedByName: null,
      odometerKm: 1000,
      fuelPercent: 80,
      fuelFull: false,
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      warningLightsNotes: null,
      notes: null,
      customerSignatureName: null,
      customerSignatureDataUrl: null,
      staffSignatureName: null,
      staffSignatureDataUrl: null,
      documentsAcknowledged: false,
      damageIds: [],
      createdAt: new Date('2026-07-18T09:00:00.000Z'),
      updatedAt: new Date('2026-07-18T09:00:00.000Z'),
    });
    (tx.booking.update as jest.Mock).mockResolvedValue({
      id: BOOKING_ID,
      status: 'ACTIVE',
      vehicleId: VEHICLE_ID,
    });
    (tx.vehicle.findFirst as jest.Mock).mockResolvedValue(vehicleState);
    (tx.vehicle.update as jest.Mock).mockResolvedValue({});
    (tx.booking.count as jest.Mock).mockResolvedValue(0);
    (stationValidation.assertVehicleStationAssignment as jest.Mock).mockResolvedValue(undefined);
  });

  it('pickup clears current position and preserves home/expected', async () => {
    await service.createHandover(ORG, BOOKING_ID, 'PICKUP', {
      ...basePayload,
      actualStationId: STATION_PICKUP,
    });

    expect(tx.vehicle.update).toHaveBeenCalledWith({
      where: { id: VEHICLE_ID },
      data: {
        status: 'RENTED',
        currentStationId: null,
        currentStationSource: null,
        currentStationConfirmedAt: null,
        currentStationConfirmedByUserId: null,
        stationPositionVersion: { increment: 1 },
      },
    });
    expect(stationValidation.assertVehicleStationAssignment).not.toHaveBeenCalled();
  });

  it('pickup is idempotent when current position is already cleared', async () => {
    (tx.vehicle.findFirst as jest.Mock).mockResolvedValue({
      ...vehicleState,
      currentStationId: null,
      currentStationSource: null,
    });

    await service.createHandover(ORG, BOOKING_ID, 'PICKUP', basePayload);

    expect(tx.vehicle.update).toHaveBeenCalledWith({
      where: { id: VEHICLE_ID },
      data: { status: 'RENTED' },
    });
  });

  it('return confirms actual return station with RETURN provenance and preserves home', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      status: 'ACTIVE',
    });
    (tx.booking.update as jest.Mock).mockResolvedValue({
      id: BOOKING_ID,
      status: 'COMPLETED',
      vehicleId: VEHICLE_ID,
    });
    (tx.bookingHandoverProtocol.findUnique as jest.Mock).mockResolvedValue({
      odometerKm: 900,
    });

    await service.createHandover(ORG, BOOKING_ID, 'RETURN', {
      ...basePayload,
      odometerKm: 1100,
      actualStationId: STATION_RETURN,
    });

    expect(stationValidation.assertVehicleStationAssignment).toHaveBeenCalledWith(
      ORG,
      VEHICLE_ID,
      STATION_RETURN,
      'current',
    );
    expect(tx.vehicle.update).toHaveBeenCalledWith({
      where: { id: VEHICLE_ID },
      data: expect.objectContaining({
        status: 'AVAILABLE',
        currentStationId: STATION_RETURN,
        currentStationSource: 'RETURN',
        currentStationConfirmedByUserId: USER_ID,
        stationPositionVersion: { increment: 1 },
        expectedStationId: null,
        expectedStationSource: null,
        expectedStationSetAt: null,
      }),
    });
    const updateData = (tx.vehicle.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.homeStationId).toBeUndefined();
  });

  it('one-way return keeps expected when actual return does not fulfill destination', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      status: 'ACTIVE',
    });
    (tx.booking.update as jest.Mock).mockResolvedValue({
      id: BOOKING_ID,
      status: 'COMPLETED',
      vehicleId: VEHICLE_ID,
    });
    (tx.bookingHandoverProtocol.findUnique as jest.Mock).mockResolvedValue({
      odometerKm: 900,
    });

    await service.createHandover(ORG, BOOKING_ID, 'RETURN', {
      ...basePayload,
      odometerKm: 1100,
      actualStationId: STATION_OTHER,
    });

    const updateData = (tx.vehicle.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.currentStationId).toBe(STATION_OTHER);
    expect(updateData.expectedStationId).toBeUndefined();
    expect(updateData.expectedStationSource).toBeUndefined();
  });

  it('rolls back return when target station validation fails', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      status: 'ACTIVE',
    });
    (stationValidation.assertVehicleStationAssignment as jest.Mock).mockRejectedValue(
      new ConflictException('archived'),
    );

    await expect(
      service.createHandover(ORG, BOOKING_ID, 'RETURN', {
        ...basePayload,
        actualStationId: STATION_RETURN,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.vehicle.update).not.toHaveBeenCalled();
  });

  it('rejects pickup when booking is not CONFIRMED', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...booking,
      status: 'PENDING',
    });

    await expect(
      service.createHandover(ORG, BOOKING_ID, 'PICKUP', basePayload),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HANDOVER_PICKUP_WRONG_STATUS' }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
