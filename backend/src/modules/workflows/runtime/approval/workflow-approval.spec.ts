import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowApprovalResumeService } from './workflow-approval-resume.service';
import { WorkflowApprovalRepository } from './workflow-approval.repository';
import { WorkflowApprovalPreExecutionValidator } from './workflow-approval-pre-execution.validator';
import { WorkflowApprovalLegacyBridgeService } from './workflow-approval-legacy.bridge';
import { WORKFLOW_APPROVAL_ERROR_CODES } from './workflow-approval.types';
import { assertWorkflowActionRunTransition } from '../workflow-runtime-status.transitions';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_A = 'user-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'user-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const APPROVAL_ID = 'approval-0001';
const RUN_ID = 'run-0001';
const ACTION_ID = 'action-0001';
const VERSION_ID = 'ver-0001';

function approvalRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: APPROVAL_ID,
    organizationId: ORG_A,
    workflowRunId: RUN_ID,
    workflowVersionId: VERSION_ID,
    actionRunId: ACTION_ID,
    status: 'PENDING',
    requestedBySystem: false,
    requestedByUserId: USER_A,
    makerCheckerRequired: true,
    rejectionStrategy: 'CANCEL_RUN',
    expiresAt: new Date(now.getTime() + 3600000),
    decidedAt: null,
    createdAt: now,
    actionRun: {
      id: ACTION_ID,
      actionType: 'task.create',
      actionIndex: 0,
      status: 'WAITING_FOR_APPROVAL',
      lockVersion: 3,
    },
    workflowRun: {
      id: RUN_ID,
      lockVersion: 2,
      eventType: 'booking.returned',
      entityType: 'booking',
      entityId: 'booking-1',
      definitionSnapshot: {
        actions: [{ actionType: 'task.create', actionIndex: 0 }],
      },
    },
    comments: [],
    ...overrides,
  };
}

