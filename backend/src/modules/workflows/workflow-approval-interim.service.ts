import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertApproverNotSelf,
  interimApprovalOutput,
  isApprovalExpired,
  WORKFLOW_APPROVAL_ERROR_CODES,
} from './workflow-approval-interim.util';

const APPROVER_ROLES = new Set(['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN']);

@Injectable()
export class WorkflowApprovalInterimService {
  constructor(private readonly prisma: PrismaService) {}

  async approveActionRun(
    orgId: string,
    actionRunId: string,
    user?: { id?: string; name?: string; email?: string; roles?: string[] },
    comment?: string,
  ) {
    this.assertApproverRole(user?.roles);

    const actionRun = await this.prisma.orgWorkflowActionRun.findFirst({
      where: { id: actionRunId, organizationId: orgId },
      include: {
        workflowRun: {
          include: {
            workflow: { select: { id: true, createdById: true, name: true } },
            approvals: { where: { actionRunId } },
          },
        },
      },
    });
    if (!actionRun) {
      throw new NotFoundException({
        message: 'Action run not found',
        code: WORKFLOW_APPROVAL_ERROR_CODES.NOT_FOUND,
      });
    }

    const approval = actionRun.workflowRun.approvals[0];
    if (!approval) {
      throw new NotFoundException({
        message: 'Approval record not found',
        code: WORKFLOW_APPROVAL_ERROR_CODES.NOT_FOUND,
      });
    }

    await this.guardPendingApproval(orgId, actionRun, approval);

    assertApproverNotSelf({
      approverUserId: user?.id,
      workflowCreatedById: actionRun.workflowRun.workflow.createdById,
      runPayload: actionRun.workflowRun.inputPayload as Record<string, unknown>,
    });

    const decidedAt = new Date();
    const approverName = user?.name || user?.email || 'Reviewer';

    await this.prisma.$transaction([
      this.prisma.orgWorkflowApproval.updateMany({
        where: {
          id: approval.id,
          organizationId: orgId,
          status: 'PENDING',
        },
        data: {
          status: 'APPROVED_PENDING_EXECUTION',
          approvedByUserId: user?.id ?? null,
          decidedByName: approverName,
          reason: comment?.trim() || approval.reason,
          decidedAt,
        },
      }),
      this.prisma.orgWorkflowActionRun.updateMany({
        where: {
          id: actionRunId,
          organizationId: orgId,
          status: 'WAITING_APPROVAL',
        },
        data: {
          status: 'APPROVED_PENDING_EXECUTION',
          approvedByUserId: user?.id ?? null,
          approvedAt: decidedAt,
          output: interimApprovalOutput(comment),
          errorMessage: null,
          finishedAt: null,
        },
      }),
      this.prisma.orgWorkflowRun.updateMany({
        where: { id: actionRun.workflowRunId, organizationId: orgId },
        data: {
          status: 'WAITING_APPROVAL',
          errorMessage:
            'Approval recorded — automatic resume pending (Phase 5). Run remains waiting.',
          finishedAt: null,
        },
      }),
    ]);

    return this.getRun(orgId, actionRun.workflowRunId);
  }

  async rejectActionRun(
    orgId: string,
    actionRunId: string,
    user?: { id?: string; name?: string; email?: string; roles?: string[] },
    reason?: string,
  ) {
    this.assertApproverRole(user?.roles);

    const actionRun = await this.prisma.orgWorkflowActionRun.findFirst({
      where: { id: actionRunId, organizationId: orgId },
      include: {
        workflowRun: {
          include: {
            approvals: { where: { actionRunId } },
          },
        },
      },
    });
    if (!actionRun) {
      throw new NotFoundException({
        message: 'Action run not found',
        code: WORKFLOW_APPROVAL_ERROR_CODES.NOT_FOUND,
      });
    }

    const approval = actionRun.workflowRun.approvals[0];
    if (!approval) {
      throw new NotFoundException({
        message: 'Approval record not found',
        code: WORKFLOW_APPROVAL_ERROR_CODES.NOT_FOUND,
      });
    }

    await this.guardPendingApproval(orgId, actionRun, approval);

    const decidedAt = new Date();
    const rejectionReason = reason?.trim() || 'Rejected by reviewer';
    const approverName = user?.name || user?.email || 'Reviewer';

    await this.prisma.$transaction([
      this.prisma.orgWorkflowApproval.updateMany({
        where: {
          id: approval.id,
          organizationId: orgId,
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
          approvedByUserId: user?.id ?? null,
          decidedByName: approverName,
          reason: rejectionReason,
          decidedAt,
        },
      }),
      this.prisma.orgWorkflowActionRun.updateMany({
        where: { id: actionRunId, organizationId: orgId },
        data: {
          status: 'FAILED',
          errorMessage: rejectionReason,
          finishedAt: decidedAt,
        },
      }),
      this.prisma.orgWorkflowRun.updateMany({
        where: { id: actionRun.workflowRunId, organizationId: orgId },
        data: {
          status: 'FAILED',
          errorMessage: rejectionReason,
          finishedAt: decidedAt,
        },
      }),
    ]);

    return this.getRun(orgId, actionRun.workflowRunId);
  }

