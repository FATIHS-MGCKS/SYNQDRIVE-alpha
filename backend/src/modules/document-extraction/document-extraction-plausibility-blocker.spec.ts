import { BadRequestException } from '@nestjs/common';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentApplySafetyPolicy } from './document-apply-safety.policy';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import { createApplySuccess } from './document-extraction-apply-result.util';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('DocumentExtractionService plausibility BLOCKER apply gate', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        ...prismaOverrides,
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          vin: 'WVWZZZ1KZAW000001',
          licensePlate: 'B-AB-1234',
          mileageKm: 50_000,
        }),
        findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({ odometerKm: 50_000 }),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const applyService = {
      apply: jest.fn().mockResolvedValue(
        createApplySuccess({
          downstreamEntityType: 'fine',
          downstreamEntityId: 'fine-1',
          actionCount: 1,
        }),
      ),
    };
    const plausibilityService = new DocumentExtractionPlausibilityService();
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
      { get: jest.fn() } as any,
      { queueEnabled: true, allowPendingWithoutQueue: false } as any,
      {} as any,
      { add: jest.fn() } as any,
      applyService as any,
      plausibilityService as any,
      observability as any,
      new DocumentApplySafetyPolicy(),
    );
    return { svc, prisma, applyService };
  }

  const reviewBase = {
    id: 'e1',
    vehicleId: 'v1',
    organizationId: 'org-1',
    status: 'READY_FOR_REVIEW',
    processingStage: 'REVIEW',
    processingAttempts: 1,
    classificationMode: 'MANUAL',
    sourceFileUrl: null,
    objectKey: 'k1',
    plausibility: { overallStatus: 'OK', checks: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('saves corrections on confirm but skips apply when BLOCKER is unresolved', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        ...reviewBase,
        documentType: 'FINE',
        effectiveDocumentType: 'FINE',
      })
      .mockResolvedValue({
        ...reviewBase,
        status: 'READY_FOR_REVIEW',
        documentType: 'FINE',
        effectiveDocumentType: 'FINE',
        plausibility: { overallStatus: 'BLOCKER', checks: [{ code: 'FINE_OFFENSE_DATE_REQUIRED', status: 'BLOCKER' }] },
      });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc, applyService } = makeService({ findFirst, updateMany });

    const result = await svc.confirm('v1', 'e1', {
      totalCents: 1750,
      licensePlate: 'B-AB-1234',
    });

    expect(applyService.apply).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1', status: 'READY_FOR_REVIEW' },
        data: expect.objectContaining({
          processingStage: 'REVIEW',
          confirmedData: expect.objectContaining({ totalCents: 1750 }),
        }),
      }),
    );
    expect(result.status).toBe('READY_FOR_REVIEW');
  });

  it('re-runs plausibility on re-confirm and applies after blocker is resolved', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        ...reviewBase,
        documentType: 'FINE',
        effectiveDocumentType: 'FINE',
      })
      .mockResolvedValue({
        ...reviewBase,
        status: 'APPLIED',
        documentType: 'FINE',
        effectiveDocumentType: 'FINE',
      });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc, applyService } = makeService({ findFirst, updateMany });

    await svc.confirm('v1', 'e1', {
      eventDate: '2026-01-15',
      totalCents: 1750,
      offenseType: 'Parkverstoß',
      licensePlate: 'B-AB-1234',
    });

    expect(applyService.apply).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED' }),
      }),
    );
  });

  it('allows apply when only WARNING is present', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        ...reviewBase,
        documentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
      })
      .mockResolvedValue({
        ...reviewBase,
        status: 'APPLIED',
        documentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
      });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const applyService = {
      apply: jest.fn().mockResolvedValue(
        createApplySuccess({
          downstreamEntityType: 'service_event',
          downstreamEntityId: 'evt-1',
          actionCount: 1,
          serviceEventId: 'evt-1',
        }),
      ),
    };
    const { svc } = makeService({ findFirst, updateMany });
    (svc as any).applyService = applyService;

    await svc.confirm('v1', 'e1', {
      eventDate: '2026-01-10',
      odometerKm: 1_000,
    });

    expect(applyService.apply).toHaveBeenCalledTimes(1);
  });

  it('blocks retryConfirmedApply when fresh plausibility is BLOCKER', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'e1',
      vehicleId: 'v1',
      organizationId: 'org-1',
      status: 'CONFIRMED',
      appliedAt: null,
      documentType: 'TUV_REPORT',
      effectiveDocumentType: 'TUV_REPORT',
      confirmedData: { validUntil: '2028-01-01' },
      plausibility: { overallStatus: 'OK', checks: [] },
      objectKey: 'k1',
      sourceFileUrl: null,
    });
    const applyService = { apply: jest.fn() };
    const { svc } = makeService({ findUnique });
    (svc as any).applyService = applyService;

    const ok = await svc.retryConfirmedApply('e1');

    expect(ok).toBe(false);
    expect(applyService.apply).not.toHaveBeenCalled();
  });
});
