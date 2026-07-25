import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OperatorUploadService } from './operator-upload.service';
import { OPERATOR_UPLOAD_ERROR } from './operator-upload.constants';

const bookingRow = {
  id: 'booking-1',
  vehicleId: 'vehicle-1',
};

const sessionRow = {
  id: 'session-1',
  organizationId: 'org-1',
  bookingId: 'booking-1',
  vehicleId: 'vehicle-1',
  kind: 'PICKUP' as const,
  status: 'DRAFT' as const,
};

function makeUpload(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'upload-1',
    organizationId: 'org-1',
    clientUploadId: 'client-1',
    kind: 'DAMAGE_IMAGE' as const,
    status: 'PENDING' as const,
    bookingId: 'booking-1',
    handoverSessionId: 'session-1',
    vehicleId: 'vehicle-1',
    handoverKind: 'PICKUP' as const,
    mimeType: 'image/jpeg',
    fileName: 'damage.jpg',
    fileSizeBytes: null,
    contentSha256: null,
    storagePayload: null,
    targetRefType: null,
    targetRefId: null,
    errorCode: null,
    errorMessage: null,
    retryable: true,
    attemptCount: 0,
    maxAttempts: 5,
    lastAttemptAt: null,
    progressPercent: null,
    requiredForComplete: false,
    uploadedByUserId: 'user-1',
    cancelledAt: null,
    expiresAt: new Date(now.getTime() + 86400000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildService(overrides: { prisma?: Record<string, unknown> } = {}) {
  const prisma = {
    booking: {
      findFirst: jest.fn().mockResolvedValue(bookingRow),
    },
    bookingHandoverSession: {
      findFirst: jest.fn().mockResolvedValue(sessionRow),
    },
    operatorUpload: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => makeUpload(data)),
      update: jest.fn().mockImplementation(async ({ where, data }) =>
        makeUpload({ id: where.id, ...data, status: data.status ?? 'UPLOADED' }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides.prisma,
  };
  return { service: new OperatorUploadService(prisma as never), prisma };
}

describe('OperatorUploadService integration', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('deduplicates register by clientUploadId', async () => {
    const existing = makeUpload();
    const { service, prisma } = buildService({
      prisma: {
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(existing),
          create: jest.fn(),
        },
      },
    });
    const result = await service.registerUpload({
      organizationId: 'org-1',
      clientUploadId: 'client-1',
      kind: 'DAMAGE_IMAGE',
      bookingId: 'booking-1',
      vehicleId: 'vehicle-1',
      handoverSessionId: 'session-1',
    });
    expect(result.clientUploadId).toBe('client-1');
    expect(prisma.operatorUpload.create).not.toHaveBeenCalled();
  });

  it('rejects foreign handover session', async () => {
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      },
    });
    await expect(
      service.registerUpload({
        organizationId: 'org-1',
        clientUploadId: 'client-foreign',
        kind: 'DAMAGE_IMAGE',
        bookingId: 'booking-1',
        vehicleId: 'vehicle-1',
        handoverSessionId: 'foreign-session',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects cancelled draft session', async () => {
    const { service } = buildService({
      prisma: {
        bookingHandoverSession: {
          findFirst: jest.fn().mockResolvedValue({ ...sessionRow, status: 'CANCELLED' }),
        },
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      },
    });
    await expect(
      service.registerUpload({
        organizationId: 'org-1',
        clientUploadId: 'client-cancelled',
        kind: 'DAMAGE_IMAGE',
        bookingId: 'booking-1',
        vehicleId: 'vehicle-1',
        handoverSessionId: 'session-1',
      }),
    ).rejects.toMatchObject({
      response: { code: OPERATOR_UPLOAD_ERROR.SESSION_CANCELLED },
    });
  });

  it('uploads binary and marks uploaded', async () => {
    const pending = makeUpload();
    const { service } = buildService({
      prisma: {
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(pending),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockImplementation(async ({ data }) =>
            makeUpload({ status: data.status, progressPercent: data.progressPercent }),
          ),
        },
      },
    });
    const result = await service.uploadBinary({
      organizationId: 'org-1',
      clientUploadId: 'client-1',
      buffer: pngHeader,
      mimeType: 'image/png',
      fileName: 'x.png',
    });
    expect(result.status).toBe('UPLOADED');
    expect(result.progressPercent).toBe(100);
  });

  it('rejects invalid mime without retry', async () => {
    const pending = makeUpload();
    const { service } = buildService({
      prisma: {
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(pending),
          update: jest.fn().mockImplementation(async ({ data }) =>
            makeUpload({ status: data.status, retryable: data.retryable, errorCode: data.errorCode }),
          ),
        },
      },
    });
    await expect(
      service.uploadBinary({
        organizationId: 'org-1',
        clientUploadId: 'client-1',
        buffer: pngHeader,
        mimeType: 'application/x-msdownload',
        fileName: 'bad.exe',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversize file', async () => {
    const pending = makeUpload();
    const { service } = buildService({
      prisma: {
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(pending),
          update: jest.fn().mockImplementation(async ({ data }) =>
            makeUpload({ status: data.status, retryable: false }),
          ),
        },
      },
    });
    const huge = Buffer.alloc(9 * 1024 * 1024);
    await expect(
      service.uploadBinary({
        organizationId: 'org-1',
        clientUploadId: 'client-1',
        buffer: huge,
        mimeType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks completion when required uploads incomplete', async () => {
    const { service, prisma } = buildService({
      prisma: {
        operatorUpload: {
          findFirst: jest.fn().mockResolvedValue(makeUpload({ requiredForComplete: true, status: 'PENDING' })),
        },
      },
    });
    await expect(service.assertRequiredUploadsComplete('org-1', 'session-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.operatorUpload.findFirst).toHaveBeenCalled();
  });

  it('cancels pending upload', async () => {
    const pending = makeUpload();
    const { service } = buildService({
      prisma: {
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(pending),
          update: jest.fn().mockImplementation(async ({ data }) =>
            makeUpload({ status: data.status, cancelledAt: data.cancelledAt }),
          ),
        },
      },
    });
    const result = await service.cancelUpload('org-1', 'client-1');
    expect(result.status).toBe('CANCELLED');
  });

  it('returns not found for unknown clientUploadId', async () => {
    const { service } = buildService({
      prisma: {
        operatorUpload: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    });
    await expect(service.getUpload('org-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
