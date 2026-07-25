import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowActionRunExecutorService } from './workflow-action-run-executor.service';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowRuntimeActionExecutorAdapter } from './workflow-runtime-action-executor.adapter';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';
import {
  classifyActionError,
  resolveStatusFromClassification,
  sanitizeErrorSummary,
} from './workflow-action-run-error.classifier';
import {
  buildInputSnapshot,
  buildResultSummary,
  containsSecretKeys,
  extractProviderReference,
  resolveActionFromRunSnapshot,
  stripSecretsFromValue,
} from './workflow-action-run-snapshot.util';
import { WorkflowRunWorkerService } from './workflow-run-worker.service';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN_ID = 'run-0001';
const ACTION_ID = 'action-0001';

function createPrismaMock() {
  const tx = {
    workflowActionRun: { updateMany: jest.fn() },
    workflowRuntimeStatusTransition: { create: jest.fn() },
    workflowApproval: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    workflowPolicySnapshot: { findFirst: jest.fn() },
    workflowApproval: { create: jest.fn() },
    __tx: tx,
  };
  return prisma;
}

function actionRun(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    organizationId: ORG_A,
    workflowRunId: RUN_ID,
    workflowActionId: 'wa-1',
    actionKey: 'task-1',
    actionIndex: 0,
    actionType: 'task.create',
    status: 'RUNNING',
    lockVersion: 2,
    attemptCount: 1,
    maxAttempts: 5,
    blockingOnFailure: true,
    requiresApproval: false,
    idempotencyKey: 'key:action:0',
    input: { title: 'Test' },
    inputSnapshot: null,
    output: null,
    resultSummary: null,
    errorCode: null,
    errorCategory: null,
    errorSummary: null,
    providerReference: null,
    timeoutAt: new Date(Date.now() + 120000),
    nextAttemptAt: null,
    ...overrides,
  };
}

function runRow() {
  return {
    id: RUN_ID,
    organizationId: ORG_A,
    policySnapshotId: 'policy-1',
    workflowDefinitionId: 'def-1',
    eventType: 'booking.returned',
    entityType: 'booking',
    entityId: 'b-1',
    correlationId: 'corr-1',
    idempotencyKey: 'key-1',
    startedAt: new Date(),
    inputPayload: { bookingId: 'b-1' },
    definitionSnapshot: {
      actions: [
        {
          actionKey: 'task-1',
          actionIndex: 0,
          actionType: 'task.create',
          requiresApproval: false,
        },
      ],
    },
  };
}

