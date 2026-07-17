import { BadRequestException } from '@nestjs/common';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentApplySafetyPolicy } from './document-apply-safety.policy';
import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { createApplyFailure, createApplySuccess } from './document-extraction-apply-result.util';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('DocumentExtractionService apply provenance gate', () => {
  function makeService(
    prismaOverrides: Record<string, unknown> = {},
    applyImpl?: DocumentExtractionApplyService['apply'],
  ) {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        ...prismaOverrides,
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ vin: null, licensePlate: null, mileageKm: null }),
        findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const applyService = {
      apply:
        applyImpl ??
        jest.fn().mockResolvedValue(
          createApplySuccess({
            downstreamEntityType: 'service_event',
            downstreamEntityId: 'evt-1',
            actionCount: 1,
            serviceEventId: 'evt-1',
          }),
        ),
    };
    const plausibility = {
      runChecks: jest.fn().mockReturnValue({
        overallStatus: 'OK',
        checks: [],
        recommendedHumanReviewNotes: [],
      }),
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
      { get: jest.fn() } as any,
      { queueEnabled: true, allowPendingWithoutQueue: false } as any,
      {} as any,
      { add: jest.fn() } as any,
      applyService as any,
      plausibility as any,
      observability as any,
      new DocumentApplySafetyPolicy(),
    );
    return { svc, prisma, applyService, observability };
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

  it('does not mark APPLIED when FINE apply is a no-op', async () => {
    const applyFineNoOp = jest.fn().mockResolvedValue(
      createApplyFailure(['VEHICLE_ORGANIZATION_REQUIRED']),
    );
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        ...reviewBase,
        documentType: 'FINE',
        effectiveDocumentType: 'FINE',
      })
      .mockResolvedValue({
        ...reviewBase,
        status: 'FAILED',
        documentType: 'FINE',
        effectiveDocumentType: 'FINE',
      });
    const update = jest.fn().mockResolvedValue({});
    const { svc } = makeService({ findFirst, update }, applyFineNoOp);

    await expect(
      svc.confirm('v1', 'e1', {
        eventDate: '2026-01-15',
        totalCents: 5000,
        offenseType: 'Parkverstoß',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(applyFineNoOp).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorPhase: 'APPLY',
          errorCode: 'APPLY_FAILED',
        }),
      }),
    );
  });

  it('marks APPLIED for ARCHIVE_ONLY without downstream entity', async () => {
    const apply = jest.fn();
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        ...reviewBase,
        documentType: 'OTHER',
        effectiveDocumentType: 'OTHER',
      })
      .mockResolvedValue({
        ...reviewBase,
        status: 'APPLIED',
        documentType: 'OTHER',
        effectiveDocumentType: 'OTHER',
      });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc } = makeService({ findFirst, updateMany }, apply);

    const result = await svc.confirm('v1', 'e1', {
      eventDate: '2026-01-15',
      description: 'Allgemeines Schreiben',
    });

    expect(apply).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPLIED' }),
      }),
    );
    expect(result.status).toBe('APPLIED');
  });

  it('marks APPLIED only when downstream success is proven', async () => {
    const apply = jest.fn().mockResolvedValue(
      createApplySuccess({
        downstreamEntityType: 'service_event',
        downstreamEntityId: 'evt-99',
        actionCount: 1,
        serviceEventId: 'evt-99',
      }),
    );
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
        serviceEventId: 'evt-99',
        documentType: 'SERVICE',
        effectiveDocumentType: 'SERVICE',
      });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc } = makeService({ findFirst, updateMany }, apply);

    const result = await svc.confirm('v1', 'e1', {
      eventDate: '2026-01-15',
      odometerKm: 50000,
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPLIED',
          serviceEventId: 'evt-99',
        }),
      }),
    );
    expect(result.status).toBe('APPLIED');
  });

  it('retry skips re-apply when audit already contains proven success', async () => {
    const apply = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({
      id: 'e1',
      vehicleId: 'v1',
      organizationId: 'org-1',
      status: 'CONFIRMED',
      appliedAt: null,
      serviceEventId: 'evt-1',
      documentType: 'SERVICE',
      effectiveDocumentType: 'SERVICE',
      confirmedData: { eventDate: '2026-01-15' },
      plausibility: {
        _pipeline: {
          actionAudit: [
            {
              action: 'apply',
              at: '2026-07-17T12:00:00.000Z',
              userId: null,
              details: {
                success: true,
                downstreamEntityType: 'service_event',
                downstreamEntityId: 'evt-1',
                actionCount: 1,
              },
            },
          ],
        },
      },
      objectKey: 'k1',
      sourceFileUrl: null,
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc } = makeService({ findUnique, updateMany }, apply);

    const ok = await svc.retryConfirmedApply('e1');

    expect(ok).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPLIED', serviceEventId: 'evt-1' }),
      }),
    );
  });
});
