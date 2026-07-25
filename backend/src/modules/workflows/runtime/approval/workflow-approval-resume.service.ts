import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowApprovalRejectionStrategy } from '@prisma/client';
import { WorkflowApprovalRepository } from './workflow-approval.repository';
import { WorkflowApprovalPreExecutionValidator } from './workflow-approval-pre-execution.validator';
import { WorkflowActionRunRuntimeService } from '../workflow-action-run-runtime.service';
import { WorkflowRunRuntimeService } from '../workflow-run-runtime.service';
import { WorkflowActionRunExecutorService } from '../workflow-action-run-executor.service';
import { WorkflowRunWorkerService } from '../workflow-run-worker.service';
import {
  WORKFLOW_APPROVAL_ERROR_CODES,
  type WorkflowApprovalDecisionInput,
  type WorkflowApprovalSafeListItem,
} from './workflow-approval.types';

@Injectable()
export class WorkflowApprovalResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: WorkflowApprovalRepository,
    private readonly preExecution: WorkflowApprovalPreExecutionValidator,
    private readonly actionRunRuntime: WorkflowActionRunRuntimeService,
    private readonly runRuntime: WorkflowRunRuntimeService,
    private readonly actionExecutor: WorkflowActionRunExecutorService,
    @Inject(forwardRef(() => WorkflowRunWorkerService))
    private readonly worker: WorkflowRunWorkerService,
  ) {}

  async listPendingSafe(orgId: string, limit = 50): Promise<WorkflowApprovalSafeListItem[]> {
    const rows = await this.approvals.listPending(orgId, limit);
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      workflowRunId: row.workflowRunId,
      workflowVersionId: row.workflowVersionId,
      actionRunId: row.actionRunId,
      status: row.status,
      actionType: row.actionRun.actionType,
      actionIndex: row.actionRun.actionIndex,
      eventType: row.workflowRun.eventType,
      entityType: row.workflowRun.entityType,
      entityId: row.workflowRun.entityId,
      requestedBySystem: row.requestedBySystem,
      requestedByUserId: row.requestedByUserId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      rejectionStrategy: row.rejectionStrategy,
    }));
  }

  async approve(input: WorkflowApprovalDecisionInput) {
    const approval = await this.loadAndGuardDecision(input);

    const preCheck = await this.preExecution.validate({
      organizationId: input.organizationId,
      workflowRunId: approval.workflowRunId,
      workflowVersionId: approval.workflowVersionId,
      actionRunId: approval.actionRunId,
      actionType: approval.actionRun.actionType,
      entityType: approval.workflowRun.entityType,
      entityId: approval.workflowRun.entityId,
      definitionSnapshot: approval.workflowRun.definitionSnapshot,
    });

    if (!preCheck.passed) {
      throw new BadRequestException({
        message: 'Pre-execution policy checks failed after approval',
        code: WORKFLOW_APPROVAL_ERROR_CODES.PRE_EXECUTION_FAILED,
        checks: preCheck.checks,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const count = await this.approvals.decide(tx, {
        orgId: input.organizationId,
        approvalId: approval.id,
        fromStatus: 'PENDING',
        toStatus: 'APPROVED_PENDING_EXECUTION',
        approvedByUserId: input.userId,
        decidedByName: input.userName,
        reason: input.reason,
      });
      if (count === 0) {
        throw new ConflictException({
          message: 'Approval was already decided',
          code: WORKFLOW_APPROVAL_ERROR_CODES.ALREADY_DECIDED,
        });
      }
      if (input.comment?.trim()) {
        await this.approvals.addComment(tx, {
          organizationId: input.organizationId,
          approvalId: approval.id,
          userId: input.userId,
          userName: input.userName,
          comment: input.comment.trim(),
        });
      }
    });

    const actionRun = await this.actionRunRuntime.getActionRun(
      input.organizationId,
      approval.actionRunId,
    );
    if (actionRun.status !== 'WAITING_FOR_APPROVAL') {
      throw new BadRequestException({
        message: 'Action run is not waiting for approval',
        code: WORKFLOW_APPROVAL_ERROR_CODES.ACTION_NOT_WAITING,
      });
    }

    await this.actionRunRuntime.transitionStatus(input.organizationId, approval.actionRunId, {
      toStatus: 'RUNNING',
      expectedLockVersion: actionRun.lockVersion,
      approvalId: null,
      actor: { type: 'USER', id: input.userId, source: 'approval.resume' },
      reason: 'Resuming after approval — execution not yet complete',
    });

    await this.runRuntime.transitionStatus(input.organizationId, approval.workflowRunId, {
      toStatus: 'RUNNING',
      expectedLockVersion: approval.workflowRun.lockVersion,
      approvalId: null,
      actor: { type: 'USER', id: input.userId, source: 'approval.resume' },
      reason: 'Run resumed after approval',
    });

    const execution = await this.actionExecutor.executeClaimed(
      input.organizationId,
      approval.actionRunId,
      { type: 'USER', id: input.userId, source: 'approval.resume.execute' },
      { resumedAfterApproval: true },
    );

    await this.approvals.decide(
      this.prisma,
      {
        orgId: input.organizationId,
        approvalId: approval.id,
        fromStatus: 'APPROVED_PENDING_EXECUTION',
        toStatus: 'APPROVED',
        approvedByUserId: input.userId,
        decidedByName: input.userName,
        reason: 'Execution completed after approval',
      },
    );

    await this.worker.processRun(input.organizationId, approval.workflowRunId);

    return { approvalId: approval.id, execution };
  }

  async reject(input: WorkflowApprovalDecisionInput) {
    const approval = await this.loadAndGuardDecision(input);
    const strategy = approval.rejectionStrategy;

    await this.prisma.$transaction(async (tx) => {
      const count = await this.approvals.decide(tx, {
        orgId: input.organizationId,
        approvalId: approval.id,
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        approvedByUserId: input.userId,
        decidedByName: input.userName,
        reason: input.reason ?? 'Rejected by approver',
      });
      if (count === 0) {
        throw new ConflictException({
          message: 'Approval was already decided',
          code: WORKFLOW_APPROVAL_ERROR_CODES.ALREADY_DECIDED,
        });
      }
      if (input.comment?.trim()) {
        await this.approvals.addComment(tx, {
          organizationId: input.organizationId,
          approvalId: approval.id,
          userId: input.userId,
          userName: input.userName,
          comment: input.comment.trim(),
        });
      }
    });

    await this.applyRejectionStrategy(input.organizationId, approval, strategy, input);

    return { approvalId: approval.id, strategy };
  }

  async expirePending(orgId: string, approvalId: string) {
    const approval = await this.approvals.findByIdOrThrow(orgId, approvalId);
    if (approval.status !== 'PENDING') return { expired: false };
    if (!approval.expiresAt || approval.expiresAt > new Date()) {
      return { expired: false };
    }

    await this.approvals.decide(this.prisma, {
      orgId,
      approvalId,
      fromStatus: 'PENDING',
      toStatus: 'EXPIRED',
      approvedByUserId: 'system',
      reason: 'Approval expired',
    });

    await this.applyRejectionStrategy(orgId, approval, approval.rejectionStrategy, {
      userId: 'system',
      reason: 'Approval expired',
    });

    return { expired: true };
  }

  async processExpiredBatch(limit = 50) {
    const batch = await this.approvals.listExpiredPending(new Date(), limit);
    let expired = 0;
    for (const row of batch) {
      const result = await this.expirePending(row.organizationId, row.id);
      if (result.expired) expired += 1;
    }
    return expired;
  }

  private async applyRejectionStrategy(
    orgId: string,
    approval: Awaited<ReturnType<WorkflowApprovalRepository['findByIdOrThrow']>>,
    strategy: WorkflowApprovalRejectionStrategy,
    input: Pick<WorkflowApprovalDecisionInput, 'userId' | 'reason'>,
  ) {
    const actionRun = await this.actionRunRuntime.getActionRun(orgId, approval.actionRunId);

    if (strategy === 'SKIP_ACTION') {
      await this.actionRunRuntime.transitionStatus(orgId, approval.actionRunId, {
        toStatus: 'SKIPPED',
        expectedLockVersion: actionRun.lockVersion,
        approvalId: null,
        actor: { type: 'USER', id: input.userId, source: 'approval.reject.skip' },
        reason: input.reason ?? 'Action skipped after rejection',
      });
      await this.runRuntime.deriveAndApplyRunStatus(
        orgId,
        approval.workflowRunId,
        { type: 'USER', id: input.userId, source: 'approval.reject.skip' },
        'Continue after skipped action',
      );
      await this.worker.processRun(orgId, approval.workflowRunId);
      return;
    }

    if (strategy === 'EXECUTE_FALLBACK') {
      await this.actionRunRuntime.transitionStatus(orgId, approval.actionRunId, {
        toStatus: 'SKIPPED',
        expectedLockVersion: actionRun.lockVersion,
        approvalId: null,
        actor: { type: 'USER', id: input.userId, source: 'approval.reject.fallback' },
        reason: 'Fallback path — action skipped pending fallback executor',
      });
      await this.runRuntime.deriveAndApplyRunStatus(
        orgId,
        approval.workflowRunId,
        { type: 'USER', id: input.userId, source: 'approval.reject.fallback' },
        'Fallback after rejection',
      );
      return;
    }

    await this.actionRunRuntime.transitionStatus(orgId, approval.actionRunId, {
      toStatus: 'CANCELLED',
      expectedLockVersion: actionRun.lockVersion,
      approvalId: null,
      actor: { type: 'USER', id: input.userId, source: 'approval.reject.cancel' },
      reason: input.reason ?? 'Workflow cancelled after rejection',
    });
    await this.runRuntime.transitionStatus(orgId, approval.workflowRunId, {
      toStatus: 'CANCELLED',
      expectedLockVersion: approval.workflowRun.lockVersion,
      approvalId: null,
      actor: { type: 'USER', id: input.userId, source: 'approval.reject.cancel' },
      reason: input.reason ?? 'Workflow cancelled after rejection',
    });
  }

  private async loadAndGuardDecision(input: WorkflowApprovalDecisionInput) {
    const approval = await this.approvals.findByIdOrThrow(input.organizationId, input.approvalId);

    if (approval.organizationId !== input.organizationId) {
      throw new NotFoundException({
        message: 'Cross-tenant approval access denied',
        code: WORKFLOW_APPROVAL_ERROR_CODES.TENANT_VIOLATION,
      });
    }

    if (approval.status !== 'PENDING') {
      throw new ConflictException({
        message: 'Approval is not pending',
        code: WORKFLOW_APPROVAL_ERROR_CODES.ALREADY_DECIDED,
      });
    }

    if (approval.expiresAt && approval.expiresAt <= new Date()) {
      throw new BadRequestException({
        message: 'Approval has expired',
        code: WORKFLOW_APPROVAL_ERROR_CODES.EXPIRED,
      });
    }

    if (
      approval.makerCheckerRequired &&
      approval.requestedByUserId &&
      approval.requestedByUserId === input.userId
    ) {
      throw new ForbiddenException({
        message: 'Maker-checker policy: requester cannot approve own action',
        code: WORKFLOW_APPROVAL_ERROR_CODES.MAKER_CHECKER_VIOLATION,
      });
    }

    return approval;
  }
}
