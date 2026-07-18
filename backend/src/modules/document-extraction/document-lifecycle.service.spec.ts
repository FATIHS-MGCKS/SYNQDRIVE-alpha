import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { PIPELINE_PLAUSIBILITY_KEY } from './document-content-cache.util';

describe('DocumentLifecycleService', () => {
  const retentionConfig = {
    policyVersion: '2026-07-17',
    stripOcrCacheOnManualDelete: true,
  };

  function makeService(overrides: {
    prisma?: Record<string, unknown>;
    storage?: Record<string, unknown>;
  } = {}) {
    const prisma = {
      vehicleDocumentExtraction: {
        update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'ext-1',
          ...data,
        })),
      },
      ...overrides.prisma,
    };
    const storage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getCapabilities: jest.fn().mockReturnValue({
        provider: 'local',
        zones: ['quarantine', 'clean'],
        transport: { apiTransport: 'https', providerTransport: 'local-filesystem' },
        encryptionAtRest: { declared: false, provider: 'none' },
        backup: { strategy: 'none', documentObjectsIncluded: false },
      }),
      ...overrides.storage,
    };
    const svc = new DocumentLifecycleService(
      prisma as any,
      storage as any,
      retentionConfig as any,
    );
    return { svc, prisma, storage };
  }

  const baseRecord = {
    id: 'ext-1',
    objectKey: 'organizations/org-1/vehicles/v1/documents/file.pdf',
    plausibility: {
      overallStatus: 'OK',
      [PIPELINE_PLAUSIBILITY_KEY]: {
        contentCache: { pages: [{ text: 'sensitive ocr' }] },
        lifecycle: { legalHold: { active: false } },
      },
    },
    fileDeletedAt: null,
  };

  it('soft-deletes file, strips OCR cache, and records retention timestamps', async () => {
    const { svc, prisma, storage } = makeService();

    await svc.softDeleteFile({ record: baseRecord, userId: 'user-1' });

    expect(storage.deleteObject).toHaveBeenCalledWith(baseRecord.objectKey);
    const updateArg = prisma.vehicleDocumentExtraction.update.mock.calls[0][0];
    expect(updateArg.data.objectKey).toBeNull();
    expect(updateArg.data.fileDeletedById).toBe('user-1');
    const pipeline = (updateArg.data.plausibility as Record<string, unknown>)[
      PIPELINE_PLAUSIBILITY_KEY
    ] as Record<string, unknown>;
    expect(pipeline.contentCache).toBeUndefined();
    expect(
      (pipeline.lifecycle as { retention?: { ocrCachePurgedAt?: string } }).retention
        ?.ocrCachePurgedAt,
    ).toBeTruthy();
  });

  it('rejects soft delete when legal hold is active', async () => {
    const { svc } = makeService();
    await expect(
      svc.softDeleteFile({
        record: {
          ...baseRecord,
          plausibility: {
            [PIPELINE_PLAUSIBILITY_KEY]: {
              lifecycle: { legalHold: { active: true, reason: 'litigation' } },
            },
          },
        },
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('is idempotent when file already soft-deleted', async () => {
    const { svc, storage } = makeService();
    const deleted = { ...baseRecord, objectKey: null, fileDeletedAt: new Date() };

    const result = await svc.softDeleteFile({ record: deleted, userId: 'user-1' });

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(result).toBe(deleted);
  });

  it('sets and clears legal hold with audit trail', async () => {
    const { svc, prisma } = makeService();

    await svc.setLegalHold({
      record: { id: 'ext-1', plausibility: baseRecord.plausibility },
      userId: 'admin-1',
      reason: 'audit',
    });

    let plausibility = prisma.vehicleDocumentExtraction.update.mock.calls[0][0].data.plausibility;
    expect(
      (plausibility as Record<string, unknown>)[PIPELINE_PLAUSIBILITY_KEY],
    ).toMatchObject({
      lifecycle: {
        legalHold: expect.objectContaining({ active: true, reason: 'audit' }),
      },
    });

    await svc.clearLegalHold({
      record: { id: 'ext-1', plausibility },
      userId: 'admin-1',
    });

    plausibility = prisma.vehicleDocumentExtraction.update.mock.calls[1][0].data.plausibility;
    expect(
      (plausibility as Record<string, unknown>)[PIPELINE_PLAUSIBILITY_KEY],
    ).toMatchObject({
      lifecycle: {
        legalHold: expect.objectContaining({ active: false }),
      },
    });
  });

  it('redacts string fields in extractedData', () => {
    const { svc } = makeService();
    const redacted = svc.redactSensitiveExtractedData({
      invoiceNumber: 'INV-1',
      eventDate: '2026-01-01',
      amountCents: 100,
    });
    expect(redacted).toEqual({
      invoiceNumber: '[redacted]',
      eventDate: '[redacted]',
      amountCents: 100,
    });
  });

  it('returns DbNull for empty extractedData', () => {
    const { svc } = makeService();
    expect(svc.redactSensitiveExtractedData(null)).toBe(Prisma.DbNull);
  });

  it('detects downstream links', () => {
    const { svc } = makeService();
    expect(svc.hasDownstreamLinks({ _count: { fines: 1 } })).toBe(true);
    expect(svc.hasDownstreamLinks({ _count: { fines: 0, damages: 0 } })).toBe(false);
  });
});
