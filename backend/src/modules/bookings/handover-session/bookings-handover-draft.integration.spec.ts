import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as permissionUtil from '@shared/auth/permission.util';
import { BookingsHandoverDraftService } from './bookings-handover-draft.service';
import { HANDOVER_DRAFT_ERROR } from './handover-session-draft.errors';
import { createEmptyHandoverDraftPayload } from './handover-session-draft.payload';

const actor = {
  userId: 'user-1',
  displayName: 'Operator',
  membershipRole: 'WORKER',
  platformRole: null,
};

const bookingRow = {
  id: 'booking-1',
  status: 'CONFIRMED',
  vehicleId: 'vehicle-1',
  pickupStationId: 'station-1',
  returnStationId: 'station-1',
};

function makeSession(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: 'session-1',
    organizationId: 'org-1',
    stationId: 'station-1',
    bookingId: 'booking-1',
    vehicleId: 'vehicle-1',
    kind: 'PICKUP' as const,
    status: 'DRAFT' as const,
    currentStep: 'vehicle',
    version: 1,
    payloadJson: createEmptyHandoverDraftPayload('vehicle', 'station-1'),
    blockingRequirements: [],
    startedByUserId: 'user-1',
    assignedToUserId: 'user-1',
    updatedByUserId: 'user-1',
    lockedByUserId: 'user-1',
    lockedAt: now,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildService(overrides: {
  prisma?: Record<string, unknown>;
  stationAccess?: { resolve: jest.Mock };
}) {
  const prisma = {
    booking: {
      findFirst: jest.fn().mockResolvedValue(bookingRow),
    },
    bookingHandoverSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeSession()),
      update: jest.fn().mockImplementation(async ({ data }) =>
        makeSession({
          version: data.version?.increment ? 2 : 1,
          status: data.status ?? 'DRAFT',
          currentStep: data.currentStep ?? 'vehicle',
          payloadJson: data.payloadJson,
        }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bookingHandoverProtocol: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    organizationMembership: {
      findFirst: jest.fn().mockResolvedValue({
        role: 'WORKER',
        status: 'ACTIVE',
        permissions: { bookings: { read: true, write: true } },
      }),
    },
    ...overrides.prisma,
  };

  const service = new BookingsHandoverDraftService(
    prisma as never,
    (overrides.stationAccess ??
      { resolve: jest.fn().mockResolvedValue({ bypassScope: true, allowedStationIds: null }) }) as never,
  );

  return { service, prisma };
}

describe('BookingsHandoverDraftService integration', () => {
  beforeEach(() => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a new draft', async () => {
    const { service } = buildService({});
    const draft = await service.createDraft({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      kind: 'PICKUP',
      actor,
      currentStep: 'vehicle',
    });
    expect(draft.version).toBe(1);
    expect(draft.kind).toBe('PICKUP');
    expect(draft.editable).toBe(true);
  });

  it('resumes an existing draft', async () => {
    const existing = makeSession({ version: 3, currentStep: 'condition' });
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue(existing),
        },
      },
    });
    const view = await service.getDraft('org-1', 'booking-1', 'PICKUP', actor);
    expect(view.draft?.version).toBe(3);
    expect(view.draft?.currentStep).toBe('condition');
  });

  it('rejects version conflict on update', async () => {
    const existing = makeSession({ version: 2 });
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue(existing),
        },
      },
    });
    await expect(
      service.updateDraft({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        actor,
        expectedVersion: 1,
        currentStep: 'condition',
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_DRAFT_ERROR.VERSION_CONFLICT },
    });
  });

  it('rejects foreign station scope', async () => {
    const { service } = buildService({
      stationAccess: {
        resolve: jest.fn().mockResolvedValue({
          bypassScope: false,
          allowedStationIds: ['station-other'],
        }),
      },
    });
    await expect(
      service.createDraft({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        actor,
        actualStationId: 'station-foreign',
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_DRAFT_ERROR.SCOPE_DENIED },
    });
  });

  it('rejects editing a completed draft', async () => {
    const existing = makeSession({ status: 'COMPLETED', version: 5 });
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue(existing),
        },
      },
    });
    await expect(
      service.updateDraft({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        actor,
        expectedVersion: 5,
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_DRAFT_ERROR.NOT_EDITABLE },
    });
  });

  it('returns not found when updating after cancel (no active draft)', async () => {
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    });
    await expect(
      service.updateDraft({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        actor,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_DRAFT_ERROR.NOT_FOUND },
    });
  });

  it('detects parallel editing via lock conflict', async () => {
    const existing = makeSession({ version: 2, lockedByUserId: 'user-other' });
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue(existing),
        },
      },
    });
    await expect(
      service.updateDraft({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        actor,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_DRAFT_ERROR.LOCK_CONFLICT },
    });
  });

  it('cancels an active draft', async () => {
    const existing = makeSession({ version: 2 });
    const { service, prisma } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue(existing),
          update: jest.fn().mockResolvedValue(makeSession({ status: 'CANCELLED', version: 3 })),
        },
      },
    });
    const result = await service.cancelDraft({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      kind: 'PICKUP',
      actor,
      expectedVersion: 2,
      cancelReason: 'Operator aborted',
    });
    expect(result?.status).toBe('CANCELLED');
    expect(prisma.bookingHandoverSession.update).toHaveBeenCalled();
  });
});
