import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as permissionUtil from '@shared/auth/permission.util';
import { CompletePickupHandoverService } from './complete-pickup-handover.service';
import { COMPLETE_PICKUP_HANDOVER_ERROR } from './complete-pickup-handover.errors';

const actor = {
  userId: 'user-1',
  displayName: 'Operator',
  membershipRole: 'WORKER',
  platformRole: null,
};

const basePayload = {
  odometerKm: 12000,
  fuelPercent: 80,
  fuelFull: false,
  documentsAcknowledged: true,
  customerSignatureName: 'Customer',
  customerSignatureDataUrl: 'data:image/png;base64,abc',
  staffSignatureName: 'Staff',
  staffSignatureDataUrl: 'data:image/png;base64,def',
  damageIds: [] as string[],
};

const bookingRow = {
  id: 'booking-1',
  organizationId: 'org-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  status: 'CONFIRMED',
  startDate: new Date('2026-07-20T08:00:00.000Z'),
  endDate: new Date('2026-07-25T18:00:00.000Z'),
  pickupStationId: 'station-1',
  returnStationId: 'station-1',
};

function makeProtocol(overrides: Record<string, unknown> = {}) {
  return {
    id: 'protocol-1',
    bookingId: 'booking-1',
    vehicleId: 'vehicle-1',
    kind: 'PICKUP' as const,
    performedAt: new Date(),
    performedByUserId: 'user-1',
    performedByName: 'Operator',
    odometerKm: 12000,
    fuelPercent: 80,
    fuelFull: false,
    exteriorClean: true,
    interiorClean: true,
    tiresSeasonOk: true,
    warningLightsOn: false,
    warningLightsNotes: null,
    notes: null,
    customerSignatureName: 'Customer',
    customerSignatureDataUrl: 'data:image/png;base64,abc',
    staffSignatureName: 'Staff',
    staffSignatureDataUrl: 'data:image/png;base64,def',
    documentsAcknowledged: true,
    damageIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService(overrides: {
  prisma?: Record<string, unknown>;
  stationAccess?: { resolve: jest.Mock };
  pickupGate?: { assertPickupAllowed: jest.Mock };
  eligibilityRecheck?: { processPickupPrecheck: jest.Mock };
  eligibilityEnforcement?: { assertAllowedForPickup: jest.Mock };
  rentalHealth?: { isRentalBlocked: jest.Mock };
  activityLog?: { log: jest.Mock };
  documentDispatcher?: { enqueuePickupProtocol: jest.Mock };
  taskAutomation?: { onPickupHandoverCompleted: jest.Mock };
  workflowEvents?: { scheduleEmit: jest.Mock };
  fleetMapCache?: { invalidate: jest.Mock };
  rentalHealthSummaryCache?: { invalidate: jest.Mock };
  pickupGateAudit?: { appendInTransaction: jest.Mock };
}) {
  const txMocks = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    booking: {
      findFirst: jest.fn().mockResolvedValue({ ...bookingRow, status: 'CONFIRMED', vehicleId: 'vehicle-1' }),
      update: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'ACTIVE', vehicleId: 'vehicle-1' }),
    },
    bookingHandoverProtocol: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeProtocol()),
    },
    bookingHandoverCompletionRecord: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'completion-record-1',
        version: 1,
        documentVersion: 1,
        payloadHash: 'hash',
        signedContentHash: 'signed-hash',
        protocolId: 'protocol-1',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    bookingHandoverCompletionAuditEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ id: 'vehicle-1', status: 'AVAILABLE' }),
      update: jest.fn().mockResolvedValue({}),
    },
    bookingHandoverPickupCompletionIdempotency: {
      create: jest.fn().mockResolvedValue({}),
    },
    bookingHandoverSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    vehicleDamage: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    vehicleComplaint: { create: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    bookingHandoverPickupCompletionIdempotency: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    bookingHandoverProtocol: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue(bookingRow),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ id: 'vehicle-1', status: 'AVAILABLE' }),
    },
    bookingHandoverSession: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    organizationMembership: {
      findFirst: jest.fn().mockResolvedValue({
        role: 'WORKER',
        status: 'ACTIVE',
        permissions: { bookings: { read: true, write: true } },
      }),
    },
    $transaction: jest.fn(async (fn: (tx: typeof txMocks) => Promise<unknown>) => fn(txMocks)),
    ...overrides.prisma,
  };

  const service = new CompletePickupHandoverService(
    prisma as never,
    (overrides.stationAccess ?? { resolve: jest.fn().mockResolvedValue({ bypassScope: true, allowedStationIds: null }) }) as never,
    (overrides.pickupGate ?? {
      assertPickupAllowed: jest.fn().mockResolvedValue({
        allowed: true,
        overrideUsed: false,
        requirements: [],
        hardBlocks: [],
        softBlocks: [],
      }),
    }) as never,
    (overrides.pickupGateAudit ?? { appendInTransaction: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.eligibilityRecheck ?? { processPickupPrecheck: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.eligibilityEnforcement ?? { assertAllowedForPickup: jest.fn().mockResolvedValue({ status: 'ALLOWED' }) }) as never,
    (overrides.rentalHealth ?? { isRentalBlocked: jest.fn().mockResolvedValue({ blocked: false, reasons: [] }) }) as never,
    (overrides.activityLog ?? { log: jest.fn().mockResolvedValue({}) }) as never,
    (overrides.documentDispatcher ?? { enqueuePickupProtocol: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.taskAutomation ?? { onPickupHandoverCompleted: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.workflowEvents ?? { scheduleEmit: jest.fn() }) as never,
    (overrides.fleetMapCache ?? { invalidate: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.rentalHealthSummaryCache ?? { invalidate: jest.fn().mockResolvedValue(undefined) }) as never,
  );

  return { service, prisma, txMocks };
}

describe('CompletePickupHandoverService integration', () => {
  beforeEach(() => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('completes pickup successfully', async () => {
    const { service } = buildService({});
    const result = await service.completePickupHandover({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      idempotencyKey: 'idem-1',
      payload: basePayload,
      actor,
    });
    expect(result.booking.status).toBe('ACTIVE');
    expect(result.protocol.id).toBe('protocol-1');
    expect(result.idempotent).toBe(false);
  });

  it('returns cached response for duplicate idempotency key', async () => {
    const cached = {
      idempotent: true,
      booking: { id: 'booking-1', status: 'ACTIVE' },
      protocol: { id: 'protocol-1' },
      sessionId: null,
    };
    const { service } = buildService({
      prisma: {
        bookingHandoverPickupCompletionIdempotency: {
          findUnique: jest.fn().mockResolvedValue({ responseJson: cached }),
        },
      },
    });
    const result = await service.completePickupHandover({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      idempotencyKey: 'idem-dup',
      payload: basePayload,
      actor,
    });
    expect(result.idempotent).toBe(true);
    expect(result.protocol.id).toBe('protocol-1');
  });

  it('returns existing protocol when booking already ACTIVE', async () => {
    const protocol = makeProtocol();
    const { service } = buildService({
      prisma: {
        bookingHandoverProtocol: {
          findFirst: jest.fn().mockResolvedValue(protocol),
        },
        booking: {
          findFirst: jest.fn().mockResolvedValue({ ...bookingRow, status: 'ACTIVE' }),
        },
      },
    });
    const result = await service.completePickupHandover({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      idempotencyKey: 'idem-2',
      payload: basePayload,
      actor,
    });
    expect(result.idempotent).toBe(true);
    expect(result.protocol.id).toBe('protocol-1');
  });

  it('rejects stale session version', async () => {
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'session-1',
            organizationId: 'org-1',
            bookingId: 'booking-1',
            vehicleId: 'vehicle-1',
            kind: 'PICKUP',
            status: 'SUBMITTED',
            version: 5,
          }),
        },
      },
    });
    await expect(
      service.completePickupHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'idem-3',
        payload: basePayload,
        actor,
        sessionId: 'session-1',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_PICKUP_HANDOVER_ERROR.VERSION_CONFLICT },
    });
  });

  it('rejects missing permission', async () => {
    jest
      .spyOn(permissionUtil, 'assertMembershipPermission')
      .mockRejectedValue(new ForbiddenException('denied'));
    const { service } = buildService({});
    await expect(
      service.completePickupHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'idem-4',
        payload: basePayload,
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_PICKUP_HANDOVER_ERROR.PERMISSION_DENIED },
    });
  });

  it('rejects foreign organization booking', async () => {
    const { service } = buildService({
      prisma: {
        booking: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    });
    await expect(
      service.completePickupHandover({
        organizationId: 'org-other',
        bookingId: 'booking-1',
        idempotencyKey: 'idem-5',
        payload: basePayload,
        actor,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects missing signatures', async () => {
    const { service } = buildService({});
    await expect(
      service.completePickupHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'idem-6',
        payload: {
          ...basePayload,
          customerSignatureDataUrl: null,
          customerSignatureName: null,
        },
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_PICKUP_HANDOVER_ERROR.SIGNATURE_REQUIRED },
    });
  });

  it('rejects eligibility / license gate failure', async () => {
    const { service } = buildService({
      eligibilityEnforcement: {
        assertAllowedForPickup: jest.fn().mockRejectedValue(
          new ConflictException({
            code: 'BOOKING_ELIGIBILITY_NOT_ELIGIBLE',
            message: 'Driver license verification required',
          }),
        ),
      },
    });
    await expect(
      service.completePickupHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'idem-7',
        payload: basePayload,
        actor,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects rental-blocked vehicle', async () => {
    const { service } = buildService({
      rentalHealth: {
        isRentalBlocked: jest.fn().mockResolvedValue({
          blocked: true,
          reasons: ['tires critical'],
        }),
      },
    });
    await expect(
      service.completePickupHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'idem-8',
        payload: basePayload,
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_PICKUP_HANDOVER_ERROR.VEHICLE_RENTAL_BLOCKED },
    });
  });

  it('rolls back entire transaction on database failure', async () => {
    const { service, prisma } = buildService({});
    prisma.$transaction = jest.fn().mockRejectedValue(new Error('db failure'));
    await expect(
      service.completePickupHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'idem-9',
        payload: basePayload,
        actor,
      }),
    ).rejects.toThrow('db failure');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
