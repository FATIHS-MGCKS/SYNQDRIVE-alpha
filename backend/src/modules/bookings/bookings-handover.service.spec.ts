import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { BookingsHandoverService } from './bookings-handover.service';

const actor = {
  userId: 'user-operator-1',
  displayName: 'Field Operator',
  membershipRole: 'WORKER',
};

const orgId = 'org-aaaaaaaa-bbbb-cccc-dddddddddddd';
const bookingId = 'bk-11111111-1111-4111-8111-111111111111';
const vehicleId = 'veh-22222222-2222-4222-8222-222222222222';

const basePayload = {
  odometerKm: 15000,
  fuelPercent: 80,
  fuelFull: false,
  exteriorClean: true,
  interiorClean: true,
  tiresSeasonOk: true,
  warningLightsOn: false,
  documentsAcknowledged: true,
  customerSignatureName: 'Customer Signer',
  customerSignatureDataUrl: 'data:image/png;base64,customer-sig',
  staffSignatureName: 'Staff Signer',
  staffSignatureDataUrl: 'data:image/png;base64,staff-sig',
  damageIds: ['dmg-1'],
  technicalObservations: [
    { description: 'Kratzer Stoßstange', category: 'body', severity: 'low' },
    { description: 'kratzer stoßstange', category: 'body', severity: 'low' },
  ],
};

function protocolRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proto-1',
    bookingId,
    vehicleId,
    kind: 'PICKUP',
    performedAt: new Date('2026-07-15T10:00:00.000Z'),
    performedByUserId: actor.userId,
    performedByName: actor.displayName,
    odometerKm: 15000,
    fuelPercent: 80,
    fuelFull: false,
    exteriorClean: true,
    interiorClean: true,
    tiresSeasonOk: true,
    warningLightsOn: false,
    warningLightsNotes: null,
    notes: null,
    customerSignatureName: basePayload.customerSignatureName,
    customerSignatureDataUrl: basePayload.customerSignatureDataUrl,
    staffSignatureName: basePayload.staffSignatureName,
    staffSignatureDataUrl: basePayload.staffSignatureDataUrl,
    documentsAcknowledged: true,
    damageIds: ['dmg-1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: bookingId,
    vehicleId,
    customerId: 'cust-1',
    status: 'CONFIRMED',
    startDate: new Date('2026-07-15T08:00:00.000Z'),
    endDate: new Date('2026-07-16T08:00:00.000Z'),
    pickupStationId: 'station-pickup',
    returnStationId: 'station-return',
    ...overrides,
  };
}

function createHarness(options: {
  existingPickup?: ReturnType<typeof protocolRow> | null;
  existingReturn?: { id: string } | null;
  booking?: ReturnType<typeof bookingRow> | null;
  vehicleStatus?: VehicleStatus;
  otherActiveBookings?: number;
  pickupOdometer?: number | null;
} = {}) {
  const tx = {
    bookingHandoverProtocol: {
      create: jest.fn().mockImplementation(async ({ data }) =>
        protocolRow({
          id: 'proto-created',
          kind: data.kind,
          odometerKm: data.odometerKm,
          customerSignatureDataUrl: data.customerSignatureDataUrl,
          staffSignatureDataUrl: data.staffSignatureDataUrl,
        }),
      ),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        if (where.bookingId_kind?.kind === 'PICKUP') {
          if (options.pickupOdometer != null) {
            return { odometerKm: options.pickupOdometer };
          }
          return null;
        }
        return null;
      }),
    },
    booking: {
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: bookingId,
        status: data.status,
        vehicleId,
      })),
      count: jest.fn().mockResolvedValue(options.otherActiveBookings ?? 0),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({
        status: options.vehicleStatus ?? VehicleStatus.AVAILABLE,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    vehicleDamage: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    vehicleComplaint: {
      create: jest.fn().mockResolvedValue({ id: 'obs-1' }),
    },
  };

  const prisma = {
    bookingHandoverProtocol: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        if (where.bookingId_kind?.kind === 'PICKUP') {
          return options.existingPickup ?? null;
        }
        if (where.bookingId_kind?.kind === 'RETURN') {
          return options.existingReturn ?? null;
        }
        return null;
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue(options.booking === null ? null : bookingRow(options.booking ?? {})),
    },
    $transaction: jest.fn(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
  };

  const pickupGate = {
    assertPickupAllowed: jest.fn().mockResolvedValue({ allowed: true, overrideUsed: false, requirements: [] }),
  };
  const bookingEligibilityEnforcement = {
    assertAllowedForPickup: jest.fn().mockResolvedValue(undefined),
  };
  const bookingEligibilityRecheck = {
    processPickupPrecheck: jest.fn().mockResolvedValue(undefined),
  };
  const fleetMapCache = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const rentalHealthSummaryCache = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const bookingDocumentGenerationDispatcher = {
    enqueuePickupProtocol: jest.fn().mockResolvedValue(undefined),
    enqueueReturnDocuments: jest.fn().mockResolvedValue(undefined),
  };
  const workflowEvents = { scheduleEmit: jest.fn() };
  const taskAutomation = {
    onPickupHandoverCompleted: jest.fn().mockResolvedValue(undefined),
    onReturnHandoverCompleted: jest.fn().mockResolvedValue(undefined),
  };

  const svc = new BookingsHandoverService(
    prisma as never,
    bookingDocumentGenerationDispatcher as never,
    workflowEvents as never,
    taskAutomation as never,
    fleetMapCache as never,
    rentalHealthSummaryCache as never,
    pickupGate as never,
    { appendInTransaction: jest.fn() } as never,
    bookingEligibilityEnforcement as never,
    bookingEligibilityRecheck as never,
  );

  return {
    svc,
    prisma,
    tx,
    pickupGate,
    bookingEligibilityEnforcement,
    fleetMapCache,
    bookingDocumentGenerationDispatcher,
    workflowEvents,
    taskAutomation,
  };
}

