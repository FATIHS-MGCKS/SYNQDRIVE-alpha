import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowRunOrchestratorService } from './workflow-run-orchestrator.service';
import { WorkflowRunWorkerService } from './workflow-run-worker.service';
import { WorkflowRunOrchestratorRepository } from './workflow-run-orchestrator.repository';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowActionRunRuntimeService } from './workflow-action-run-runtime.service';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';
import { WorkflowRuntimeActionExecutorAdapter } from './workflow-runtime-action-executor.adapter';
import {
  assertWorkflowRunTransitionOrThrow,
  assertWorkflowActionRunTransitionOrThrow,
} from './workflow-runtime-status.transitions';
import { deriveWorkflowRunStatusFromActions } from './workflow-run-status.derivation';
import type { WorkflowDomainEventEnvelope } from '../envelope';
import type { WorkflowMatcherMatchedWorkflow } from '../matcher/workflow-matcher.types';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN_ID = 'run-0001';
const ACTION_1 = 'action-0001';
const ACTION_2 = 'action-0002';
const DEF_ID = 'def-0001';
const VER_ID = 'ver-0001';

function envelope(): WorkflowDomainEventEnvelope {
  return {
    eventId: 'evt-0001',
    eventType: 'booking.returned',
    eventVersion: '1.0.0',
    organizationId: ORG_A,
    occurredAt: '2026-07-25T10:00:00.000Z',
    receivedAt: '2026-07-25T10:00:01.000Z',
    entityType: 'booking',
    entityId: 'booking-1',
    correlationId: 'corr-1',
    causationId: null,
    source: 'bookings',
    payload: { bookingId: 'booking-1', vehicleId: 'veh-1' },
    metadata: {},
    schemaVersion: '1.0.0',
  };
}

function match(): WorkflowMatcherMatchedWorkflow {
  return {
    workflowDefinitionId: DEF_ID,
    workflowVersionId: VER_ID,
    definitionName: 'Test Workflow',
    definitionSlug: 'test',
    versionNumber: 1,
    triggerType: 'booking.returned',
    scopeType: 'ORGANIZATION',
    matchRank: 0,
  };
}

function versionGraph(overrides: Record<string, unknown> = {}) {
  return {
    id: VER_ID,
    workflowDefinitionId: DEF_ID,
    versionNumber: 1,
    status: 'ACTIVE',
    definitionSnapshot: null,
    conditionGroups: [],
    actions: [
      {
        id: 'wa-1',
        actionKey: 'task-1',
        actionIndex: 0,
        actionType: 'task.create',
        requiresApproval: false,
        config: { title: 'Task 1' },
      },
      {
        id: 'wa-2',
        actionKey: 'task-2',
        actionIndex: 1,
        actionType: 'task.create',
        requiresApproval: false,
        config: { title: 'Task 2' },
      },
    ],
    ...overrides,
  };
}