describe('WorkflowApprovalPauseResume', () => {
  describe('transition guards', () => {
    it('allows WAITING_FOR_APPROVAL → RUNNING for resume', () => {
      expect(assertWorkflowActionRunTransition('WAITING_FOR_APPROVAL', 'RUNNING').allowed).toBe(true);
    });

    it('allows WAITING_FOR_APPROVAL → SKIPPED for rejection skip', () => {
      expect(assertWorkflowActionRunTransition('WAITING_FOR_APPROVAL', 'SKIPPED').allowed).toBe(true);
    });
  });

  describe('WorkflowApprovalResumeService', () => {
    function createHarness() {
      const prisma = { $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})) };
      const approvals = {
        findByIdOrThrow: jest.fn(),
        listPending: jest.fn(),
        decide: jest.fn().mockResolvedValue(1),
        addComment: jest.fn(),
        listExpiredPending: jest.fn(),
      } as unknown as WorkflowApprovalRepository;

      const preExecution = {
        validate: jest.fn().mockResolvedValue({
          passed: true,
          checks: [{ code: 'WORKFLOW_VERSION_VALID', passed: true, message: 'ok' }],
        }),
      } as unknown as WorkflowApprovalPreExecutionValidator;

      const actionRunRuntime = {
        getActionRun: jest.fn(),
        transitionStatus: jest.fn().mockResolvedValue({}),
      };

      const runRuntime = {
        transitionStatus: jest.fn().mockResolvedValue({}),
        deriveAndApplyRunStatus: jest.fn().mockResolvedValue({}),
      };

      const actionExecutor = {
        executeClaimed: jest.fn().mockResolvedValue({ status: 'SUCCEEDED', resultSummary: { taskId: 't-1' } }),
      };

      const worker = {
        processRun: jest.fn().mockResolvedValue({ processed: true }),
      };

      const service = new WorkflowApprovalResumeService(
        prisma as never,
        approvals,
        preExecution,
        actionRunRuntime as never,
        runRuntime as never,
        actionExecutor as never,
        worker as never,
      );

      return {
        service,
        approvals,
        preExecution,
        actionRunRuntime,
        runRuntime,
        actionExecutor,
        worker,
      };
    }

    it('approves and resumes exact action execution', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(approvalRow());
      (h.actionRunRuntime.getActionRun as jest.Mock).mockResolvedValue({
        id: ACTION_ID,
        status: 'WAITING_FOR_APPROVAL',
        lockVersion: 3,
      });

      const result = await h.service.approve({
        organizationId: ORG_A,
        approvalId: APPROVAL_ID,
        userId: USER_B,
        comment: 'Looks good',
      });

      expect(result.execution.status).toBe('SUCCEEDED');
      expect(h.actionExecutor.executeClaimed).toHaveBeenCalledWith(
        ORG_A,
        ACTION_ID,
        expect.objectContaining({ type: 'USER' }),
        { resumedAfterApproval: true },
      );
      expect(h.worker.processRun).toHaveBeenCalledWith(ORG_A, RUN_ID);
    });

    it('rejects with CANCEL_RUN strategy', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(approvalRow());
      (h.actionRunRuntime.getActionRun as jest.Mock).mockResolvedValue({
        id: ACTION_ID,
        status: 'WAITING_FOR_APPROVAL',
        lockVersion: 3,
      });

      await h.service.reject({
        organizationId: ORG_A,
        approvalId: APPROVAL_ID,
        userId: USER_B,
        reason: 'Not allowed',
      });

      expect(h.runRuntime.transitionStatus).toHaveBeenCalledWith(
        ORG_A,
        RUN_ID,
        expect.objectContaining({ toStatus: 'CANCELLED' }),
      );
    });

    it('rejects with SKIP_ACTION strategy and continues run', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(
        approvalRow({ rejectionStrategy: 'SKIP_ACTION' }),
      );
      (h.actionRunRuntime.getActionRun as jest.Mock).mockResolvedValue({
        id: ACTION_ID,
        status: 'WAITING_FOR_APPROVAL',
        lockVersion: 3,
      });

      await h.service.reject({
        organizationId: ORG_A,
        approvalId: APPROVAL_ID,
        userId: USER_B,
      });

      expect(h.actionRunRuntime.transitionStatus).toHaveBeenCalledWith(
        ORG_A,
        ACTION_ID,
        expect.objectContaining({ toStatus: 'SKIPPED' }),
      );
      expect(h.worker.processRun).toHaveBeenCalledWith(ORG_A, RUN_ID);
    });

    it('blocks expired approval', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(
        approvalRow({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        h.service.approve({
          organizationId: ORG_A,
          approvalId: APPROVAL_ID,
          userId: USER_B,
        }),
      ).rejects.toMatchObject({
        response: { code: WORKFLOW_APPROVAL_ERROR_CODES.EXPIRED },
      });
    });

    it('blocks duplicate decision', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(
        approvalRow({ status: 'APPROVED' }),
      );

      await expect(
        h.service.approve({
          organizationId: ORG_A,
          approvalId: APPROVAL_ID,
          userId: USER_B,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('enforces maker-checker — requester cannot approve', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(approvalRow());

      await expect(
        h.service.approve({
          organizationId: ORG_A,
          approvalId: APPROVAL_ID,
          userId: USER_A,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks cross-tenant access', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(
        approvalRow({ organizationId: ORG_B }),
      );

      await expect(
        h.service.approve({
          organizationId: ORG_A,
          approvalId: APPROVAL_ID,
          userId: USER_B,
        }),
      ).rejects.toMatchObject({
        response: { code: WORKFLOW_APPROVAL_ERROR_CODES.TENANT_VIOLATION },
      });
    });

    it('fails when pre-execution policy not fulfilled', async () => {
      const h = createHarness();
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(approvalRow());
      (h.preExecution.validate as jest.Mock).mockResolvedValue({
        passed: false,
        checks: [{ code: 'ENTITY_PRESENT', passed: false, message: 'Entity gone' }],
      });

      await expect(
        h.service.approve({
          organizationId: ORG_A,
          approvalId: APPROVAL_ID,
          userId: USER_B,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('expires pending approvals in batch', async () => {
      const h = createHarness();
      (h.approvals.listExpiredPending as jest.Mock).mockResolvedValue([
        { id: APPROVAL_ID, organizationId: ORG_A },
      ]);
      (h.approvals.findByIdOrThrow as jest.Mock).mockResolvedValue(
        approvalRow({ expiresAt: new Date(Date.now() - 1000) }),
      );
      (h.actionRunRuntime.getActionRun as jest.Mock).mockResolvedValue({
        id: ACTION_ID,
        status: 'WAITING_FOR_APPROVAL',
        lockVersion: 3,
      });

      const count = await h.service.processExpiredBatch();
      expect(count).toBe(1);
    });

    it('lists pending approvals without sensitive payload', async () => {
      const h = createHarness();
      (h.approvals.listPending as jest.Mock).mockResolvedValue([
        {
          ...approvalRow(),
          actionRun: { actionType: 'task.create', actionIndex: 0 },
          workflowRun: { eventType: 'booking.returned', entityType: 'booking', entityId: 'b-1' },
        },
      ]);

      const list = await h.service.listPendingSafe(ORG_A);
      expect(list[0].actionType).toBe('task.create');
      expect(list[0]).not.toHaveProperty('inputPayload');
    });
  });

  describe('WorkflowApprovalLegacyBridgeService', () => {
    it('marks legacy-only approvals', async () => {
      const prisma = {
        orgWorkflowApproval: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'legacy-1',
            organizationId: ORG_A,
            status: 'PENDING',
          }),
        },
        workflowApproval: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const bridge = new WorkflowApprovalLegacyBridgeService(prisma as never);
      const result = await bridge.bridgeLegacyApproval(ORG_A, 'legacy-1');
      expect(result.status).toBe('LEGACY_ONLY');
    });
  });
});
