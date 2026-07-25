import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowRunCancellationService } from './workflow-run-cancellation.service';
import { WorkflowTimerRepository } from './workflow-timer.repository';
import { WorkflowRunRuntimeRepository } from '../workflow-run-runtime.repository';
import { WorkflowActionRunRuntimeRepository } from '../workflow-action-run-runtime.repository';
import { WorkflowApprovalRepository } from '../approval/workflow-approval.repository';
import { WorkflowRuntimeStatusAuditService } from '../workflow-runtime-status-audit.service';
import { WORKFLOW_CANCELLATION_ERROR_CODES } from './workflow-run-cancellation.types';
import { assertWorkflowRunTransition } from '../workflow-runtime-status.transitions';
import { classifyActionError, resolveStatusFromClassification } from '../workflow-action-run-error.classifier';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN_ID = 'run-0001';
const ACTION_1 = 'action-0001';
const ACTION_2 = 'action-0002';

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    organizationId: ORG_A,
    status: 'RUNNING',
    lockVersion: 1,
    eventType: 'booking.returned',
    entityType: 'booking',
    entityId: 'booking-1',
    startedAt: new Date(),
    finishedAt: null,
    cancelledAt: null,
    cancelReason: null,
    cancelledByActorType: null,
    errorMessage: null,
    ...overrides,
  };
}

function actionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_1,
    organizationId: ORG_A,
    workflowRunId: RUN_ID,
    actionIndex: 0,
    status: 'PENDING',
    providerReference: null,
    lockVersion: 1,
    ...overrides,
  };
}