function createPrismaMock() {
  const tx = {
    workflowRun: {
      create: jest.fn(),
      update: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    workflowActionRun: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    workflowRuntimeStatusTransition: { create: jest.fn() },
    workflowExecutionSnapshot: { create: jest.fn() },
    workflowDefinition: { update: jest.fn() },
    workflowApproval: { create: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    workflowRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    workflowActionRun: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    workflowVersion: { findFirst: jest.fn() },
    workflowPolicySnapshot: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    workflowApproval: { create: jest.fn() },
    workflowRuntimeStatusTransition: { findMany: jest.fn(), create: jest.fn() },
    __tx: tx,
  };

  return prisma;
}

describe('WorkflowRunStateMachine', () => {
  describe('status transition guards', () => {
    it('rejects invalid run status transition', () => {
      expect(() => assertWorkflowRunTransitionOrThrow('COMPLETED', 'RUNNING')).toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid action status transition', () => {
      expect(() => assertWorkflowActionRunTransitionOrThrow('SUCCEEDED', 'RUNNING')).toThrow(
        BadRequestException,
      );
    });

    it('allows PENDING → RUNNING for runs', () => {
      expect(() => assertWorkflowRunTransitionOrThrow('PENDING', 'RUNNING')).not.toThrow();
    });

    it('allows FAILED_RETRYABLE → RUNNING for actions', () => {
      expect(() =>
        assertWorkflowActionRunTransitionOrThrow('FAILED_RETRYABLE', 'RUNNING'),
      ).not.toThrow();
    });
  });

  describe('run status derivation', () => {
    it('derives COMPLETED when all actions succeed', () => {
      expect(deriveWorkflowRunStatusFromActions(['SUCCEEDED', 'SUCCEEDED'])).toBe('COMPLETED');
    });

    it('derives PARTIALLY_COMPLETED on mixed success/failure', () => {
      expect(deriveWorkflowRunStatusFromActions(['SUCCEEDED', 'FAILED_PERMANENT'])).toBe(
        'PARTIALLY_COMPLETED',
      );
    });

    it('derives FAILED when all actions fail permanently', () => {
      expect(deriveWorkflowRunStatusFromActions(['FAILED_PERMANENT'])).toBe('FAILED');
    });

    it('derives SKIPPED when all actions skipped', () => {
      expect(deriveWorkflowRunStatusFromActions(['SKIPPED', 'SKIPPED'])).toBe('SKIPPED');
    });

    it('returns RUNNING while actions are active', () => {
      expect(deriveWorkflowRunStatusFromActions(['SUCCEEDED', 'PENDING'])).toBe('RUNNING');
    });

    it('returns WAITING_FOR_APPROVAL when action awaits approval', () => {
      expect(deriveWorkflowRunStatusFromActions(['WAITING_FOR_APPROVAL'])).toBe(
        'WAITING_FOR_APPROVAL',
      );
    });
  });

  describe('WorkflowRunOrchestratorService', () => {
    it('returns existing run on idempotent create', async () => {
      const prisma = createPrismaMock();
      const existing = { id: RUN_ID, organizationId: ORG_A };
      prisma.workflowRun.findUnique.mockResolvedValue(existing);

      const repo = new WorkflowRunOrchestratorRepository(prisma as never);
      const service = new WorkflowRunOrchestratorService(repo);

      const result = await service.createRunFromMatch({
        organizationId: ORG_A,
        match: match(),
        envelope: envelope(),
      });

      expect(result).toBe(existing);
      expect(prisma.workflowVersion.findFirst).not.toHaveBeenCalled();
    });

    it('creates skipped run when conditions fail', async () => {
      const prisma = createPrismaMock();
      prisma.workflowRun.findUnique.mockResolvedValue(null);
      prisma.workflowVersion.findFirst.mockResolvedValue(
        versionGraph({
          conditionGroups: [
            {
              conditions: [
                {
                  fieldPath: 'payload.bookingId',
                  operator: 'equals',
                  valueText: 'other',
                  sortOrder: 0,
                  valueJson: 'other',
                  valueNumber: null,
                  valueBoolean: null,
                },
              ],
            },
          ],
        }),
      );
      prisma.workflowPolicySnapshot.findUnique.mockResolvedValue({
        id: 'policy-1',
      });
      const skippedRun = { id: RUN_ID, status: 'SKIPPED' };
      prisma.__tx.workflowRun.create.mockResolvedValue({ id: RUN_ID });
      prisma.__tx.workflowRun.findFirstOrThrow.mockResolvedValue(skippedRun);

      const repo = new WorkflowRunOrchestratorRepository(prisma as never);
      const service = new WorkflowRunOrchestratorService(repo);
      const result = await service.createRunFromMatch({
        organizationId: ORG_A,
        match: match(),
        envelope: envelope(),
      });

      expect(result.status).toBe('SKIPPED');
      expect(prisma.__tx.workflowActionRun.create).not.toHaveBeenCalled();
    });

    it('creates run with action runs in stable order', async () => {
      const prisma = createPrismaMock();
      prisma.workflowRun.findUnique.mockResolvedValue(null);
      prisma.workflowVersion.findFirst.mockResolvedValue(versionGraph());
      prisma.workflowPolicySnapshot.findUnique.mockResolvedValue({ id: 'policy-1' });
      prisma.__tx.workflowRun.create.mockResolvedValue({ id: RUN_ID });
      prisma.__tx.workflowRun.findFirstOrThrow.mockResolvedValue({
        id: RUN_ID,
        status: 'RUNNING',
        actionRuns: [{ actionIndex: 0 }, { actionIndex: 1 }],
      });

      const repo = new WorkflowRunOrchestratorRepository(prisma as never);
      const service = new WorkflowRunOrchestratorService(repo);
      await service.createRunFromMatch({
        organizationId: ORG_A,
        match: match(),
        envelope: envelope(),
      });

      expect(prisma.__tx.workflowActionRun.create).toHaveBeenCalledTimes(2);
      const firstCall = prisma.__tx.workflowActionRun.create.mock.calls[0][0];
      const secondCall = prisma.__tx.workflowActionRun.create.mock.calls[1][0];
      expect(firstCall.data.actionIndex).toBe(0);
      expect(secondCall.data.actionIndex).toBe(1);
    });
  });

  describe('WorkflowRunWorkerService', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    function createWorkerHarness(executorResult: {
      status: 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT' | 'WAITING_FOR_APPROVAL';
      errorMessage?: string;
    }) {
      const prisma = createPrismaMock();
      const config = {
        get: jest.fn((_key: string, fallback: number) => fallback),
      } as unknown as ConfigService;

      const actionRuns = new WorkflowActionRunRuntimeRepository(prisma as never);
      const runs = new WorkflowRunRuntimeRepository(prisma as never);
      const orchestratorRepo = new WorkflowRunOrchestratorRepository(prisma as never);
      const audit = new WorkflowRuntimeStatusAuditService(prisma as never);
      const runRuntime = new WorkflowRunRuntimeService(
        prisma as never,
        runs,
        actionRuns,
        audit,
      );
      const executor = {
        buildActionDef: jest.fn(),
        execute: jest.fn().mockResolvedValue(executorResult),
      } as unknown as WorkflowRuntimeActionExecutorAdapter;

      const worker = new WorkflowRunWorkerService(
        prisma as never,
        config,
        actionRuns,
        runs,
        orchestratorRepo,
        runRuntime,
        audit,
        executor,
      );

      return { prisma, worker, executor, runRuntime };
    }

    it('executes complete successful run (single action)', async () => {
      const { prisma, worker } = createWorkerHarness({ status: 'SUCCEEDED' });
      prisma.workflowRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        organizationId: ORG_A,
        status: 'RUNNING',
        lockVersion: 1,
        startedAt: new Date(),
        workflowDefinitionId: DEF_ID,
        eventType: 'booking.returned',
        entityType: 'booking',
        entityId: 'booking-1',
        idempotencyKey: 'key-1',
        inputPayload: {},
      });
      prisma.workflowActionRun.findMany.mockResolvedValue([
        {
          id: ACTION_1,
          actionIndex: 0,
          status: 'PENDING',
          nextAttemptAt: null,
          actionType: 'task.create',
          requiresApproval: false,
          input: {},
          lockVersion: 1,
          attemptCount: 0,
        },
      ]);
      prisma.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.workflowActionRun.findFirst.mockResolvedValue({
        id: ACTION_1,
        actionIndex: 0,
        status: 'RUNNING',
        lockVersion: 2,
        attemptCount: 1,
        actionType: 'task.create',
        requiresApproval: false,
        input: {},
      });

      const result = await worker.processRun(ORG_A, RUN_ID, 'worker-a');
      expect(result.processed).toBe(true);
      expect(result.status).toBe('SUCCEEDED');
    });

    it('handles retryable action failure', async () => {
      const { prisma, worker } = createWorkerHarness({
        status: 'FAILED_RETRYABLE',
        errorMessage: 'connection timeout',
      });
      prisma.workflowRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        organizationId: ORG_A,
        status: 'RUNNING',
        lockVersion: 1,
        startedAt: new Date(),
        workflowDefinitionId: DEF_ID,
        eventType: 'booking.returned',
        entityType: null,
        entityId: null,
        idempotencyKey: 'key-1',
        inputPayload: {},
      });
      prisma.workflowActionRun.findMany.mockResolvedValue([
        {
          id: ACTION_1,
          actionIndex: 0,
          status: 'PENDING',
          nextAttemptAt: null,
          actionType: 'task.create',
          requiresApproval: false,
          input: {},
          lockVersion: 1,
          attemptCount: 0,
        },
      ]);
      prisma.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.workflowActionRun.findFirst.mockResolvedValue({
        id: ACTION_1,
        actionIndex: 0,
        status: 'RUNNING',
        lockVersion: 2,
        attemptCount: 1,
        actionType: 'task.create',
        requiresApproval: false,
        input: {},
      });

      const result = await worker.processRun(ORG_A, RUN_ID, 'worker-a');
      expect(result.processed).toBe(true);
      expect(result.status).toBe('FAILED_RETRYABLE');
    });

    it('handles permanent action failure', async () => {
      const { prisma, worker } = createWorkerHarness({
        status: 'FAILED_PERMANENT',
        errorMessage: 'Vehicle not found',
      });
      prisma.workflowRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        organizationId: ORG_A,
        status: 'RUNNING',
        lockVersion: 1,
        startedAt: new Date(),
        workflowDefinitionId: DEF_ID,
        eventType: 'booking.returned',
        entityType: null,
        entityId: null,
        idempotencyKey: 'key-1',
        inputPayload: {},
      });
      prisma.workflowActionRun.findMany.mockResolvedValue([
        {
          id: ACTION_1,
          actionIndex: 0,
          status: 'PENDING',
          nextAttemptAt: null,
          actionType: 'task.create',
          requiresApproval: false,
          input: {},
          lockVersion: 1,
          attemptCount: 0,
        },
      ]);
      prisma.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.workflowActionRun.findFirst.mockResolvedValue({
        id: ACTION_1,
        actionIndex: 0,
        status: 'RUNNING',
        lockVersion: 2,
        attemptCount: 5,
        actionType: 'task.create',
        requiresApproval: false,
        input: {},
      });

      const result = await worker.processRun(ORG_A, RUN_ID, 'worker-a');
      expect(result.status).toBe('FAILED_PERMANENT');
    });

    it('detects parallel worker claim conflict', async () => {
      const { prisma, worker } = createWorkerHarness({ status: 'SUCCEEDED' });
      prisma.workflowRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        organizationId: ORG_A,
        status: 'RUNNING',
        lockVersion: 1,
        startedAt: new Date(),
      });
      prisma.workflowActionRun.findMany.mockResolvedValue([
        {
          id: ACTION_1,
          actionIndex: 0,
          status: 'PENDING',
          nextAttemptAt: null,
        },
      ]);
      prisma.workflowActionRun.updateMany.mockResolvedValue({ count: 0 });

      const result = await worker.processRun(ORG_A, RUN_ID, 'worker-b');
      expect(result).toEqual({ processed: false, reason: 'claim_conflict' });
    });

    it('recovers stale RUNNING actions', async () => {
      const prisma = createPrismaMock();
      const config = {
        get: jest.fn((_key: string, fallback: number) => fallback),
      } as unknown as ConfigService;
      const actionRuns = new WorkflowActionRunRuntimeRepository(prisma as never);
      const worker = new WorkflowRunWorkerService(
        prisma as never,
        config,
        actionRuns,
        new WorkflowRunRuntimeRepository(prisma as never),
        new WorkflowRunOrchestratorRepository(prisma as never),
        new WorkflowRunRuntimeService(
          prisma as never,
          new WorkflowRunRuntimeRepository(prisma as never),
          actionRuns,
          new WorkflowRuntimeStatusAuditService(prisma as never),
        ),
        new WorkflowRuntimeStatusAuditService(prisma as never),
        { buildActionDef: jest.fn(), execute: jest.fn() } as never,
      );

      prisma.workflowActionRun.findMany.mockResolvedValue([{ id: ACTION_1, organizationId: ORG_A }]);
      prisma.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });

      const recovered = await worker.recoverStaleRunningActions();
      expect(recovered).toBe(1);
    });
  });

  describe('tenant isolation', () => {
    it('rejects cross-tenant run access', async () => {
      const prisma = createPrismaMock();
      prisma.workflowRun.findFirst.mockResolvedValue(null);
      const runs = new WorkflowRunRuntimeRepository(prisma as never);

      await expect(runs.findByIdOrThrow(ORG_B, RUN_ID)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'WORKFLOW_RUN_NOT_FOUND',
        }),
      });
    });

    it('enforces tenant on orchestrator assertTenant', () => {
      const repo = new WorkflowRunOrchestratorRepository({} as never);
      expect(() => repo.assertTenant({ organizationId: ORG_A }, ORG_B)).toThrow(
        'WORKFLOW_RUNTIME_TENANT_VIOLATION',
      );
    });
  });

  describe('WorkflowActionRunRuntimeService transitions', () => {
    it('detects lock conflict on concurrent action update', async () => {
      const prisma = createPrismaMock();
      prisma.workflowActionRun.findFirst.mockResolvedValue({
        id: ACTION_1,
        organizationId: ORG_A,
        workflowRunId: RUN_ID,
        status: 'RUNNING',
        lockVersion: 1,
        attemptCount: 1,
      });
      prisma.__tx.workflowActionRun.updateMany.mockResolvedValue({ count: 0 });

      const actionRuns = new WorkflowActionRunRuntimeRepository(prisma as never);
      const runs = new WorkflowRunRuntimeRepository(prisma as never);
      const audit = new WorkflowRuntimeStatusAuditService(prisma as never);
      const runRuntime = new WorkflowRunRuntimeService(
        prisma as never,
        runs,
        actionRuns,
        audit,
      );
      const service = new WorkflowActionRunRuntimeService(
        prisma as never,
        actionRuns,
        runs,
        runRuntime,
        audit,
      );

      await expect(
        service.transitionStatus(ORG_A, ACTION_1, {
          toStatus: 'SUCCEEDED',
          expectedLockVersion: 1,
          actor: { type: 'WORKER', source: 'test' },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