  private async guardPendingApproval(
    orgId: string,
    actionRun: { id: string; status: string; organizationId: string; workflowRunId: string },
    approval: {
      id: string;
      status: string;
      expiresAt: Date | null;
      organizationId: string;
    },
  ) {
    if (actionRun.organizationId !== orgId || approval.organizationId !== orgId) {
      throw new ForbiddenException({
        message: 'Approval belongs to another organization',
        code: WORKFLOW_APPROVAL_ERROR_CODES.FOREIGN_TENANT,
      });
    }

    if (approval.status !== 'PENDING' || actionRun.status !== 'WAITING_APPROVAL') {
      if (
        approval.status === 'APPROVED_PENDING_EXECUTION' ||
        actionRun.status === 'APPROVED_PENDING_EXECUTION'
      ) {
        throw new BadRequestException({
          message: 'Approval was already decided',
          code: WORKFLOW_APPROVAL_ERROR_CODES.ALREADY_DECIDED,
        });
      }
      if (approval.status === 'REJECTED' || approval.status === 'EXPIRED') {
        throw new BadRequestException({
          message: `Approval is ${approval.status.toLowerCase()}`,
          code: WORKFLOW_APPROVAL_ERROR_CODES.ALREADY_DECIDED,
        });
      }
      throw new BadRequestException({
        message: 'Action run is not waiting for approval',
        code: WORKFLOW_APPROVAL_ERROR_CODES.NOT_PENDING,
      });
    }

    if (isApprovalExpired(approval.expiresAt)) {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.orgWorkflowApproval.updateMany({
          where: { id: approval.id, organizationId: orgId, status: 'PENDING' },
          data: { status: 'EXPIRED', decidedAt: now },
        }),
        this.prisma.orgWorkflowActionRun.updateMany({
          where: { id: actionRun.id, organizationId: orgId, status: 'WAITING_APPROVAL' },
          data: {
            status: 'FAILED',
            errorMessage: 'Approval expired before decision',
            finishedAt: now,
          },
        }),
        this.prisma.orgWorkflowRun.updateMany({
          where: { id: actionRun.workflowRunId, organizationId: orgId },
          data: {
            status: 'FAILED',
            errorMessage: 'Approval expired before decision',
            finishedAt: now,
          },
        }),
      ]);
      throw new BadRequestException({
        message: 'Approval has expired',
        code: WORKFLOW_APPROVAL_ERROR_CODES.EXPIRED,
      });
    }
  }

  private assertApproverRole(roles?: string[]) {
    if (!roles?.length) return;
    if (!roles.some((role) => APPROVER_ROLES.has(role))) {
      throw new ForbiddenException({
        message: 'Insufficient permission to decide workflow approvals',
        code: WORKFLOW_APPROVAL_ERROR_CODES.INSUFFICIENT_PERMISSION,
      });
    }
  }

  private async getRun(orgId: string, runId: string) {
    const run = await this.prisma.orgWorkflowRun.findFirst({
      where: { id: runId, organizationId: orgId },
      include: {
        actionRuns: { orderBy: { actionIndex: 'asc' } },
        approvals: true,
        workflow: { select: { id: true, name: true, version: true } },
      },
    });
    if (!run) throw new NotFoundException('Workflow run not found');
    return run;
  }
}