describe('WorkflowCancellationAndTimeouts', () => {
  describe('transition guards', () => {
    it('allows cancel from WAITING', () => {
      expect(assertWorkflowRunTransition('WAITING', 'CANCELLED').allowed).toBe(true);
    });

    it('allows cancel from WAITING_FOR_APPROVAL', () => {
      expect(assertWorkflowRunTransition('WAITING_FOR_APPROVAL', 'CANCELLED').allowed).toBe(true);
    });
  });

  describe('WorkflowRunCancellationService', () => {
    function createHarness() {
      const prisma = {
        $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})),
        organization: { findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
        workflowApproval: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const runs = {
        findByIdOrThrow: jest.fn(),
        listByRun: jest.fn(),
        transitionStatus: jest.fn().mockResolvedValue(1),
        listActive: jest.fn(),
      } as unknown as WorkflowRunRuntimeRepository;

      const actionRuns = {
        listByRun: jest.fn(),
        forceTerminate: jest.fn().mockResolvedValue(1),
      } as unknown as WorkflowActionRunRuntimeRepository;

      const approvals = {
        decide: jest.fn().mockResolvedValue(1),
        listActiveForRun: jest.fn().mockResolvedValue([]),
      } as unknown as WorkflowApprovalRepository;

      const timers = {
        cancelScheduledForRun: jest.fn().mockResolvedValue({ count: 1 }),
        cancelScheduledForAction: jest.fn().mockResolvedValue({ count: 1 }),
        cancelScheduledForApproval: jest.fn().mockResolvedValue({ count: 0 }),
      } as unknown as WorkflowTimerRepository;

      const audit = {
        recordRunTransition: jest.fn(),
        recordActionRunTransition: jest.fn(),
      } as unknown as WorkflowRuntimeStatusAuditService;

      const service = new WorkflowRunCancellationService(
        prisma as never,
        runs,
        actionRuns,
        approvals,
        timers,
        audit,
      );

      return { service, prisma, runs, actionRuns, approvals, timers, audit };
    }

    it('cancels run before first action', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(runRow({ status: 'PENDING' }));
      (h.actionRuns.listByRun as jest.Mock).mockResolvedValue([
        actionRow({ status: 'PENDING' }),
        actionRow({ id: ACTION_2, actionIndex: 1, status: 'PENDING' }),
      ]);

      const result = await h.service.cancelRun({
        organizationId: ORG_A,
        runId: RUN_ID,
        actor: { type: 'USER', id: 'user-1', source: 'test' },
        reason: 'No longer needed',
        source: 'USER_REQUEST',
        userId: 'user-1',
      });

      expect(result.status).toBe('CANCELLED');
      expect(result.cancelledActions).toBe(2);
      expect(h.runs.transitionStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toStatus: 'CANCELLED' }),
      );
    });

    it('cancels run during WAITING', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(runRow({ status: 'WAITING' }));
      (h.actionRuns.listByRun as jest.Mock).mockResolvedValue([
        actionRow({ status: 'SUCCEEDED' }),
        actionRow({ id: ACTION_2, actionIndex: 1, status: 'WAITING' }),
      ]);

      const result = await h.service.cancelRun({
        organizationId: ORG_A,
        runId: RUN_ID,
        actor: { type: 'USER', id: 'user-1', source: 'test' },
        reason: 'Stop wait',
        source: 'USER_REQUEST',
      });

      expect(result.cancelledActions).toBe(1);
      expect(h.timers.cancelScheduledForAction).toHaveBeenCalled();
    });

    it('cancels run during WAITING_FOR_APPROVAL', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(
        runRow({ status: 'WAITING_FOR_APPROVAL' }),
      );
      (h.actionRuns.listByRun as jest.Mock).mockResolvedValue([
        actionRow({ status: 'WAITING_FOR_APPROVAL' }),
      ]);
      (h.approvals.listActiveForRun as jest.Mock).mockResolvedValue([
        { id: 'approval-1', status: 'PENDING' },
      ]);

      const result = await h.service.cancelRun({
        organizationId: ORG_A,
        runId: RUN_ID,
        actor: { type: 'USER', id: 'user-1', source: 'test' },
        reason: 'Withdraw',
        source: 'USER_REQUEST',
      });

      expect(result.cancelledApprovals).toBe(1);
      expect(h.approvals.decide).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toStatus: 'CANCELLED' }),
      );
    });

    it('marks provider-handoff action as FAILED_PERMANENT not CANCELLED', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(runRow());
      (h.actionRuns.listByRun as jest.Mock).mockResolvedValue([
        actionRow({ status: 'RUNNING', providerReference: 'msg-provider-123' }),
      ]);

      const result = await h.service.cancelRun({
        organizationId: ORG_A,
        runId: RUN_ID,
        actor: { type: 'USER', id: 'user-1', source: 'test' },
        reason: 'Abort',
        source: 'USER_REQUEST',
      });

      expect(result.providerUnclearActions).toBe(1);
      expect(result.cancelledActions).toBe(0);
      expect(h.actionRuns.forceTerminate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          toStatus: 'FAILED_PERMANENT',
          errorCategory: 'PROVIDER_UNCLEAR',
        }),
      );
    });

    it('preserves completed actions historically', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(runRow());
      (h.actionRuns.listByRun as jest.Mock).mockResolvedValue([
        actionRow({ status: 'SUCCEEDED' }),
        actionRow({ id: ACTION_2, actionIndex: 1, status: 'PENDING' }),
      ]);

      await h.service.cancelRun({
        organizationId: ORG_A,
        runId: RUN_ID,
        actor: { type: 'USER', id: 'user-1', source: 'test' },
        reason: 'Partial cancel',
        source: 'USER_REQUEST',
      });

      expect(h.actionRuns.forceTerminate).toHaveBeenCalledTimes(1);
    });

    it('blocks cross-tenant cancellation', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(
        runRow({ organizationId: ORG_B }),
      );

      await expect(
        h.service.cancelRun({
          organizationId: ORG_A,
          runId: RUN_ID,
          actor: { type: 'USER', id: 'user-1', source: 'test' },
          reason: 'Hack',
          source: 'USER_REQUEST',
        }),
      ).rejects.toMatchObject({
        response: { code: WORKFLOW_CANCELLATION_ERROR_CODES.TENANT_VIOLATION },
      });
    });

    it('blocks duplicate cancellation of terminal run', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(
        runRow({ status: 'CANCELLED' }),
      );

      await expect(
        h.service.cancelRun({
          organizationId: ORG_A,
          runId: RUN_ID,
          actor: { type: 'USER', id: 'user-1', source: 'test' },
          reason: 'Again',
          source: 'USER_REQUEST',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('detects parallel cancellation via lock version', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(runRow({ lockVersion: 2 }));

      await expect(
        h.service.cancelRun({
          organizationId: ORG_A,
          runId: RUN_ID,
          actor: { type: 'USER', id: 'user-1', source: 'test' },
          reason: 'Race',
          source: 'USER_REQUEST',
          expectedLockVersion: 1,
        }),
      ).rejects.toMatchObject({
        response: { code: WORKFLOW_CANCELLATION_ERROR_CODES.LOCK_CONFLICT },
      });
    });

    it('deactivates timers on cancel', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(runRow());
      (h.actionRuns.listByRun as jest.Mock).mockResolvedValue([
        actionRow({ status: 'WAITING' }),
      ]);
      (h.timers.cancelScheduledForRun as jest.Mock).mockResolvedValue({ count: 2 });
      (h.timers.cancelScheduledForAction as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await h.service.cancelRun({
        organizationId: ORG_A,
        runId: RUN_ID,
        actor: { type: 'USER', id: 'user-1', source: 'test' },
        reason: 'Timer cleanup',
        source: 'USER_REQUEST',
      });

      expect(result.cancelledTimers).toBe(3);
    });

    it('blocks execution for locked organization', async () => {
      const h = createHarness();
      (h.prisma.organization.findFirst as jest.Mock).mockResolvedValue({ status: 'ARCHIVED' });

      await expect(h.service.assertOrgNotLocked(ORG_A)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns explicit status view for API', async () => {
      const h = createHarness();
      (h.runs.findByIdOrThrow as jest.Mock).mockResolvedValue(
        runRow({
          status: 'CANCELLED',
          cancelledAt: new Date('2026-07-25T10:00:00.000Z'),
          cancelReason: 'User request',
          cancelledByActorType: 'USER',
        }),
      );
      (h.actionRuns.listByRun as jest.Mock).mockResolvedValue([
        actionRow({ status: 'SUCCEEDED' }),
        actionRow({ id: ACTION_2, actionIndex: 1, status: 'CANCELLED' }),
      ]);

      const view = await h.service.getRunStatusView(ORG_A, RUN_ID);
      expect(view.status).toBe('CANCELLED');
      expect(view.cancelReason).toBe('User request');
      expect(view.actionSummary.succeeded).toBe(1);
      expect(view.actionSummary.cancelled).toBe(1);
    });
  });

  describe('timeout classification', () => {
    it('retries timeout when attempts remain', () => {
      const classification = classifyActionError(new Error('timeout'), {
        attemptCount: 1,
        maxAttempts: 5,
        timedOut: true,
      });
      expect(resolveStatusFromClassification(classification)).toBe('FAILED_RETRYABLE');
    });

    it('permanent failure when timeout exhausts attempts', () => {
      const classification = classifyActionError(new Error('timeout'), {
        attemptCount: 5,
        maxAttempts: 5,
        timedOut: true,
      });
      expect(resolveStatusFromClassification(classification)).toBe('FAILED_PERMANENT');
    });

    it('treats provider unknown state as permanent without retry', () => {
      const classification = classifyActionError(
        new Error('submitted but unconfirmed by provider'),
        { attemptCount: 1, maxAttempts: 5 },
      );
      expect(classification.errorCategory).toBe('PROVIDER_UNCLEAR');
      expect(resolveStatusFromClassification(classification)).toBe('FAILED_PERMANENT');
    });
  });
});
