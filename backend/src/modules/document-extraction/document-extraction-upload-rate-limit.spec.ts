import { DocumentUploadRateLimitedException } from './document-upload-rate-limit.errors';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentUploadDuplicateService } from './document-upload-duplicate.service';
import { DocumentUploadRateLimitService } from './document-upload-rate-limit.service';
import { FIXTURE_TXT } from './__fixtures__/document-fixtures';
import { makeLifecycleMock, makeMalwareScanMock, makeRetentionMock, makeUploadContextMock } from './document-extraction-test.helpers';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

function makeUploadService(rateLimit: DocumentUploadRateLimitService) {
  const fileIdentification = {
    identify: jest.fn(async (input: { buffer: Buffer; originalName?: string }) => ({
      detectedKind: 'plain-text',
      detectedMime: 'text/plain',
      clientMime: 'text/plain',
      displayFileName: input.originalName ?? 'document.txt',
      sizeBytes: input.buffer.byteLength,
    })),
  };
  const uploadDuplicate = {
    assess: jest.fn().mockResolvedValue({ status: 'UNIQUE', blocked: false }),
    claimContentAnchor: jest.fn().mockResolvedValue('claimed'),
    loadBlockedAssessmentFromAnchor: jest.fn(),
  };
  const prisma = {
    vehicleDocumentExtraction: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'ext-1', vehicleId: 'v1', organizationId: 'org-1', ...data }),
      ),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, vehicleId: 'v1', organizationId: 'org-1', ...data }),
      ),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    documentExtractionContentAnchor: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const storage = {
    putObject: jest.fn().mockResolvedValue({
      objectKey: 'organizations/org-1/vehicles/v1/documents/file.txt',
      storageProvider: 'local',
      mimeType: 'text/plain',
      sizeBytes: FIXTURE_TXT.length,
    }),
    getObject: jest.fn(),
    getObjectStream: jest.fn(),
    deleteObject: jest.fn(),
  };
  const queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn().mockResolvedValue(null) };

  const svc = new DocumentExtractionService(
    prisma as any,
    { get: jest.fn((_k: string, d?: unknown) => d) } as any,
    {
      queueEnabled: true,
      allowPendingWithoutQueue: false,
      jobAttempts: 4,
      jobBackoffMs: 5000,
      jobTimeoutMs: 120000,
    } as any,
    storage as any,
    queue as any,
    { apply: jest.fn() } as any,
    { supportsExecutorPath: jest.fn(), executeConfirmedPlan: jest.fn() } as any,
    { runChecks: jest.fn() } as any,
    fileIdentification as any,
    uploadDuplicate as any,
    rateLimit,
    makeMalwareScanMock(storage) as any,
    makeLifecycleMock() as any,
    makeRetentionMock() as any,
    makeUploadContextMock() as any,
    { logEvent: jest.fn(), recordApply: jest.fn(), observeStage: jest.fn((_a, _b, fn) => fn()) } as any,
  );

  return { svc, storage, queue, fileIdentification };
}

describe('Document extraction upload rate limit integration', () => {
  it('blocks upload before identification, storage, and queue when rate limited', async () => {
    const rateLimit = {
      assertAllowed: jest.fn().mockRejectedValue(
        new DocumentUploadRateLimitedException({
          allowed: false,
          scope: 'organization',
          reason: 'count',
          retryAfterSeconds: 30,
          windowMs: 60_000,
          limit: 3,
        }),
      ),
    } as unknown as DocumentUploadRateLimitService;
    const { svc, storage, queue, fileIdentification } = makeUploadService(rateLimit);

    await expect(
      svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'blocked.txt',
        mimeType: 'text/plain',
        buffer: FIXTURE_TXT,
        clientIp: '203.0.113.10',
      }),
    ).rejects.toBeInstanceOf(DocumentUploadRateLimitedException);

    expect(rateLimit.assertAllowed).toHaveBeenCalled();
    expect(fileIdentification.identify).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
