import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  buildWorkflowActionRunTransitionMatrix,
  buildWorkflowRunTransitionMatrix,
  assertWorkflowRunTransition,
  assertWorkflowActionRunTransition,
  listAllowedWorkflowRunTransitions,
  listAllowedWorkflowActionRunTransitions,
} from './workflow-runtime-status.transitions';
import {
  deriveWorkflowRunStatusFromActions,
  countSuccessfulActions,
  isTerminalWorkflowRunStatus,
  isTerminalWorkflowActionRunStatus,
} from './workflow-run-status.derivation';
import {
  buildWorkflowRunStatusFields,
  buildWorkflowActionRunStatusFields,
} from './workflow-runtime-status.util';
import {
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_ACTION_RUN_STATUSES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
} from './workflow-runtime-status.constants';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowActionRunRuntimeService } from './workflow-action-run-runtime.service';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';

describe('workflow-runtime-status transitions', () => {
  it('allows all documented run transitions', () => {
    const allowedPairs = [
      ['PENDING', 'RUNNING'],
      ['RUNNING', 'WAITING'],
      ['RUNNING', 'WAITING_FOR_APPROVAL'],
      ['RUNNING', 'COMPLETED'],
      ['RUNNING', 'PARTIALLY_COMPLETED'],
      ['RUNNING', 'FAILED'],
      ['WAITING', 'RUNNING'],
      ['WAITING_FOR_APPROVAL', 'RUNNING'],
    ] as const;

    for (const [from, to] of allowedPairs) {
      expect(assertWorkflowRunTransition(from, to)).toEqual({ allowed: true });
    }
  });

  it('forbids illegal run jumps', () => {
    expect(assertWorkflowRunTransition('PENDING', 'COMPLETED')).toMatchObject({
      allowed: false,
      code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.INVALID_TRANSITION,
    });
    expect(assertWorkflowRunTransition('COMPLETED', 'RUNNING')).toMatchObject({
      allowed: false,
      code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.TERMINAL_IMMUTABLE,
    });
    expect(assertWorkflowRunTransition('FAILED', 'PENDING')).toMatchObject({
      allowed: false,
      code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.TERMINAL_IMMUTABLE,
    });
  });

  it('allows all documented action transitions including retry', () => {
    const allowedPairs = [
      ['PENDING', 'RUNNING'],
      ['RUNNING', 'SUCCEEDED'],
      ['RUNNING', 'FAILED_RETRYABLE'],
      ['FAILED_RETRYABLE', 'RUNNING'],
      ['FAILED_RETRYABLE', 'FAILED_PERMANENT'],
      ['RUNNING', 'WAITING_FOR_APPROVAL'],
    ] as const;

    for (const [from, to] of allowedPairs) {
      expect(assertWorkflowActionRunTransition(from, to)).toEqual({ allowed: true });
    }
  });

  it('forbids illegal action jumps', () => {
    expect(assertWorkflowActionRunTransition('PENDING', 'SUCCEEDED')).toMatchObject({
      allowed: false,
    });
    expect(assertWorkflowActionRunTransition('SUCCEEDED', 'RUNNING')).toMatchObject({
      allowed: false,
      code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.TERMINAL_IMMUTABLE,
    });
  });

  it('documents full matrices without unexpected holes in terminal rows', () => {
    const runMatrix = buildWorkflowRunTransitionMatrix();
    for (const status of TERMINAL_WORKFLOW_RUN_STATUSES) {
      const outgoing = runMatrix.filter((row) => row.from === status && row.allowed);
      expect(outgoing).toHaveLength(0);
    }

    const actionMatrix = buildWorkflowActionRunTransitionMatrix();
    for (const status of TERMINAL_WORKFLOW_ACTION_RUN_STATUSES) {
      const outgoing = actionMatrix.filter((row) => row.from === status && row.allowed);
      expect(outgoing).toHaveLength(0);
    }
  });

  it('lists allowed transitions per status', () => {
    expect(listAllowedWorkflowRunTransitions('PENDING')).toEqual(
      expect.arrayContaining(['RUNNING', 'SKIPPED', 'CANCELLED']),
    );
    expect(listAllowedWorkflowActionRunTransitions('FAILED_RETRYABLE')).toEqual(
      expect.arrayContaining(['RUNNING', 'FAILED_PERMANENT']),
    );
  });
});

