import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as permissionUtil from '@shared/auth/permission.util';
import {
  CorrectHandoverCompletionService,
  verifyCompletionRecordIntegrity,
} from './correct-handover-completion.service';
import { HANDOVER_COMPLETION_RECORD_ERROR } from './handover-completion-record.errors';
import {
  buildHandoverCompletionCanonicalPayload,
  hashHandoverCompletionPayload,
  hashHandoverSignedContent,
} from './handover-completion-payload.canonical';

const actor = {
  userId: 'user-1',
  displayName: 'Operator',
  membershipRole: 'WORKER',
  platformRole: null,
};

const originalCanonical = buildHandoverCompletionCanonicalPayload(
  {
    odometerKm: 12000,
    fuelPercent: 80,
    fuelFull: false,
    documentsAcknowledged: true,
    customerSignatureName: 'Customer',
    customerSignatureDataUrl: 'data:image/png;base64,abc',
    staffSignatureName: 'Staff',
    staffSignatureDataUrl: 'data:image/png;base64,def',
    damageIds: ['damage-1'],
  },
  {
    organizationId: 'org-1',
    bookingId: 'booking-1',
    vehicleId: 'vehicle-1',
    customerId: 'customer-1',
    stationId: 'station-1',
    kind: 'PICKUP',
    documentVersion: 1,
    protocolVersion: 1,
    performedAt: '2026-07-25T10:00:00.000Z',
  },
);

const currentProtocol = {
  id: 'protocol-v1',
  organizationId: 'org-1',
  bookingId: 'booking-1',
  vehicleId: 'vehicle-1',
  kind: 'PICKUP' as const,
  version: 1,
  isCurrent: true,
  performedAt: new Date('2026-07-25T10:00:00.000Z'),
  odometerKm: 12000,
  fuelPercent: 80,
};

const currentRecord = {
  id: 'record-v1',
  organizationId: 'org-1',
  bookingId: 'booking-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  stationId: 'station-1',
  protocolId: 'protocol-v1',
  kind: 'PICKUP' as const,
  documentVersion: 1,
  version: 1,
  payloadCanonical: originalCanonical,
  payloadHash: hashHandoverCompletionPayload(originalCanonical),
  signedContentHash: 'signed-hash',
  isCurrent: true,
  supersededAt: null,
};

