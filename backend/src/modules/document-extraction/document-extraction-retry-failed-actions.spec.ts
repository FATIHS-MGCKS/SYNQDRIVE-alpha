import { BadRequestException } from '@nestjs/common';
import { FINE_COMPLETE } from './__fixtures__/document-fine-fixtures';
import { DocumentExtractionService } from './document-extraction.service';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_PLAN_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from './document-action.types';
import { DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES } from './document-action-plan.state-machine';
import { makeLifecycleMock, makeMalwareScanMock, makeRetentionMock, makeUploadContextMock } from './document-extraction-test.helpers';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

describe('DocumentExtractionService retryFailedActions', () => {
  function makeService(overrides: {
    prisma?: Record<string, unknown>;
    actionOrchestrator?: Record<string, jest.Mock>;
    applyResultService?: Record<string, jest.Mock>;
  } = {}) {
    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        ...overrides.prisma,
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
        findUnique: jest.fn(),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const actionOrchestrator = {
      supportsExecutorPath: jest.fn().mockReturnValue(true),
      retryFailedApplyActions: jest.fn(),
      executeConfirmedPlan: jest.fn(),
      buildPreviewPlan: jest.fn(),
      ...overrides.actionOrchestrator,
    };

    const applyResultService = {
      buildForRecord: jest.fn().mockReturnValue({
        requiredActionsComplete: true,
        isTerminal: true,
        actions: [{ entityLink: { entityId: 'fine-1', entityType: 'fine' } }],
      }),
      ...overrides.applyResultService,
    };

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
      { putObject: jest.fn(), getObject: jest.fn(), getObjectStream: jest.fn(), deleteObject: jest.fn() } as any,
      { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) } as any,
      { apply: jest.fn() } as any,
      actionOrchestrator as any,
      { runChecks: jest.fn().mockReturnValue({ overallStatus: 'OK', checks: [] }) } as any,
      { identify: jest.fn() } as any,
      { assess: jest.fn(), claimContentAnchor: jest.fn(), loadBlockedAssessmentFromAnchor: jest.fn() } as any,
      { assertAllowed: jest.fn() } as any,
      makeMalwareScanMock() as any,
      makeLifecycleMock() as any,
      makeRetentionMock() as any,
      makeUploadContextMock() as any,
      {
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
      } as any,
      { buildForRecord: jest.fn() } as any,
      applyResultService as any,
      { listForRecord: jest.fn(), acceptSuggestion: jest.fn(), dismissSuggestion: jest.fn() } as any,
      { prepareContactDraft: jest.fn() } as any,
      { resyncAfterPlanChange: jest.fn() } as any,
      { upsertForRecord: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return { svc, prisma, actionOrchestrator, applyResultService };
  }

  const partiallyAppliedRecord = {
    id: 'ext-retry-1',
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    status: 'PARTIALLY_APPLIED',
    documentType: 'FINE' as const,
    effectiveDocumentType: 'FINE' as const,
    confirmedData: { values: FINE_COMPLETE, _fieldReview: { savedAt: '2026-07-17T00:00:00.000Z' } },
    plausibility: {
      _pipeline: {
        actionPlan: {
          planId: 'plan-retry-1',
          fingerprint: 'fp-retry',
          status: DOCUMENT_ACTION_PLAN_STATUSES.FAILED,
          actions: [{ semanticAction: 'CREATE_FINE_DRAFT', requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED, sequence: 1 }],
        },
        actionPlanApplyLifecycle: {
          status: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED,
          updatedAt: '2026-07-17T00:00:00.000Z',
        },
        actionPlanExecution: {
          planId: 'plan-retry-1',
          fingerprint: 'fp-retry',
          status: 'PARTIALLY_COMPLETED',
          actions: [
            {
              actionIndex: 0,
              semanticAction: 'CREATE_FINE_DRAFT',
              requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
              idempotencyKey: 'key-1',
              status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
              errorCode: 'TECHNICAL_FAILURE',
            },
          ],
        },
      },
    },
    sourceFileUrl: 'storage://fine.pdf',
    objectKey: null,
    appliedAt: null,
    vehicle: {
      id: 'veh-1',
      organizationId: 'org-1',
      licensePlate: null,
      vin: null,
      make: null,
      model: null,
    },
    createdById: null,
    confirmedById: null,
    appliedById: null,
    cancelledById: null,
    fileDeletedById: null,
  };

  it('retries failed actions for PARTIALLY_APPLIED extraction', async () => {
    const { svc, prisma, actionOrchestrator, applyResultService } = makeService();
    prisma.vehicleDocumentExtraction.findFirst
      .mockResolvedValueOnce(partiallyAppliedRecord)
      .mockResolvedValueOnce({
        ...partiallyAppliedRecord,
        status: 'APPLIED',
      });
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
      plausibility: partiallyAppliedRecord.plausibility,
    });
    actionOrchestrator.retryFailedApplyActions.mockResolvedValue({
      detail: { fineId: 'fine-1' },
      applyLifecycle: {
        status: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED,
        applyOutcome: 'FULL_SUCCESS',
      },
    });

    const result = await svc.retryFailedActionsForVehicle('veh-1', 'ext-retry-1', 'user-1');

    expect(actionOrchestrator.retryFailedApplyActions).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'ext-retry-1',
        vehicleId: 'veh-1',
        documentType: 'FINE',
      }),
    );
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ext-retry-1' },
        data: expect.objectContaining({ status: 'APPLIED' }),
      }),
    );
    expect(applyResultService.buildForRecord).toHaveBeenCalled();
    expect(result?.requiredActionsComplete).toBe(true);
  });

  it('rejects retry when status is not PARTIALLY_APPLIED or CONFIRMED', async () => {
    const { svc, prisma } = makeService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue({
      ...partiallyAppliedRecord,
      status: 'READY_FOR_REVIEW',
    });

    await expect(svc.retryFailedActionsForVehicle('veh-1', 'ext-retry-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects org retry without vehicle assignment', async () => {
    const { svc, prisma } = makeService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue({
      ...partiallyAppliedRecord,
      vehicleId: null,
    });

    await expect(svc.retryFailedActionsForOrg('org-1', 'ext-retry-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