describe('workflow-run-status derivation', () => {
  it('derives RUNNING while actions are active', () => {
    expect(deriveWorkflowRunStatusFromActions(['RUNNING', 'PENDING'])).toBe('RUNNING');
    expect(deriveWorkflowRunStatusFromActions(['WAITING_FOR_APPROVAL', 'SUCCEEDED'])).toBe(
      'WAITING_FOR_APPROVAL',
    );
  });

  it('derives COMPLETED when all non-skipped actions succeeded', () => {
    expect(deriveWorkflowRunStatusFromActions(['SUCCEEDED', 'SKIPPED'])).toBe('COMPLETED');
    expect(countSuccessfulActions(['SUCCEEDED', 'SKIPPED'])).toBe(1);
  });

  it('derives PARTIALLY_COMPLETED only for mixed success and permanent failure', () => {
    expect(deriveWorkflowRunStatusFromActions(['SUCCEEDED', 'FAILED_PERMANENT'])).toBe(
      'PARTIALLY_COMPLETED',
    );
    expect(deriveWorkflowRunStatusFromActions(['SKIPPED', 'FAILED_PERMANENT'])).toBe('FAILED');
  });

  it('does not count SKIPPED as success', () => {
    expect(deriveWorkflowRunStatusFromActions(['SKIPPED', 'SKIPPED'])).toBe('SKIPPED');
    expect(deriveWorkflowRunStatusFromActions(['SKIPPED', 'FAILED_PERMANENT'])).toBe('FAILED');
  });

  it('derives FAILED when only permanent failures remain', () => {
    expect(deriveWorkflowRunStatusFromActions(['FAILED_PERMANENT', 'CANCELLED'])).toBe('FAILED');
  });
});

describe('workflow-runtime-status field rules', () => {
  const now = new Date('2026-07-26T10:00:00.000Z');

  it('sets finishedAt only for terminal run states', () => {
    const completed = buildWorkflowRunStatusFields('COMPLETED', { now });
    expect(completed.finishedAt).toEqual(now);
    expect(completed.waitingUntil).toBeNull();
    expect(completed.approvalId).toBeNull();

    const running = buildWorkflowRunStatusFields('RUNNING', { now });
    expect(running.finishedAt).toBeNull();
  });

  it('requires waitingUntil for WAITING and approvalId for WAITING_FOR_APPROVAL', () => {
    expect(() => buildWorkflowRunStatusFields('WAITING', { now })).toThrow(BadRequestException);
    expect(() =>
      buildWorkflowRunStatusFields('WAITING_FOR_APPROVAL', { now }),
    ).toThrow(BadRequestException);

    const waiting = buildWorkflowRunStatusFields('WAITING', {
      now,
      waitingUntil: new Date('2026-07-26T11:00:00.000Z'),
    });
    expect(waiting.waitingUntil).not.toBeNull();
    expect(waiting.approvalId).toBeNull();

    const approval = buildWorkflowRunStatusFields('WAITING_FOR_APPROVAL', {
      now,
      approvalId: 'approval-1',
    });
    expect(approval.approvalId).toBe('approval-1');
    expect(approval.waitingUntil).toBeNull();
  });

  it('increments attemptCount for FAILED_RETRYABLE and clears nextAttemptAt on RUNNING retry', () => {
    const failed = buildWorkflowActionRunStatusFields('RUNNING', 'FAILED_RETRYABLE', {
      attemptCount: 2,
      nextAttemptAt: new Date('2026-07-26T10:05:00.000Z'),
      now,
    });
    expect(failed.attemptCount).toBe(3);
    expect(failed.nextAttemptAt).not.toBeNull();

    const retry = buildWorkflowActionRunStatusFields('FAILED_RETRYABLE', 'RUNNING', {
      attemptCount: 3,
      now,
    });
    expect(retry.attemptCount).toBe(3);
    expect(retry.nextAttemptAt).toBeNull();
  });

  it('marks terminal action statuses with finishedAt', () => {
    const succeeded = buildWorkflowActionRunStatusFields('RUNNING', 'SUCCEEDED', { now });
    expect(succeeded.finishedAt).toEqual(now);
    expect(isTerminalWorkflowActionRunStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalWorkflowRunStatus('COMPLETED')).toBe(true);
  });
});

