import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DataAuthorizationRevocationWorkflowStatus,
} from '@prisma/client';
import { RevocationOrchestratorService } from './revocation-orchestrator.service';
import {
  REVOCATION_RETENTION_DECISION,
  REVOCATION_STEP_KEY,
  buildRevocationIdempotencyKey,
} from './revocation-orchestrator.constants';

function buildWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-1',
    organizationId: 'org-1',
    idempotencyKey: 'key-1',
    triggerType: 'PROCESSING_ACTIVITY_REVOKED' as const,
    status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_REQUESTED,
    correlationId: 'corr-1',
    actorUserId: 'user-1',
    reason: 'test',
    processingActivityId: 'pa-1',
    enforcementPolicyId: null,
    consentId: null,
    providerGrantId: null,
    dataSharingAuthId: null,
    legacyOrgAuthId: null,
    dataCategories: ['GPS_LOCATION'],
    purposes: ['LIVE_MAP'],
    vehicleIds: null,
    completedSteps: [],
    stepErrors: null,
    attempts: 0,
    maxAttempts: 8,
    nextRetryAt: new Date(),
    denySwitchActivatedAt: null,
    processedAt: null,
    completedAt: null,
    failedAt: null,
    failureReason: null,
    deadLetteredAt: null,
    retentionDecision: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RevocationOrchestratorService', () => {
  let service: RevocationOrchestratorService;
  let prisma: {
    $transaction: jest.Mock;
    dataAuthorizationRevocationWorkflow: {
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    processingActivity: { findFirst: jest.Mock };
    enforcementPolicy: { findFirst: jest.Mock };
  };
  let repo: {
    findByIdempotencyKey: jest.Mock;
    createInTransaction: jest.Mock;
    findById: jest.Mock;
    claimForProcessing: jest.Mock;
    advanceWorkflow: jest.Mock;
    appendStepEvent: jest.Mock;
    markRetry: jest.Mock;
    markFailed: jest.Mock;
    recoverStaleProcessing: jest.Mock;
    findDueBatch: jest.Mock;
    listStepEvents: jest.Mock;
  };
  let steps: {
    executeDenySwitch: jest.Mock;
    executeStopIngestion: jest.Mock;
    executeRevokeProvider: jest.Mock;
    executeCancelQueues: jest.Mock;
    executeNotifyPartner: jest.Mock;
    executeRetentionDecision: jest.Mock;
    executeScheduleDeletion: jest.Mock;
    executeVerify: jest.Mock;
  };
  let auditOutbox: { enqueueInTransaction: jest.Mock; enqueue: jest.Mock };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn) => fn(prisma)),
      dataAuthorizationRevocationWorkflow: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      processingActivity: {
        findFirst: jest.fn().mockResolvedValue({ status: 'REVOKED' }),
      },
      enforcementPolicy: {
        findFirst: jest.fn().mockResolvedValue({ status: 'REVOKED', validUntil: null }),
      },
    };

    repo = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createInTransaction: jest.fn().mockResolvedValue(buildWorkflow()),
      findById: jest.fn(),
      claimForProcessing: jest.fn(),
      advanceWorkflow: jest.fn().mockResolvedValue(buildWorkflow()),
      appendStepEvent: jest.fn().mockResolvedValue({}),
      markRetry: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
      recoverStaleProcessing: jest.fn().mockResolvedValue([]),
      findDueBatch: jest.fn().mockResolvedValue([]),
      listStepEvents: jest.fn().mockResolvedValue([]),
    };

    steps = {
      executeDenySwitch: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.DENY_SWITCH, outcome: 'success' }),
      executeStopIngestion: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.STOP_INGESTION, outcome: 'success' }),
      executeRevokeProvider: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.REVOKE_PROVIDER, outcome: 'success' }),
      executeCancelQueues: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.CANCEL_QUEUES, outcome: 'success' }),
      executeNotifyPartner: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.NOTIFY_PARTNER, outcome: 'skipped' }),
      executeRetentionDecision: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.RETENTION_DECISION, outcome: 'success' }),
      executeScheduleDeletion: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.SCHEDULE_DELETION, outcome: 'skipped' }),
      executeVerify: jest.fn().mockResolvedValue({ stepKey: REVOCATION_STEP_KEY.VERIFY, outcome: 'success' }),
    };

    auditOutbox = {
      enqueueInTransaction: jest.fn().mockResolvedValue({}),
      enqueue: jest.fn().mockResolvedValue({}),
    };

    service = new RevocationOrchestratorService(
      prisma as never,
      repo as never,
      steps as never,
      auditOutbox as never,
    );
  });

  it('completes full successful revocation workflow step-by-step', async () => {
    let completedSteps: string[] = [REVOCATION_STEP_KEY.DENY_SWITCH];
    const statuses = [
      DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE,
      DataAuthorizationRevocationWorkflowStatus.INGESTION_STOPPED,
      DataAuthorizationRevocationWorkflowStatus.PROVIDER_ACCESS_REVOKED,
      DataAuthorizationRevocationWorkflowStatus.QUEUES_CANCELLED,
      DataAuthorizationRevocationWorkflowStatus.DOWNSTREAM_NOTIFIED,
      DataAuthorizationRevocationWorkflowStatus.RETENTION_DECIDED,
      DataAuthorizationRevocationWorkflowStatus.REVOCATION_COMPLETE,
    ];

    for (let i = 0; i < 6; i++) {
      const workflow = buildWorkflow({
        status: statuses[i],
        completedSteps: [...completedSteps],
        retentionDecision: i >= 4 ? REVOCATION_RETENTION_DECISION.RETAIN : null,
      });
      repo.findById.mockResolvedValue(workflow);
      repo.claimForProcessing.mockResolvedValue(workflow);

      const result = await service.processWorkflow('wf-1');
      expect(result.outcome).toBe(i === 5 ? 'completed' : 'advanced');
      completedSteps = [...completedSteps, Object.values(REVOCATION_STEP_KEY)[i + 1] as string];
    }
  });

  it('handles provider error with retry then dead-letter', async () => {
    const workflow = buildWorkflow({
      status: DataAuthorizationRevocationWorkflowStatus.INGESTION_STOPPED,
      completedSteps: [REVOCATION_STEP_KEY.DENY_SWITCH, REVOCATION_STEP_KEY.STOP_INGESTION],
      attempts: 6,
      maxAttempts: 8,
    });
    repo.findById.mockResolvedValue(workflow);
    repo.claimForProcessing.mockResolvedValue({ ...workflow, attempts: 7 });
    steps.executeRevokeProvider.mockRejectedValue(new Error('provider_api_down'));

    const retryResult = await service.processWorkflow('wf-1');
    expect(retryResult.outcome).toBe('retry');
    expect(repo.markRetry).toHaveBeenCalled();

    repo.findById.mockResolvedValue({ ...workflow, attempts: 8 });
    repo.claimForProcessing.mockResolvedValue({ ...workflow, attempts: 8 });
    const failResult = await service.processWorkflow('wf-1');
    expect(failResult.outcome).toBe('failed');
    expect(failResult.status).toBe(DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED);
    expect(repo.markFailed).toHaveBeenCalled();
  });

  it('handles queue cancellation error with retry', async () => {
    const workflow = buildWorkflow({
      status: DataAuthorizationRevocationWorkflowStatus.PROVIDER_ACCESS_REVOKED,
      completedSteps: [
        REVOCATION_STEP_KEY.DENY_SWITCH,
        REVOCATION_STEP_KEY.STOP_INGESTION,
        REVOCATION_STEP_KEY.REVOKE_PROVIDER,
      ],
      attempts: 1,
    });
    repo.findById.mockResolvedValue(workflow);
    repo.claimForProcessing.mockResolvedValue(workflow);
    steps.executeCancelQueues.mockRejectedValue(new Error('bullmq_unavailable'));

    const result = await service.processWorkflow('wf-1');
    expect(result.outcome).toBe('retry');
    expect(repo.markRetry).toHaveBeenCalledWith(
      'wf-1',
      'bullmq_unavailable',
      expect.any(Date),
      expect.objectContaining({ [REVOCATION_STEP_KEY.CANCEL_QUEUES]: 'bullmq_unavailable' }),
    );
  });

  it('retries with exponential backoff', async () => {
    const workflow = buildWorkflow({
      status: DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE,
      completedSteps: [REVOCATION_STEP_KEY.DENY_SWITCH],
      attempts: 2,
    });
    repo.findById.mockResolvedValue(workflow);
    repo.claimForProcessing.mockResolvedValue(workflow);
    steps.executeStopIngestion.mockRejectedValue(new Error('transient'));

    await service.processWorkflow('wf-1');
    const retryCall = repo.markRetry.mock.calls[0];
    expect(retryCall[2].getTime()).toBeGreaterThan(Date.now());
  });

  it('returns idempotent replay for duplicate revocation', async () => {
    const existing = buildWorkflow({
      status: DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE,
      denySwitchActivatedAt: new Date(),
    });
    repo.findByIdempotencyKey.mockResolvedValue(existing);

    const result = await service.requestRevocation({
      organizationId: 'org-1',
      triggerType: 'PROCESSING_ACTIVITY_REVOKED',
      correlationId: 'corr-1',
      entityId: 'pa-1',
      dataCategories: ['GPS_LOCATION'],
      purposes: ['LIVE_MAP'],
      processingActivityId: 'pa-1',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.denySwitchActivated).toBe(true);
    expect(repo.createInTransaction).not.toHaveBeenCalled();
  });

  it('resumes workflow after restart from partial completion', async () => {
    const workflow = buildWorkflow({
      status: DataAuthorizationRevocationWorkflowStatus.QUEUES_CANCELLED,
      completedSteps: [
        REVOCATION_STEP_KEY.DENY_SWITCH,
        REVOCATION_STEP_KEY.STOP_INGESTION,
        REVOCATION_STEP_KEY.REVOKE_PROVIDER,
        REVOCATION_STEP_KEY.CANCEL_QUEUES,
      ],
      retentionDecision: REVOCATION_RETENTION_DECISION.RETAIN,
    });
    repo.findById.mockResolvedValue(workflow);
    repo.claimForProcessing.mockResolvedValue(workflow);

    const result = await service.processWorkflow('wf-1');
    expect(['advanced', 'completed', 'skipped']).toContain(result.outcome);
    expect(steps.executeNotifyPartner).toHaveBeenCalled();
  });

  it('supports manual resume with reset attempts', async () => {
    const workflow = buildWorkflow({
      status: DataAuthorizationRevocationWorkflowStatus.REVOCATION_FAILED,
      attempts: 8,
    });
    repo.findById.mockResolvedValue(workflow);

    repo.findById.mockResolvedValueOnce(workflow).mockResolvedValue({
      ...workflow,
      status: DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE,
      attempts: 0,
      completedSteps: [REVOCATION_STEP_KEY.DENY_SWITCH],
    });
    repo.claimForProcessing.mockResolvedValue({
      ...workflow,
      status: DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE,
      attempts: 0,
      completedSteps: [REVOCATION_STEP_KEY.DENY_SWITCH],
    });

    const result = await service.resumeWorkflow({
      organizationId: 'org-1',
      workflowId: 'wf-1',
      actorUserId: 'admin-1',
      resetAttempts: true,
    });

    expect(prisma.dataAuthorizationRevocationWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wf-1' },
        data: expect.objectContaining({ attempts: 0 }),
      }),
    );
    expect(auditOutbox.enqueue).toHaveBeenCalled();
    expect(result.workflowId).toBe('wf-1');
  });

  it('rejects wrong tenant on getWorkflow', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getWorkflow('org-wrong', 'wf-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertTenant throws for mismatched organization', () => {
    expect(() => service.assertTenant('org-a', 'org-b')).toThrow(ForbiddenException);
  });

  it('verifies expired policy as valid revocation state', async () => {
    const workflow = buildWorkflow({
      status: DataAuthorizationRevocationWorkflowStatus.RETENTION_DECIDED,
      completedSteps: [
        REVOCATION_STEP_KEY.DENY_SWITCH,
        REVOCATION_STEP_KEY.STOP_INGESTION,
        REVOCATION_STEP_KEY.REVOKE_PROVIDER,
        REVOCATION_STEP_KEY.CANCEL_QUEUES,
        REVOCATION_STEP_KEY.NOTIFY_PARTNER,
        REVOCATION_STEP_KEY.RETENTION_DECISION,
      ],
      enforcementPolicyId: 'ep-expired',
      retentionDecision: REVOCATION_RETENTION_DECISION.RETAIN,
    });
    repo.findById.mockResolvedValue(workflow);
    repo.claimForProcessing.mockResolvedValue(workflow);
    prisma.enforcementPolicy.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      validUntil: new Date('2020-01-01'),
    });

    const result = await service.processWorkflow('wf-1');
    expect(steps.executeVerify).toHaveBeenCalled();
    expect(['advanced', 'completed']).toContain(result.outcome);
  });

  it('runs synchronous deny switch on requestRevocation', async () => {
    repo.findById.mockResolvedValue(
      buildWorkflow({ status: DataAuthorizationRevocationWorkflowStatus.DENY_SWITCH_ACTIVE }),
    );

    const result = await service.requestRevocation({
      organizationId: 'org-1',
      triggerType: 'PROVIDER_GRANT_REVOKED',
      correlationId: 'corr-new',
      entityId: 'grant-1',
      providerGrantId: 'grant-1',
      dataCategories: ['TELEMETRY_RAW'],
      purposes: ['TELEMETRY_INGEST'],
      idempotencyKey: buildRevocationIdempotencyKey({
        organizationId: 'org-1',
        triggerType: 'PROVIDER_GRANT_REVOKED',
        entityId: 'grant-1',
      }),
    });

    expect(steps.executeDenySwitch).toHaveBeenCalled();
    expect(result.denySwitchActivated).toBe(true);
    expect(result.idempotentReplay).toBe(false);
  });
});
