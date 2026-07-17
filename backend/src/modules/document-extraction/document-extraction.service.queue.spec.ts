import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentExtractionEnqueueFailedException } from './document-extraction-enqueue.exception';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

import { canEnqueueQueue } from '@shared/queue/queue-producer.util';

function mockFailedRecord(id = 'e1') {
  const now = new Date();
  return {
    id,
    vehicleId: 'v1',
    organizationId: 'org-1',
    status: 'FAILED',
    processingStage: 'QUEUE',
    classificationMode: 'MANUAL',
    processingAttempts: 0,
    errorPhase: 'QUEUE',
    errorCode: 'QUEUE_UNAVAILABLE',
    errorMessage: 'Queue derzeit nicht verfügbar — erneut versuchen',
    createdAt: now,
    updatedAt: now,
  };
}

function makeService(overrides: {
  prisma?: Record<string, unknown>;
  docConfig?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  queue?: Record<string, unknown>;
} = {}) {
  const prisma = {
    vehicleDocumentExtraction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      ...(overrides.prisma ?? {}),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const docConfig = {
    queueEnabled: true,
    allowPendingWithoutQueue: false,
    jobAttempts: 4,
    jobBackoffMs: 5000,
    jobTimeoutMs: 120000,
    ...(overrides.docConfig ?? {}),
  };
  const storage = {
    putObject: jest.fn().mockResolvedValue({
      objectKey: 'k1',
      storageProvider: 'local',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    }),
    getObject: jest.fn(),
    deleteObject: jest.fn(),
    ...(overrides.storage ?? {}),
  };
  const queue = {
    add: jest.fn().mockResolvedValue({}),
    getJob: jest.fn().mockResolvedValue(null),
    ...(overrides.queue ?? {}),
  };
  const applyService = { apply: jest.fn().mockResolvedValue({}) };
  const actionOrchestrator = {
    supportsExecutorPath: jest.fn().mockReturnValue(false),
    executeConfirmedPlan: jest.fn(),
  };
  const fileIdentification = {
    identify: jest.fn().mockResolvedValue({
      detectedKind: 'pdf',
      detectedMime: 'application/pdf',
      clientMime: 'application/pdf',
      displayFileName: 'invoice.pdf',
      sizeBytes: 100,
    }),
  };
  const plausibility = {
    runChecks: jest.fn().mockReturnValue({
      overallStatus: 'OK',
      checks: [],
      recommendedHumanReviewNotes: [],
    }),
  };
  const config = { get: jest.fn((_k: string, d?: unknown) => d) };
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
    applyService as any,
    actionOrchestrator as any,
    plausibility as any,
    fileIdentification as any,
    observability as any,
  );
  return { svc, prisma, storage, queue, applyService, docConfig };
}

describe('DocumentExtractionService queue lifecycle', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
    (canEnqueueQueue as jest.Mock).mockReturnValue(true);
  });

  it('creates PENDING/STORAGE first, then QUEUED after successful queue.add', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'e1', vehicleId: 'v1', organizationId: 'org-1' });
    const update = jest.fn().mockResolvedValue({
      id: 'e1',
      status: 'QUEUED',
      processingStage: 'QUEUE',
    });
    const { svc, prisma, queue } = makeService({
      prisma: { create, update },
    });

    const result = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('pdf'),
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          processingStage: 'STORAGE',
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'extract',
      expect.objectContaining({ extractionId: 'e1' }),
      expect.objectContaining({ jobId: 'extract-e1', attempts: 4 }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1' },
        data: expect.objectContaining({ status: 'QUEUED', processingStage: 'QUEUE' }),
      }),
    );
    expect(result.status).toBe('QUEUED');
  });

  it('throws DocumentExtractionEnqueueFailedException when queue.add fails', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'e1', vehicleId: 'v1', organizationId: 'org-1' });
    const update = jest.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockFailedRecord('e1'), ...data }),
    );
    const { svc } = makeService({
      prisma: { create, update },
      queue: { add: jest.fn().mockRejectedValue(new Error('redis down')) },
    });

    await expect(
      svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'a.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('pdf'),
      }),
    ).rejects.toBeInstanceOf(DocumentExtractionEnqueueFailedException);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorPhase: 'QUEUE',
          errorCode: 'QUEUE_UNAVAILABLE',
        }),
      }),
    );
  });

  it('marks FAILED when canEnqueueQueue=false', async () => {
    (canEnqueueQueue as jest.Mock).mockReturnValue(false);
    const create = jest.fn().mockResolvedValue({ id: 'e1', vehicleId: 'v1', organizationId: 'org-1' });
    const update = jest.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockFailedRecord('e1'), ...data }),
    );
    const { svc } = makeService({ prisma: { create, update } });

    await expect(
      svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'a.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('pdf'),
      }),
    ).rejects.toBeInstanceOf(DocumentExtractionEnqueueFailedException);
  });

  it('rejects upload in production when queueEnabled=false', async () => {
    process.env.NODE_ENV = 'production';
    const { svc } = makeService({ docConfig: { queueEnabled: false } });

    await expect(
      svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'a.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('pdf'),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('allows PENDING without enqueue in dev when explicitly configured', async () => {
    process.env.NODE_ENV = 'development';
    const create = jest.fn().mockResolvedValue({
      id: 'e1',
      status: 'PENDING',
      processingStage: 'STORAGE',
    });
    const { svc, queue } = makeService({
      docConfig: { queueEnabled: false, allowPendingWithoutQueue: true },
      prisma: { create },
    });

    const result = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('pdf'),
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
  });

  it('rejects retry for APPLIED extractions', async () => {
    const { svc } = makeService({
      prisma: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          vehicleId: 'v1',
          status: 'APPLIED',
          objectKey: 'k1',
          effectiveDocumentType: 'SERVICE',
          vehicle: { id: 'v1', organizationId: 'org-1' },
        }),
      },
    });
    await expect(svc.retry('v1', 'e1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects retry when an active job already exists', async () => {
    const { svc, queue } = makeService({
      prisma: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          vehicleId: 'v1',
          status: 'FAILED',
          objectKey: 'k1',
          effectiveDocumentType: 'SERVICE',
          organizationId: 'org-1',
          vehicle: { id: 'v1', organizationId: 'org-1' },
        }),
      },
      queue: {
        getJob: jest.fn().mockResolvedValue({
          getState: jest.fn().mockResolvedValue('active'),
        }),
      },
    });
    await expect(svc.retry('v1', 'e1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DocumentExtractionService confirm idempotency', () => {
  it('does not re-apply APPLIED records', async () => {
    const applied = {
      id: 'e1',
      vehicleId: 'v1',
      documentType: 'SERVICE',
      effectiveDocumentType: 'SERVICE',
      status: 'APPLIED',
      vehicle: { id: 'v1', organizationId: 'org-1' },
    };
    const apply = jest.fn();
    const { svc } = makeService({
      prisma: { findFirst: jest.fn().mockResolvedValue(applied) },
    });
    (svc as any).applyService = { apply };
    const result = await svc.confirm('v1', 'e1', { eventDate: '2026-01-10' });
    expect(result).toBe(applied);
  });
});