function makeRuntimePrisma() {
  const tx = {
    workflowRun: { updateMany: jest.fn() },
    workflowActionRun: { updateMany: jest.fn(), findMany: jest.fn() },
    workflowRuntimeStatusTransition: { create: jest.fn() },
  };

  return {
    workflowRun: { findFirst: jest.fn() },
    workflowActionRun: { findFirst: jest.fn(), findMany: jest.fn() },
    workflowRuntimeStatusTransition: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

describe('WorkflowRunRuntimeService', () => {
  let prisma: ReturnType<typeof makeRuntimePrisma>;
  let runRepo: WorkflowRunRuntimeRepository;
  let actionRepo: WorkflowActionRunRuntimeRepository;
  let audit: WorkflowRuntimeStatusAuditService;
  let runService: WorkflowRunRuntimeService;

  const runRow = {
    id: 'run-1',
    organizationId: 'org-1',
    status: 'RUNNING',
    lockVersion: 1,
    waitingUntil: null,
    approvalId: null,
    finishedAt: null,
  };

  beforeEach(() => {
    prisma = makeRuntimePrisma();
    runRepo = new WorkflowRunRuntimeRepository(prisma as never);
    actionRepo = new WorkflowActionRunRuntimeRepository(prisma as never);
    audit = new WorkflowRuntimeStatusAuditService(prisma as never);
    runService = new WorkflowRunRuntimeService(prisma as never, runRepo, actionRepo, audit);
  });

  it('transitions run with audit and finishedAt on terminal state', async () => {
    prisma.workflowRun.findFirst
      .mockResolvedValueOnce(runRow)
      .mockResolvedValueOnce({ ...runRow, status: 'COMPLETED', finishedAt: new Date(), lockVersion: 2 });
    prisma.__tx.workflowRun.updateMany.mockResolvedValue({ count: 1 });

    const result = await runService.transitionStatus('org-1', 'run-1', {
      toStatus: 'COMPLETED',
      expectedLockVersion: 1,
      actor: { type: 'SYSTEM', source: 'test' },
      reason: 'All actions done',
    });

    expect(result.status).toBe('COMPLETED');
    expect(prisma.__tx.workflowRuntimeStatusTransition.create).toHaveBeenCalled();
  });

  it('rejects concurrent run updates', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue({ ...runRow, lockVersion: 2 });

    await expect(
      runService.transitionStatus('org-1', 'run-1', {
        toStatus: 'COMPLETED',
        expectedLockVersion: 1,
        actor: { type: 'SYSTEM', source: 'test' },
      }),
    ).rejects.toMatchObject({
      response: { code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.LOCK_CONFLICT },
    });
  });

  it('rejects cross-tenant access', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue(null);

    await expect(runService.getRun('org-2', 'run-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('derives run status from action runs', async () => {
    prisma.workflowRun.findFirst
      .mockResolvedValueOnce(runRow)
      .mockResolvedValueOnce(runRow)
      .mockResolvedValueOnce({ ...runRow, status: 'PARTIALLY_COMPLETED', lockVersion: 2 });
    prisma.workflowActionRun.findMany.mockResolvedValue([
      { status: 'SUCCEEDED' },
      { status: 'FAILED_PERMANENT' },
    ]);
    prisma.__tx.workflowRun.updateMany.mockResolvedValue({ count: 1 });

    const result = await runService.deriveAndApplyRunStatus('org-1', 'run-1', {
      type: 'SYSTEM',
      source: 'derivation-test',
    });

    expect(result.status).toBe('PARTIALLY_COMPLETED');
  });
});

describe('WorkflowActionRunRuntimeService', () => {
  let prisma: ReturnType<typeof makeRuntimePrisma>;
  let runRepo: WorkflowRunRuntimeRepository;
  let actionRepo: WorkflowActionRunRuntimeRepository;
  let audit: WorkflowRuntimeStatusAuditService;
  let runService: WorkflowRunRuntimeService;
  let actionService: WorkflowActionRunRuntimeService;

  const actionRow = {
    id: 'action-1',
    organizationId: 'org-1',
    workflowRunId: 'run-1',
    status: 'RUNNING',
    lockVersion: 1,
    waitingUntil: null,
    approvalId: null,
    finishedAt: null,
    attemptCount: 0,
    nextAttemptAt: null,
  };

  const runRow = {
    id: 'run-1',
    organizationId: 'org-1',
    status: 'RUNNING',
    lockVersion: 1,
    waitingUntil: null,
    approvalId: null,
    finishedAt: null,
  };

  beforeEach(() => {
    prisma = makeRuntimePrisma();
    runRepo = new WorkflowRunRuntimeRepository(prisma as never);
    actionRepo = new WorkflowActionRunRuntimeRepository(prisma as never);
    audit = new WorkflowRuntimeStatusAuditService(prisma as never);
    runService = new WorkflowRunRuntimeService(prisma as never, runRepo, actionRepo, audit);
    actionService = new WorkflowActionRunRuntimeService(
      prisma as never,
      actionRepo,
      runRepo,
      runService,
      audit,
    );
  });

  it('transitions action run and increments retry counter', async () => {
    prisma.workflowActionRun.findFirst
      .mockResolvedValueOnce(actionRow)
      .mockResolvedValueOnce({
        ...actionRow,
        status: 'FAILED_RETRYABLE',
        attemptCount: 1,
        lockVersion: 2,
      });
    prisma.workflowRun.findFirst.mockResolvedValue(runRow);
    prisma.workflowActionRun.findMany.mockResolvedValue([{ status: 'FAILED_RETRYABLE' }]);
    prisma.__tx.workflowActionRun.updateMany.mockResolvedValue({ count: 1 });

    const result = await actionService.transitionStatus('org-1', 'action-1', {
      toStatus: 'FAILED_RETRYABLE',
      expectedLockVersion: 1,
      actor: { type: 'WORKER', source: 'executor' },
      nextAttemptAt: new Date('2026-07-26T10:10:00.000Z'),
    });

    expect(result.status).toBe('FAILED_RETRYABLE');
    expect(prisma.__tx.workflowActionRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attemptCount: 1 }),
      }),
    );
  });

  it('rejects terminal action mutation', async () => {
    prisma.workflowActionRun.findFirst.mockResolvedValue({
      ...actionRow,
      status: 'SUCCEEDED',
      finishedAt: new Date(),
    });

    await expect(
      actionService.transitionStatus('org-1', 'action-1', {
        toStatus: 'RUNNING',
        expectedLockVersion: 1,
        actor: { type: 'SYSTEM', source: 'test' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('detects concurrent action updates via updateMany count', async () => {
    prisma.workflowActionRun.findFirst.mockResolvedValue(actionRow);
    prisma.__tx.workflowActionRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      actionService.transitionStatus('org-1', 'action-1', {
        toStatus: 'SUCCEEDED',
        expectedLockVersion: 1,
        actor: { type: 'WORKER', source: 'executor' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('workflow runtime status coverage', () => {
  it('covers every required run status in the matrix', () => {
    for (const status of WORKFLOW_RUN_STATUSES) {
      expect(buildWorkflowRunTransitionMatrix().some((row) => row.from === status)).toBe(true);
    }
  });

  it('covers every required action status in the matrix', () => {
    for (const status of WORKFLOW_ACTION_RUN_STATUSES) {
      expect(buildWorkflowActionRunTransitionMatrix().some((row) => row.from === status)).toBe(
        true,
      );
    }
  });
});