describe('WorkflowActionRunExecutor', () => {
  describe('error classifier', () => {
    it('classifies retryable connection errors', () => {
      const result = classifyActionError(new Error('connection timeout'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      expect(result.errorCategory).toBe('RETRYABLE');
      expect(result.retryable).toBe(true);
      expect(resolveStatusFromClassification(result)).toBe('FAILED_RETRYABLE');
    });

    it('classifies permanent errors', () => {
      const result = classifyActionError(new Error('Vehicle not found'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      expect(result.errorCategory).toBe('PERMANENT');
      expect(resolveStatusFromClassification(result)).toBe('FAILED_PERMANENT');
    });

    it('blocks auto-retry on unclear provider state', () => {
      const result = classifyActionError(new Error('submitted but unconfirmed by provider'), {
        attemptCount: 1,
        maxAttempts: 5,
      });
      expect(result.errorCategory).toBe('PROVIDER_UNCLEAR');
      expect(result.blockAutoRetry).toBe(true);
      expect(resolveStatusFromClassification(result)).toBe('FAILED_PERMANENT');
    });

    it('classifies timeout', () => {
      const result = classifyActionError(new Error('timeout'), {
        attemptCount: 3,
        maxAttempts: 5,
        timedOut: true,
      });
      expect(result.errorCategory).toBe('TIMEOUT');
      expect(result.retryable).toBe(true);
    });

    it('exhausts retries at maxAttempts', () => {
      const result = classifyActionError(new Error('connection timeout'), {
        attemptCount: 5,
        maxAttempts: 5,
      });
      expect(result.retryable).toBe(false);
      expect(resolveStatusFromClassification(result)).toBe('FAILED_PERMANENT');
    });
  });

  describe('snapshot utils', () => {
    it('strips secrets from input snapshot', () => {
      const snapshot = buildInputSnapshot({
        actionKey: 'a1',
        actionIndex: 0,
        actionType: 'task.create',
        workflowActionId: 'wa-1',
        requiresApproval: false,
        blockingOnFailure: true,
        input: { title: 'T', apiKey: 'secret-value', email: 'user@example.com' },
      });
      expect(snapshot.config).toBeDefined();
      expect(containsSecretKeys(snapshot)).toBeNull();
      expect(JSON.stringify(snapshot)).not.toContain('secret-value');
      expect(JSON.stringify(snapshot)).not.toContain('user@example.com');
    });

    it('builds minimized result summary', () => {
      const summary = buildResultSummary({
        taskId: 'task-123',
        email: 'hidden@example.com',
        apiKey: 'x',
      });
      expect(summary?.taskId).toBe('task-123');
      expect(summary?.apiKey).toBeUndefined();
      expect(summary?.email).toMatch(/\[ref:/);
    });

    it('extracts provider reference', () => {
      expect(extractProviderReference({ taskId: 'task-abc' })).toBe('task-abc');
    });

    it('resolves action from run snapshot not live definition', () => {
      const resolved = resolveActionFromRunSnapshot(
        {
          definitionSnapshot: {
            actions: [{ actionKey: 'task-1', actionIndex: 0, actionType: 'task.create' }],
          },
        },
        actionRun(),
      );
      expect(resolved.actionType).toBe('task.create');
      expect(resolved.actionKey).toBe('task-1');
    });

    it('sanitizes error summary', () => {
      const summary = sanitizeErrorSummary('Failed for user@example.com with api_key=abc123');
      expect(summary).not.toContain('user@example.com');
      expect(summary).not.toContain('abc123');
    });
  });

  describe('WorkflowActionRunExecutorService', () => {
    function createHarness() {
      const prisma = createPrismaMock();
      const config = {
        get: jest.fn((_key: string, fallback: number) => fallback),
      } as unknown as ConfigService;
      const actionRuns = new WorkflowActionRunRuntimeRepository(prisma as never);
      jest.spyOn(actionRuns, 'findByIdOrThrow').mockImplementation(async () => actionRun() as never);
      jest.spyOn(actionRuns, 'patchExecutionFields').mockResolvedValue({ count: 1 });
      const runs = new WorkflowRunRuntimeRepository(prisma as never);
      jest.spyOn(runs, 'findByIdOrThrow').mockResolvedValue(runRow() as never);
      const audit = new WorkflowRuntimeStatusAuditService(prisma as never);
      const runRuntime = {
        deriveAndApplyRunStatus: jest.fn().mockResolvedValue({}),
      } as unknown as WorkflowRunRuntimeService;
      const adapter = {
        execute: jest.fn(),
      } as unknown as WorkflowRuntimeActionExecutorAdapter;
      prisma.workflowPolicySnapshot.findFirst.mockResolvedValue({
        id: 'policy-1',
        capabilityRevision: '1.0.0',
        approvalResumeSupported: false,
        approvalTtlHours: 72,
      });
      prisma.__tx.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });

      const approvalPause = {
        finalizeExecutionApproval: jest.fn().mockResolvedValue({ id: 'approval-1' }),
      };

      const service = new WorkflowActionRunExecutorService(
        prisma as never,
        config,
        actionRuns,
        runs,
        runRuntime,
        audit,
        adapter,
        approvalPause as never,
      );
      return { service, adapter, actionRuns, prisma, runRuntime };
    }

    it('returns idempotent replay for already succeeded action', async () => {
      const { service, actionRuns, adapter } = createHarness();
      jest.spyOn(actionRuns, 'findByIdOrThrow').mockResolvedValue(
        actionRun({
          status: 'SUCCEEDED',
          resultSummary: { taskId: 'task-1' },
          providerReference: 'task-1',
        }) as never,
      );

      const result = await service.executeClaimed(ORG_A, ACTION_ID, {
        type: 'WORKER',
        source: 'test',
      });
      expect(result.idempotentReplay).toBe(true);
      expect(result.status).toBe('SUCCEEDED');
      expect(adapter.execute).not.toHaveBeenCalled();
    });

    it('persists success atomically', async () => {
      const { service, adapter, prisma } = createHarness();
      (adapter.execute as jest.Mock).mockResolvedValue({
        status: 'SUCCEEDED',
        output: { taskId: 'task-99' },
      });

      const result = await service.executeClaimed(ORG_A, ACTION_ID, {
        type: 'WORKER',
        source: 'worker-1',
      });
      expect(result.status).toBe('SUCCEEDED');
      expect(result.providerReference).toBe('task-99');
      expect(prisma.__tx.workflowActionRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            providerReference: 'task-99',
          }),
        }),
      );
    });

    it('persists retryable failure with nextAttemptAt', async () => {
      const { service, adapter, prisma } = createHarness();
      (adapter.execute as jest.Mock).mockResolvedValue({
        status: 'FAILED_RETRYABLE',
        errorMessage: 'connection timeout',
      });

      const result = await service.executeClaimed(ORG_A, ACTION_ID, {
        type: 'WORKER',
        source: 'worker-1',
      });
      expect(result.status).toBe('FAILED_RETRYABLE');
      expect(prisma.__tx.workflowActionRun.updateMany).toHaveBeenCalled();
    });

    it('rejects cross-tenant execution', async () => {
      const { service, actionRuns } = createHarness();
      jest.spyOn(actionRuns, 'findByIdOrThrow').mockResolvedValue(
        actionRun({ organizationId: ORG_B }) as never,
      );

      await expect(
        service.executeClaimed(ORG_A, ACTION_ID, { type: 'WORKER', source: 'test' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires RUNNING status before execution', async () => {
      const { service, actionRuns } = createHarness();
      jest.spyOn(actionRuns, 'findByIdOrThrow').mockResolvedValue(
        actionRun({ status: 'PENDING' }) as never,
      );

      await expect(
        service.executeClaimed(ORG_A, ACTION_ID, { type: 'WORKER', source: 'test' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not persist secrets in result', async () => {
      const { service, adapter, prisma } = createHarness();
      (adapter.execute as jest.Mock).mockResolvedValue({
        status: 'SUCCEEDED',
        output: { taskId: 't-1', apiKey: 'should-not-persist' },
      });

      await service.executeClaimed(ORG_A, ACTION_ID, { type: 'WORKER', source: 'w' });
      const call = (prisma.__tx.workflowActionRun.updateMany as jest.Mock).mock.calls[0][0];
      const summary = call.data.resultSummary as Record<string, unknown>;
      expect(summary.apiKey).toBeUndefined();
      expect(JSON.stringify(call.data)).not.toContain('should-not-persist');
    });
  });

  describe('non-blocking failure continuation', () => {
    it('allows next action when prior failed with blockingOnFailure=false', () => {
      const worker = new WorkflowRunWorkerService(
        { get: jest.fn((_k: string, d: number) => d) } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const satisfied = (worker as unknown as { isPriorActionSatisfied: (a: unknown) => boolean })
        .isPriorActionSatisfied({ status: 'FAILED_PERMANENT', blockingOnFailure: false });
      expect(satisfied).toBe(true);
    });

    it('blocks next action when prior failed with blockingOnFailure=true', () => {
      const worker = new WorkflowRunWorkerService(
        { get: jest.fn((_k: string, d: number) => d) } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const satisfied = (worker as unknown as { isPriorActionSatisfied: (a: unknown) => boolean })
        .isPriorActionSatisfied({ status: 'FAILED_PERMANENT', blockingOnFailure: true });
      expect(satisfied).toBe(false);
    });
  });

  describe('process restart discoverability', () => {
    it('findOpenActionRuns queries resumable statuses', async () => {
      const prisma = {
        workflowActionRun: { findMany: jest.fn().mockResolvedValue([{ id: ACTION_ID }]) },
      };
      const repo = new WorkflowActionRunRuntimeRepository(prisma as never);
      const rows = await repo.findOpenActionRuns(ORG_A);
      expect(rows).toHaveLength(1);
      expect(prisma.workflowActionRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_A }),
        }),
      );
    });
  });
});
