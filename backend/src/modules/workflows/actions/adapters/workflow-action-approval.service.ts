import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import { WorkflowActionAuditService } from './workflow-action-audit.service';

export interface RequestWorkflowApprovalInput {
  ctx: WorkflowActionExecutionContext;
  actionType: string;
  message?: string;
  approverRoleScope?: string;
}

/**
 * Single approval gate for workflow actions — idempotent per actionRunId.
 * Durable pause/resume runtime will delegate here when merged.
 */
@Injectable()
export class WorkflowActionApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: WorkflowActionAuditService,
  ) {}

  async requestApproval(input: RequestWorkflowApprovalInput): Promise<{
    approvalId: string;
    created: boolean;
    auditId: string;
  }> {
    const existing = await this.prisma.orgWorkflowApproval.findFirst({
      where: {
        organizationId: input.ctx.organizationId,
        actionRunId: input.ctx.actionRunId,
        status: 'PENDING',
      },
    });
    if (existing) {
      const audit = this.audit.record(
        input.ctx,
        input.actionType,
        'duplicate',
        'Approval already pending for action run',
        { approvalId: existing.id },
      );
      return { approvalId: existing.id, created: false, auditId: audit.auditId };
    }

    const approval = await this.prisma.orgWorkflowApproval.create({
      data: {
        organizationId: input.ctx.organizationId,
        workflowRunId: input.ctx.workflowRunId,
        actionRunId: input.ctx.actionRunId,
        status: 'PENDING',
        requestedBySystem: true,
        reason:
          input.message?.trim()
          || `Workflow approval requested (${input.actionType})`,
      },
    });

    const audit = this.audit.record(
      input.ctx,
      input.actionType,
      'execute',
      'Approval gate created — run paused until decision',
      {
        approvalId: approval.id,
        approverRoleScope: input.approverRoleScope ?? null,
      },
    );

    return { approvalId: approval.id, created: true, auditId: audit.auditId };
  }

  async hasPendingApproval(ctx: WorkflowActionExecutionContext): Promise<boolean> {
    const row = await this.prisma.orgWorkflowApproval.findFirst({
      where: {
        organizationId: ctx.organizationId,
        actionRunId: ctx.actionRunId,
        status: 'PENDING',
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async isApprovedForActionRun(ctx: WorkflowActionExecutionContext): Promise<boolean> {
    const row = await this.prisma.orgWorkflowApproval.findFirst({
      where: {
        organizationId: ctx.organizationId,
        actionRunId: ctx.actionRunId,
        status: 'APPROVED',
      },
      select: { id: true },
    });
    return Boolean(row);
  }
}
