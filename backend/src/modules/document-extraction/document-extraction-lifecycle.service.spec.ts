import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { DocumentExtractionService } from './document-extraction.service';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('DocumentExtractionService lifecycle reads', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        ...prismaOverrides,
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
        findUnique: jest.fn(),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const config = { get: jest.fn((_k: string, d?: unknown) => d) };
    const docConfig = {
      queueEnabled: true,
      allowPendingWithoutQueue: false,
      jobAttempts: 4,
      jobBackoffMs: 5000,
      jobTimeoutMs: 120000,
    };
    const storage = {
      putObject: jest.fn(),
      getObject: jest.fn(),
      getObjectStream: jest.fn(),
      deleteObject: jest.fn(),
    };
    const queue = { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) };
    const plausibility = {
      runChecks: jest.fn().mockReturnValue({ overallStatus: 'OK', checks: [], recommendedHumanReviewNotes: [] }),
    };
    const observability = {
      logEvent: jest.fn(),
      recordApply: jest.fn(),
      recordJobOutcome: jest.fn(),
      recordFailure: jest.fn(),
      recordStageDuration: jest.fn(),
      recordPages: jest.fn(),
      recordRetry: jest.fn(),
      recordClassification: jest.fn(),
      setQueueAgeSeconds: jest.fn(),
      setActiveJobs: jest.fn(),
      observeStage: jest.fn((_id: string, _stage: string, fn: () => unknown) => fn()),
    };
    const svc = new DocumentExtractionService(
      prisma as any,
      config as any,
      docConfig as any,
      storage as any,
      queue as any,
      { apply: jest.fn() } as any,
      { supportsExecutorPath: jest.fn(), executeConfirmedPlan: jest.fn() } as any,
      plausibility as any,
      {
        identify: jest.fn().mockResolvedValue({
          detectedKind: 'pdf',
          detectedMime: 'application/pdf',
          clientMime: 'application/pdf',
          displayFileName: 'invoice.pdf',
          sizeBytes: 100,
        }),
      } as any,
      {
        assess: jest.fn().mockResolvedValue({ status: 'UNIQUE', blocked: false }),
        claimContentAnchor: jest.fn().mockResolvedValue('claimed'),
        loadBlockedAssessmentFromAnchor: jest.fn(),
      } as any,
      observability as any,
    );
    return { svc, prisma, storage };
  }

  const baseRecord = {
    id: 'e1',
    vehicleId: 'v1',
    organizationId: 'org-1',
    status: 'READY_FOR_REVIEW',
    processingStage: 'REVIEW',
    classificationMode: 'MANUAL',
    processingAttempts: 1,
    requestedDocumentType: 'SERVICE',
    effectiveDocumentType: 'SERVICE',
    documentType: 'SERVICE',
    objectKey: 'k1',
    sourceFileName: 'service.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    createdAt: new Date('2026-07-10T12:00:00.000Z'),
    updatedAt: new Date('2026-07-10T12:05:00.000Z'),
    vehicle: {
      id: 'v1',
      organizationId: 'org-1',
      licensePlate: 'B-AB 123',
      vin: 'VIN123',
      make: 'VW',
      model: 'Golf',
    },
  };

  it('lists org uploads with pagination metadata', async () => {
    const { svc, prisma } = makeService({
      findMany: jest.fn().mockResolvedValue([baseRecord]),
      count: jest.fn().mockResolvedValue(1),
    });

    const result = await svc.listForOrg('org-1', { page: 1, limit: 20 });
    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('objectKey');
    expect(result.data[0].vehicle?.licensePlate).toBe('B-AB 123');
    expect(prisma.vehicleDocumentExtraction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('rejects cross-org detail lookup', async () => {
    const { svc } = makeService({
      findFirst: jest.fn().mockResolvedValue(null),
    });
    await expect(svc.getForOrg('other-org', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns reloadable detail with allowed actions and audit shell', async () => {
    const { svc, prisma } = makeService({
      findFirst: jest.fn().mockResolvedValue({
        ...baseRecord,
        createdById: 'u1',
        plausibility: { overallStatus: 'OK' },
        extractedData: { eventDate: '2026-01-01' },
      }),
    });
    prisma.user.findMany = jest.fn().mockResolvedValue([
      { id: 'u1', name: 'Tester', firstName: null, lastName: null },
    ]);

    const detail = await svc.getPublicForVehicle('v1', 'e1');
    expect(detail.extractedData).toEqual({ eventDate: '2026-01-01' });
    expect(detail.allowedActions).toContain('confirm');
    expect(detail.audit.createdBy?.id).toBe('u1');
    expect(detail).not.toHaveProperty('objectKey');
  });

  it('streams private download and hides storage key', async () => {
    const stream = Readable.from(['pdf-bytes']);
    const { svc, storage } = makeService({
      findFirst: jest.fn().mockResolvedValue(baseRecord),
    });
    storage.getObjectStream.mockResolvedValue(stream);

    const dl = await svc.getDownloadForVehicle('v1', 'e1');
    expect(dl.fileName).toBe('service.pdf');
    expect(dl.mimeType).toBe('application/pdf');
    expect(storage.getObjectStream).toHaveBeenCalledWith('k1');
  });

  it('treats deleted binary as unavailable', async () => {
    const { svc } = makeService({
      findFirst: jest.fn().mockResolvedValue({ ...baseRecord, objectKey: null }),
    });
    await expect(svc.getDownloadForVehicle('v1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
