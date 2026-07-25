import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowApprovalRejectionStrategy } from '@prisma/client';
import { WorkflowApprovalRepository } from './workflow-approval.repository';
import { WorkflowActionRunRuntimeService } from '../workflow-action-run-runtime.service';
import { WorkflowRunRuntimeService } from '../workflow-run-runtime.service';
import { WorkflowApprovalNotificationPrepareService } from './workflow-approval-notification.prepare.service';

export interface RequestApprovalInput {
  organizationId: string;
  workflowRunId: string;
  workflowVersionId: string;
  actionRunId: string;
  actionRunLockVersion: number;
  requestedByUserId?: string | null;
  rejectionStrategy?: WorkflowApprovalRejectionStrategy;
  makerCheckerRequired?: boolean;
  reason?: string;
  policyTtlHours?: number;
}

@Injectable()
export class WorkflowApprovalPauseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly approvals: WorkflowApprovalRepository,
    private readonly actionRunRuntime: WorkflowActionRunRuntimeService,
    private readonly runRuntime: WorkflowRunRuntimeService,
    private readonly notificationPrepare: WorkflowApprovalNotificationPrepareService,
  ) {}

  async requestApproval(input: RequestApprovalInput) {
    const ttlHours = input.policyTtlHours ?? this.config.get<number>('workflowRuntime.approvalTtlHours', 72);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const approval = await this.prisma.$transaction(async (tx) => {
      const created = await this.approvals.create(tx, {
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId,
        workflowVersionId: input.workflowVersionId,
        actionRunId: input.actionRunId,
        expiresAt,
        requestedByUserId: input.requestedByUserId,
        makerCheckerRequired: input.makerCheckerRequired ?? true,
        rejectionStrategy: input.rejectionStrategy ?? 'CANCEL_RUN',
        reason: input.reason ?? `Approval required`,
      });

      await this.actionRunRuntime.transitionStatus(input.organizationId, input.actionRunId, {
        toStatus: 'WAITING_FOR_APPROVAL',
        expectedLockVersion: input.actionRunLockVersion,
        approvalId: created.id,
        actor: { type: 'SYSTEM', source: 'approval.pause' },
        reason: 'Awaiting human approval',
      });

      return created;
    });

    const run = await this.runRuntime.deriveAndApplyRunStatus(
      input.organizationId,
      input.workflowRunId,
      { type: 'SYSTEM', source: 'approval.pause' },
      'Run paused for approval',
    );

    await this.notificationPrepare.prepareApproverNotification({
      organizationId: input.organizationId,
      approvalId: approval.id,
      workflowRunId: input.workflowRunId,
      actionRunId: input.actionRunId,
    });

    return { approval, run };
  }

  async finalizeExecutionApproval(input: {
    organizationId: string;
    workflowRunId: string;
    workflowVersionId: string;
    actionRunId: string;
    requestedByUserId?: string | null;
    rejectionStrategy?: 'CANCEL_RUN' | 'SKIP_ACTION' | 'EXECUTE_FALLBACK';
    makerCheckerRequired?: boolean;
    reason?: string;
    policyTtlHours?: number;
  }) {
    const ttlHours = input.policyTtlHours ?? this.config.get<number>('workflowRuntime.approvalTtlHours', 72);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const approval = await this.approvals.create(this.prisma, {
      organizationId: input.organizationId,
      workflowRunId: input.workflowRunId,
      workflowVersionId: input.workflowVersionId,
      actionRunId: input.actionRunId,
      expiresAt,
      requestedByUserId: input.requestedByUserId,
      makerCheckerRequired: input.makerCheckerRequired ?? true,
      rejectionStrategy: input.rejectionStrategy ?? 'CANCEL_RUN',
      reason: input.reason ?? 'Approval required before execution',
    });

    await this.prisma.workflowActionRun.updateMany({
      where: { id: input.actionRunId, organizationId: input.organizationId },
      data: { approvalId: approval.id },
    });

    await this.prisma.workflowRun.updateMany({
      where: { id: input.workflowRunId, organizationId: input.organizationId },
      data: { approvalId: approval.id },
    });

    await this.runRuntime.deriveAndApplyRunStatus(
      input.organizationId,
      input.workflowRunId,
      { type: 'SYSTEM', source: 'approval.pause' },
      'Run paused for approval',
    );

    await this.notificationPrepare.prepareApproverNotification({
      organizationId: input.organizationId,
      approvalId: approval.id,
      workflowRunId: input.workflowRunId,
      actionRunId: input.actionRunId,
    });

    return approval;
  }
}