describe('BookingsHandoverService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects pickup when booking belongs to another tenant', async () => {
    const { svc } = createHarness({ booking: null });
    await expect(svc.createHandover(orgId, bookingId, 'PICKUP', basePayload, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('completes pickup: activates booking, rents vehicle, binds signatures and damages', async () => {
    const { svc, tx, pickupGate, bookingDocumentGenerationDispatcher } = createHarness();
    const result = await svc.createHandover(orgId, bookingId, 'PICKUP', basePayload, actor);

    expect(pickupGate.assertPickupAllowed).toHaveBeenCalled();
    expect(result.booking.status).toBe('ACTIVE');
    expect(result.protocol.customerSignatureDataUrl).toBe(basePayload.customerSignatureDataUrl);
    expect(tx.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: VehicleStatus.RENTED }),
      }),
    );
    expect(tx.vehicleDamage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['dmg-1'] }, vehicleId },
        data: expect.objectContaining({ source: 'PICKUP_HANDOVER', bookingId }),
      }),
    );
    expect(tx.vehicleComplaint.create).toHaveBeenCalledTimes(1);
    expect(bookingDocumentGenerationDispatcher.enqueuePickupProtocol).toHaveBeenCalled();
  });

  it('replays pickup idempotently when protocol exists and booking is ACTIVE', async () => {
    const existing = protocolRow();
    const { svc } = createHarness({ existingPickup: existing, booking: bookingRow({ status: 'ACTIVE' }) });
    const result = await svc.createHandover(orgId, bookingId, 'PICKUP', basePayload, actor);
    expect(result.protocol.id).toBe(existing.id);
    expect(result.booking.status).toBe('ACTIVE');
  });

  it('rejects duplicate pickup when booking is not ACTIVE', async () => {
    const { svc } = createHarness({ existingPickup: protocolRow(), booking: bookingRow({ status: 'CONFIRMED' }) });
    await expect(svc.createHandover(orgId, bookingId, 'PICKUP', basePayload, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HANDOVER_ALREADY_EXISTS' }),
    });
  });

  it('rolls back pickup when vehicle is blocked for rental', async () => {
    const { svc, tx } = createHarness({ vehicleStatus: VehicleStatus.IN_SERVICE });
    await expect(svc.createHandover(orgId, bookingId, 'PICKUP', basePayload, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HANDOVER_PICKUP_VEHICLE_BLOCKED' }),
    });
    expect(tx.vehicle.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: VehicleStatus.RENTED }),
      }),
    );
  });

  it('rejects pickup from wrong booking status', async () => {
    const { svc } = createHarness({ booking: bookingRow({ status: 'ACTIVE' }) });
    await expect(svc.createHandover(orgId, bookingId, 'PICKUP', basePayload, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HANDOVER_PICKUP_WRONG_STATUS' }),
    });
  });

  it('rejects performedAt in the future', async () => {
    const { svc } = createHarness();
    await expect(
      svc.createHandover(orgId, bookingId, 'PICKUP', {
        ...basePayload,
        performedAt: '2030-01-01T00:00:00.000Z',
      }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('completes return with km driven and makes vehicle available', async () => {
    const { svc, tx, workflowEvents, bookingDocumentGenerationDispatcher } = createHarness({
      booking: bookingRow({ status: 'ACTIVE' }),
      pickupOdometer: 15000,
    });
    const result = await svc.createHandover(
      orgId,
      bookingId,
      'RETURN',
      { ...basePayload, odometerKm: 15120 },
      actor,
    );

    expect(result.booking.status).toBe('COMPLETED');
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', kmDriven: 120 }),
      }),
    );
    expect(tx.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: VehicleStatus.AVAILABLE }),
      }),
    );
    expect(workflowEvents.scheduleEmit).toHaveBeenCalled();
    expect(bookingDocumentGenerationDispatcher.enqueueReturnDocuments).toHaveBeenCalled();
  });

  it('treats return protocol as immutable when already recorded', async () => {
    const { svc } = createHarness({
      booking: bookingRow({ status: 'ACTIVE' }),
      existingReturn: { id: 'proto-return' },
    });
    await expect(
      svc.createHandover(orgId, bookingId, 'RETURN', { ...basePayload, odometerKm: 16000 }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes findForBooking to tenant booking', async () => {
    const { svc, prisma } = createHarness();
    prisma.booking.findFirst.mockResolvedValueOnce(null);
    await expect(svc.findForBooking(orgId, bookingId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns protocols for tenant booking', async () => {
    const { svc, prisma } = createHarness();
    prisma.booking.findFirst.mockResolvedValue({ id: bookingId });
    prisma.bookingHandoverProtocol.findMany.mockResolvedValue([protocolRow()]);
    const rows = await svc.findForBooking(orgId, bookingId);
    expect(rows).toHaveLength(1);
    expect(rows[0].customerSignatureDataUrl).toBe(basePayload.customerSignatureDataUrl);
  });
});
