import { Prisma } from '@prisma/client';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentPhysicalDeletePendingError } from './document-physical-delete.error';

describe('DocumentLifecycleService physical delete reliability', () => {
  const retentionFixture = {
    enabled: false,
    dryRun: true,
    batchSize: 10,
    maxBatchesPerRun: 1,
    policyVersion: 'test',
    stripOcrCacheOnManualDelete: true,
    days: {
      ocrCacheAfterSoftDelete: 0,
      sensitiveExtractedDataAfterSoftDelete: 0,
      extractionRowAfterSoftDelete: 0,
      rejectedWithoutFile: 0,
    },
    encryptionAtRest: { declared: true, provider: 'local-disk' as const, kmsKeyId: null },
    backup: {
      strategy: 'none' as const,
      documentObjectsIncluded: false,
      lastVerifiedAt: null,
      note: null,
    },
  };

  const baseRecord = {
    id: 'ext-1',
    objectKey: 'organizations/org-1/doc.pdf',
    plausibility: {},
    fileDeletedAt: null,
  };

  it('keeps objectKey and throws when storage delete fails', async () => {
    const storage = {
      deleteObject: jest.fn().mockRejectedValue(new Error('storage_down')),
      getCapabilities: jest.fn(),
    };
    const prisma = {
      vehicleDocumentExtraction: {
        update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          ...baseRecord,
          ...data,
        })),
      },
    };
    const svc = new DocumentLifecycleService(prisma as any, storage as any, retentionFixture);

    await expect(svc.softDeleteFile({ record: baseRecord, userId: 'u1' })).rejects.toBeInstanceOf(
      DocumentPhysicalDeletePendingError,
    );
    const updateArg = prisma.vehicleDocumentExtraction.update.mock.calls[0][0];
    expect(updateArg.data.objectKey).toBeUndefined();
    expect(updateArg.data.fileDeletedAt).toBeInstanceOf(Date);
  });

  it('clears objectKey after successful delete', async () => {
    const storage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getCapabilities: jest.fn(),
    };
    const prisma = {
      vehicleDocumentExtraction: {
        update: jest.fn().mockResolvedValue({ ...baseRecord, objectKey: null }),
      },
    };
    const svc = new DocumentLifecycleService(prisma as any, storage as any, retentionFixture);

    await svc.softDeleteFile({ record: baseRecord, userId: 'u1' });
    expect(storage.deleteObject).toHaveBeenCalledWith(baseRecord.objectKey);
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ objectKey: null }),
      }),
    );
  });

  it('retries pending physical deletes idempotently', async () => {
    const storage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getCapabilities: jest.fn(),
    };
    const pending = {
      ...baseRecord,
      fileDeletedAt: new Date(),
    };
    const prisma = {
      vehicleDocumentExtraction: {
        findMany: jest.fn().mockResolvedValue([pending]),
        update: jest.fn().mockResolvedValue({ ...pending, objectKey: null }),
      },
    };
    const svc = new DocumentLifecycleService(prisma as any, storage as any, retentionFixture);
    const result = await svc.retryPendingPhysicalObjectDeletes({
      dryRun: false,
      batchSize: 10,
    });
    expect(result.affected).toBe(1);
    expect(storage.deleteObject).toHaveBeenCalled();
  });
});
