import { BadRequestException } from '@nestjs/common';
import { DocumentExtractionService } from './document-extraction.service';
import { computeDocumentContentSha256 } from './document-content-hash.util';
import { FIXTURE_SCANNED_PDF, FIXTURE_TXT } from './__fixtures__/document-fixtures';
import { DocumentFileIdentificationService } from './document-file-identification.service';
import { readDocumentExtractionFileFingerprint } from './document-extraction-fingerprint.types';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

function makeUploadRateLimitMock() {
  return { assertAllowed: jest.fn().mockResolvedValue(undefined) };
}

function makeUploadDuplicateMock() {
  return {
    assess: jest.fn().mockResolvedValue({ status: 'UNIQUE', blocked: false }),
    claimContentAnchor: jest.fn().mockResolvedValue('claimed'),
    loadBlockedAssessmentFromAnchor: jest.fn(),
  };
}

function makeUploadService(overrides: {
  identifyImpl?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
} = {}) {
  const fileIdentification = {
    identify:
      overrides.identifyImpl ??
      jest.fn(async (input: { buffer: Buffer; clientMimeType: string; originalName?: string }) => ({
        detectedKind: 'pdf' as const,
        detectedMime: 'application/pdf' as const,
        clientMime: input.clientMimeType,
        displayFileName: input.originalName ?? 'document.pdf',
        sizeBytes: input.buffer.byteLength,
      })),
  };
  const prisma = {
    vehicleDocumentExtraction: {
      create: overrides.create ?? jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'ext-1', vehicleId: 'v1', organizationId: 'org-1', ...data }),
      ),
      update:
        overrides.update ??
        jest.fn().mockImplementation(({ where, data }) =>
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
      objectKey: 'organizations/org-1/vehicles/v1/documents/2026/07/ext-1.pdf',
      storageProvider: 'local',
      mimeType: 'application/pdf',
      sizeBytes: FIXTURE_SCANNED_PDF.length,
    }),
    getObject: jest.fn(),
    getObjectStream: jest.fn(),
    deleteObject: jest.fn(),
  };
  const queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn().mockResolvedValue(null) };
  const uploadDuplicate = makeUploadDuplicateMock();
  const uploadRateLimit = makeUploadRateLimitMock();
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
    uploadRateLimit as any,
    { logEvent: jest.fn(), recordApply: jest.fn(), observeStage: jest.fn((_a, _b, fn) => fn()) } as any,
  );

  return { svc, prisma, storage, queue, fileIdentification, uploadDuplicate };
}

describe('Document extraction upload content hash', () => {
  it('identifies and hashes before storage and queue enqueue', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'ext-1', vehicleId: 'v1', organizationId: 'org-1' });
    const update = jest.fn().mockResolvedValue({ id: 'ext-1', status: 'QUEUED' });
    const { svc, storage, queue, fileIdentification } = makeUploadService({ create, update });
    const realIdentification = new DocumentFileIdentificationService({ maxUploadMb: 10 } as any);
    (fileIdentification.identify as jest.Mock).mockImplementation((input) =>
      realIdentification.identify(input),
    );

    await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'invoice-a.pdf',
      mimeType: 'application/pdf',
      buffer: FIXTURE_SCANNED_PDF,
    });

    expect(fileIdentification.identify).toHaveBeenCalled();
    expect(storage.putObject).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
    expect((fileIdentification.identify as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      storage.putObject.mock.invocationCallOrder[0],
    );
    expect(storage.putObject.mock.invocationCallOrder[0]).toBeLessThan(queue.add.mock.invocationCallOrder[0]);
  });

  it('stores the same contentSha256 for identical bytes with different filenames', async () => {
    const create = jest.fn()
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: 'ext-a', vehicleId: 'v1', organizationId: 'org-1', ...data }))
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: 'ext-b', vehicleId: 'v1', organizationId: 'org-1', ...data }));
    const { svc } = makeUploadService({ create });
    const expectedHash = await computeDocumentContentSha256(FIXTURE_TXT);

    await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'notes-a.txt',
      mimeType: 'text/plain',
      buffer: FIXTURE_TXT,
    });
    await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'notes-b.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(FIXTURE_TXT),
    });

    const firstCreate = create.mock.calls[0][0].data;
    const secondCreate = create.mock.calls[1][0].data;
    expect(firstCreate.contentSha256).toBe(expectedHash);
    expect(secondCreate.contentSha256).toBe(expectedHash);
    expect(readDocumentExtractionFileFingerprint(firstCreate.plausibility)?.contentSha256).toBe(
      expectedHash,
    );
  });

  it('stores different contentSha256 values for different content with the same filename', async () => {
    const create = jest.fn()
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: 'ext-a', vehicleId: 'v1', organizationId: 'org-1', ...data }))
      .mockImplementationOnce(({ data }) => Promise.resolve({ id: 'ext-b', vehicleId: 'v1', organizationId: 'org-1', ...data }));
    const { svc, fileIdentification } = makeUploadService({ create });

    const firstBuffer = FIXTURE_TXT;
    const secondBuffer = Buffer.from(`${FIXTURE_TXT.toString('utf8')}-changed`);
    (fileIdentification.identify as jest.Mock)
      .mockResolvedValueOnce({
        detectedKind: 'plain-text',
        detectedMime: 'text/plain',
        clientMime: 'text/plain',
        displayFileName: 'same-name.txt',
        sizeBytes: firstBuffer.length,
      })
      .mockResolvedValueOnce({
        detectedKind: 'plain-text',
        detectedMime: 'text/plain',
        clientMime: 'text/plain',
        displayFileName: 'same-name.txt',
        sizeBytes: secondBuffer.length,
      });

    await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'same-name.txt',
      mimeType: 'text/plain',
      buffer: firstBuffer,
    });
    await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'same-name.txt',
      mimeType: 'text/plain',
      buffer: secondBuffer,
    });

    const firstHash = create.mock.calls[0][0].data.contentSha256;
    const secondHash = create.mock.calls[1][0].data.contentSha256;
    expect(firstHash).not.toBe(secondHash);
  });

  it('does not store or enqueue when file identification fails', async () => {
    const { svc, storage, queue, fileIdentification } = makeUploadService();
    (fileIdentification.identify as jest.Mock).mockRejectedValue(
      new BadRequestException('File content does not match the declared file type'),
    );

    await expect(
      svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'bad.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('not-a-pdf'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('supports parallel uploads hashing identical bytes consistently', async () => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: `ext-${data.contentSha256.slice(0, 8)}`,
        vehicleId: 'v1',
        organizationId: 'org-1',
        ...data,
      }),
    );
    const { svc } = makeUploadService({ create });
    const buffer = Buffer.from(FIXTURE_TXT);
    const expectedHash = await computeDocumentContentSha256(buffer);

    await Promise.all(
      Array.from({ length: 4 }, (_row, index) =>
        svc.createFromUpload({
          vehicleId: 'v1',
          documentType: 'SERVICE',
          originalName: `parallel-${index}.txt`,
          mimeType: 'text/plain',
          buffer: Buffer.from(buffer),
        }),
      ),
    );

    const hashes = create.mock.calls.map((call) => call[0].data.contentSha256);
    expect(new Set(hashes)).toEqual(new Set([expectedHash]));
  });
});
