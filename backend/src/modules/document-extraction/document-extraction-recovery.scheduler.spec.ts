import { DocumentExtractionRecoveryScheduler } from '@workers/schedulers/document-extraction-recovery.scheduler';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('DocumentExtractionRecoveryScheduler', () => {
  const docConfig = {
    queueEnabled: true,
    staleQueuedThresholdMs: 600_000,
    staleProcessingThresholdMs: 900_000,
    staleConfirmedApplyThresholdMs: 600_000,
    maxRecoveryAttempts: 5,
  };

  function makeScheduler(overrides: Record<string, unknown> = {}) {
    const prisma = {
      vehicleDocumentExtraction: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        ...(overrides.prisma as object),
      },
    };
    const extractionService = {
      hasActiveExtractionJob: jest.fn().mockResolvedValue(false),
      enqueueExtraction: jest.fn().mockResolvedValue({ ok: true }),
      markQueuedAfterEnqueue: jest.fn().mockResolvedValue({}),
      retryConfirmedApply: jest.fn().mockResolvedValue(false),
      ...(overrides.extractionService as object),
    };
    const scheduler = new DocumentExtractionRecoveryScheduler(
      { getJob: jest.fn() } as any,
      prisma as any,
      extractionService as any,
      docConfig as any,
    );
    return { scheduler, prisma, extractionService };
  }

  afterEach(() => {
    jest.clearAllMocks();
    (canEnqueueQueue as jest.Mock).mockReturnValue(true);
  });

  it('re-enqueues stale QUEUED rows without active jobs', async () => {
    const row = {
      id: 'e1',
      vehicleId: 'v1',
      organizationId: 'org-1',
      status: 'QUEUED',
      objectKey: 'k1',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      plausibility: null,
      queuedAt: new Date('2020-01-01'),
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValue([])
      .mockResolvedValue([]);
    const { scheduler, extractionService } = makeScheduler({
      prisma: { findMany },
    });

    await scheduler.recoverStaleExtractions();
    expect(extractionService.enqueueExtraction).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ extractionId: 'e1', objectKey: 'k1' }),
    );
  });

  it('recovers stale PROCESSING rows', async () => {
    const row = {
      id: 'e2',
      vehicleId: 'v1',
      organizationId: 'org-1',
      status: 'PROCESSING',
      objectKey: 'k2',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      plausibility: null,
      processingStartedAt: new Date('2020-01-01'),
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValue([]);
    const { scheduler, extractionService } = makeScheduler({
      prisma: { findMany },
    });

    await scheduler.recoverStaleExtractions();
    expect(extractionService.markQueuedAfterEnqueue).toHaveBeenCalledWith('e2');
  });

  it('respects recovery attempt limits', async () => {
    const row = {
      id: 'e3',
      vehicleId: 'v1',
      organizationId: 'org-1',
      status: 'QUEUED',
      objectKey: 'k3',
      effectiveDocumentType: 'SERVICE',
      documentType: 'SERVICE',
      plausibility: { _queueRecoveryCount: 5 },
      queuedAt: new Date('2020-01-01'),
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValue([])
      .mockResolvedValue([]);
    const { scheduler, extractionService } = makeScheduler({
      prisma: { findMany },
    });

    await scheduler.recoverStaleExtractions();
    expect(extractionService.enqueueExtraction).not.toHaveBeenCalled();
  });
});