function buildService(overrides: {
  prisma?: Record<string, unknown>;
  activityLog?: { log: jest.Mock };
}) {
  const txMocks = {
    bookingHandoverProtocol: {
      findFirst: jest.fn().mockResolvedValue(currentProtocol),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({
        id: 'protocol-v2',
        version: 2,
        performedAt: currentProtocol.performedAt,
      }),
    },
    bookingHandoverCompletionRecord: {
      findFirst: jest.fn().mockResolvedValue({ id: 'record-v1', version: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({
        id: 'record-v2',
        version: 2,
        documentVersion: 2,
        payloadHash: 'new-hash',
        signedContentHash: 'new-signed-hash',
        protocolId: 'protocol-v2',
      }),
    },
    bookingHandoverCompletionAuditEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    booking: {
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const prisma = {
    booking: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'booking-1',
        vehicleId: 'vehicle-1',
        customerId: 'customer-1',
        pickupStationId: 'station-1',
        returnStationId: 'station-1',
        status: 'ACTIVE',
      }),
    },
    bookingHandoverProtocol: {
      findFirst: jest.fn().mockResolvedValue(currentProtocol),
    },
    bookingHandoverCompletionRecord: {
      findFirst: jest.fn().mockResolvedValue(currentRecord),
    },
    $transaction: jest.fn(async (fn: (tx: typeof txMocks) => Promise<unknown>) => fn(txMocks)),
    ...overrides.prisma,
  };

  const service = new CorrectHandoverCompletionService(
    prisma as never,
    (overrides.activityLog ?? { log: jest.fn().mockResolvedValue({}) }) as never,
  );

  return { service, prisma, txMocks };
}

describe('CorrectHandoverCompletionService', () => {
  beforeEach(() => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a linked correction version without mutating the original record payload', async () => {
    const { service, txMocks } = buildService({});
    const result = await service.correctHandoverCompletion({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      kind: 'PICKUP',
      correctionReason: 'Odometer typo corrected',
      payload: {
        odometerKm: 12050,
        fuelPercent: 80,
        documentsAcknowledged: true,
        customerSignatureName: 'Customer',
        customerSignatureDataUrl: 'data:image/png;base64,abc2',
        staffSignatureName: 'Staff',
        staffSignatureDataUrl: 'data:image/png;base64,def2',
      },
      actor,
    });

    expect(result.version).toBe(2);
    expect(result.previousCompletionRecordId).toBe('record-v1');
    expect(txMocks.bookingHandoverProtocol.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'protocol-v1', isCurrent: true }),
        data: expect.objectContaining({ isCurrent: false }),
      }),
    );
    expect(txMocks.bookingHandoverCompletionRecord.create).toHaveBeenCalled();
    expect(currentRecord.payloadCanonical).toEqual(originalCanonical);
  });

  it('rejects correction without override permission', async () => {
    jest
      .spyOn(permissionUtil, 'assertMembershipPermission')
      .mockRejectedValue(new ForbiddenException('denied'));
    const { service } = buildService({});
    await expect(
      service.correctHandoverCompletion({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        correctionReason: 'Fix',
        payload: {
          odometerKm: 12050,
          fuelPercent: 80,
          documentsAcknowledged: true,
          customerSignatureName: 'Customer',
          customerSignatureDataUrl: 'data:image/png;base64,abc',
          staffSignatureName: 'Staff',
          staffSignatureDataUrl: 'data:image/png;base64,def',
        },
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_COMPLETION_RECORD_ERROR.OVERRIDE_PERMISSION_DENIED },
    });
  });

  it('rejects correction without reason', async () => {
    const { service } = buildService({});
    await expect(
      service.correctHandoverCompletion({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        correctionReason: '   ',
        payload: {
          odometerKm: 12050,
          fuelPercent: 80,
          documentsAcknowledged: true,
          customerSignatureName: 'Customer',
          customerSignatureDataUrl: 'data:image/png;base64,abc',
          staffSignatureName: 'Staff',
          staffSignatureDataUrl: 'data:image/png;base64,def',
        },
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_COMPLETION_RECORD_ERROR.CORRECTION_REASON_REQUIRED },
    });
  });

  it('requires signatures when signed content changes', async () => {
    const { service } = buildService({});
    await expect(
      service.correctHandoverCompletion({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        correctionReason: 'Fuel level corrected',
        payload: {
          odometerKm: 12000,
          fuelPercent: 40,
          documentsAcknowledged: true,
        },
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_COMPLETION_RECORD_ERROR.SIGNATURE_REQUIRED },
    });
  });

  it('verifies completion record integrity from canonical payload', () => {
    const payloadHash = hashHandoverCompletionPayload(originalCanonical);
    expect(
      verifyCompletionRecordIntegrity({
        payloadCanonical: originalCanonical,
        payloadHash,
        signedContentHash: hashHandoverSignedContent(originalCanonical),
      }),
    ).toBe(true);
  });

  it('rejects correction when current protocol is missing', async () => {
    const { service } = buildService({
      prisma: {
        bookingHandoverProtocol: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    });
    await expect(
      service.correctHandoverCompletion({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        kind: 'PICKUP',
        correctionReason: 'Too late',
        payload: {
          odometerKm: 12050,
          fuelPercent: 80,
          documentsAcknowledged: true,
          customerSignatureName: 'Customer',
          customerSignatureDataUrl: 'data:image/png;base64,abc',
          staffSignatureName: 'Staff',
          staffSignatureDataUrl: 'data:image/png;base64,def',
        },
        actor,
      }),
    ).rejects.toMatchObject({
      response: { code: HANDOVER_COMPLETION_RECORD_ERROR.PROTOCOL_NOT_FOUND },
    });
  });
});
