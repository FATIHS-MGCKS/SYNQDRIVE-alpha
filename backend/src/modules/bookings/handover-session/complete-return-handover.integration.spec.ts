import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as permissionUtil from '@shared/auth/permission.util';
import { CompleteReturnHandoverService } from './complete-return-handover.service';
import { COMPLETE_RETURN_HANDOVER_ERROR } from './complete-return-handover.errors';

const actor = {
  userId: 'user-1',
  displayName: 'Operator',
  membershipRole: 'WORKER',
  platformRole: null,
};

const basePayload = {
  odometerKm: 12500,
  fuelPercent: 60,
  fuelFull: false,
  documentsAcknowledged: true,
  customerSignatureName: 'Customer',
  customerSignatureDataUrl: 'data:image/png;base64,abc',
  staffSignatureName: 'Staff',
  staffSignatureDataUrl: 'data:image/png;base64,def',
  damageIds: ['damage-new-1'] as string[],
};

const bookingRow = {
  id: 'booking-1',
  organizationId: 'org-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  status: 'ACTIVE',
  startDate: new Date('2026-07-20T08:00:00.000Z'),
  endDate: new Date('2026-07-25T18:00:00.000Z'),
  pickupStationId: 'station-1',
  returnStationId: 'station-1',
};

function makeProtocol(overrides: Record<string, unknown> = {}) {
  return {
    id: 'protocol-return-1',
    bookingId: 'booking-1',
    vehicleId: 'vehicle-1',
    kind: 'RETURN' as const,
    performedAt: new Date(),
    performedByUserId: 'user-1',
    performedByName: 'Operator',
    odometerKm: 12500,
    fuelPercent: 60,
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
    damageIds: ['damage-new-1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService(overrides: {
  prisma?: Record<string, unknown>;
  stationAccess?: { resolve: jest.Mock };
  activityLog?: { log: jest.Mock };
  documentDispatcher?: { enqueueReturnDocuments: jest.Mock };
  taskAutomation?: { onReturnHandoverCompleted: jest.Mock };
  workflowEvents?: { scheduleEmit: jest.Mock };
  fleetMapCache?: { invalidate: jest.Mock };
  rentalHealthSummaryCache?: { invalidate: jest.Mock };
}) {
  const txMocks = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    booking: {
      findFirst: jest.fn().mockResolvedValue({ ...bookingRow, status: 'ACTIVE', vehicleId: 'vehicle-1' }),
      update: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'COMPLETED', vehicleId: 'vehicle-1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    bookingHandoverProtocol: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ id: 'pickup-1', odometerKm: 12000 })
        .mockResolvedValueOnce(null),
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
        protocolId: 'protocol-return-1',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    bookingHandoverCompletionAuditEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ status: 'RENTED' }),
      update: jest.fn().mockResolvedValue({}),
    },
    bookingHandoverReturnCompletionIdempotency: {
      create: jest.fn().mockResolvedValue({}),
    },
    bookingHandoverSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    vehicleDamage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    vehicleComplaint: { create: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    bookingHandoverReturnCompletionIdempotency: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    bookingHandoverProtocol: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'pickup-1', odometerKm: 12000 }),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue(bookingRow),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ id: 'vehicle-1', status: 'RENTED' }),
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

  const service = new CompleteReturnHandoverService(
    prisma as never,
    (overrides.stationAccess ?? { resolve: jest.fn().mockResolvedValue({ bypassScope: true, allowedStationIds: null }) }) as never,
    (overrides.activityLog ?? { log: jest.fn().mockResolvedValue({}) }) as never,
    (overrides.documentDispatcher ?? { enqueueReturnDocuments: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.taskAutomation ?? { onReturnHandoverCompleted: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.workflowEvents ?? { scheduleEmit: jest.fn() }) as never,
    (overrides.fleetMapCache ?? { invalidate: jest.fn().mockResolvedValue(undefined) }) as never,
    (overrides.rentalHealthSummaryCache ?? { invalidate: jest.fn().mockResolvedValue(undefined) }) as never,
  );

  return { service, prisma, txMocks };
}

describe('CompleteReturnHandoverService integration', () => {
  beforeEach(() => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('completes return successfully and links new damages', async () => {
    const { service, txMocks } = buildService({});
    const result = await service.completeReturnHandover({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      idempotencyKey: 'return-idem-1',
      payload: basePayload,
      actor,
    });
    expect(result.booking.status).toBe('COMPLETED');
    expect(result.protocol.kind).toBe('RETURN');
    expect(txMocks.vehicleDamage.updateMany).toHaveBeenCalled();
    expect(result.idempotent).toBe(false);
  });

  it('rejects implausible odometer below pickup', async () => {
    const { service } = buildService({
      prisma: {
        bookingHandoverProtocol: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'pickup-1', odometerKm: 12000 }),
        },
      },
    });
    await expect(
      service.completeReturnHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'return-idem-2',
        payload: { ...basePayload, odometerKm: 11000 },
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_RETURN_HANDOVER_ERROR.ODOMETER_IMPLAUSIBLE },
    });
  });

  it('returns cached response for duplicate idempotency key', async () => {
    const cached = {
      idempotent: true,
      booking: { id: 'booking-1', status: 'COMPLETED' },
      protocol: { id: 'protocol-return-1', kind: 'RETURN' },
      sessionId: null,
    };
    const { service, txMocks } = buildService({
      prisma: {
        bookingHandoverReturnCompletionIdempotency: {
          findUnique: jest.fn().mockResolvedValue({ responseJson: cached }),
        },
      },
    });
    const result = await service.completeReturnHandover({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      idempotencyKey: 'return-idem-dup',
      payload: basePayload,
      actor,
    });
    expect(result.idempotent).toBe(true);
    expect(txMocks.vehicleDamage.updateMany).not.toHaveBeenCalled();
  });

  it('rejects concurrent completion via stale session version', async () => {
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'session-1',
            organizationId: 'org-1',
            bookingId: 'booking-1',
            vehicleId: 'vehicle-1',
            kind: 'RETURN',
            status: 'SUBMITTED',
            version: 4,
          }),
        },
      },
    });
    await expect(
      service.completeReturnHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'return-idem-3',
        payload: basePayload,
        actor,
        sessionId: 'session-1',
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_RETURN_HANDOVER_ERROR.VERSION_CONFLICT },
    });
  });

  it('rejects foreign organization booking', async () => {
    const { service } = buildService({
      prisma: {
        booking: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    });
    await expect(
      service.completeReturnHandover({
        organizationId: 'org-other',
        bookingId: 'booking-1',
        idempotencyKey: 'return-idem-4',
        payload: basePayload,
        actor,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid booking state', async () => {
    const { service } = buildService({
      prisma: {
        booking: {
          findFirst: jest.fn().mockResolvedValue({ ...bookingRow, status: 'CONFIRMED' }),
        },
      },
    });
    await expect(
      service.completeReturnHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'return-idem-5',
        payload: basePayload,
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_RETURN_HANDOVER_ERROR.BOOKING_WRONG_STATUS },
    });
  });

  it('succeeds even when document enqueue fails post-commit', async () => {
    const { service } = buildService({
      documentDispatcher: {
        enqueueReturnDocuments: jest.fn().mockRejectedValue(new Error('upload failed')),
      },
    });
    const result = await service.completeReturnHandover({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      idempotencyKey: 'return-idem-6',
      payload: basePayload,
      actor,
    });
    expect(result.booking.status).toBe('COMPLETED');
  });

  it('rolls back on transaction failure', async () => {
    const { service, prisma } = buildService({});
    prisma.$transaction = jest.fn().mockRejectedValue(new Error('db failure'));
    await expect(
      service.completeReturnHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'return-idem-7',
        payload: basePayload,
        actor,
      }),
    ).rejects.toThrow('db failure');
  });

  it('rejects missing permission', async () => {
    jest
      .spyOn(permissionUtil, 'assertMembershipPermission')
      .mockRejectedValue(new ForbiddenException('denied'));
    const { service } = buildService({});
    await expect(
      service.completeReturnHandover({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        idempotencyKey: 'return-idem-8',
        payload: basePayload,
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: COMPLETE_RETURN_HANDOVER_ERROR.PERMISSION_DENIED },
    });
  });
});
