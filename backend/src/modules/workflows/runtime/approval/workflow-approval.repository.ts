import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkflowRuntimeApprovalStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WORKFLOW_APPROVAL_ERROR_CODES } from './workflow-approval.types';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkflowApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(orgId: string, approvalId: string, tx: Tx = this.prisma) {
    return tx.workflowApproval.findFirst({
      where: { id: approvalId, organizationId: orgId },
      include: {
        actionRun: true,
        workflowRun: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  findByIdOrThrow(orgId: string, approvalId: string, tx: Tx = this.prisma) {
    return this.findById(orgId, approvalId, tx).then((row) => {
      if (!row) {
        throw new NotFoundException({
          message: 'Workflow approval not found',
          code: WORKFLOW_APPROVAL_ERROR_CODES.NOT_FOUND,
        });
      }
      return row;
    });
  }

  findPendingByActionRun(orgId: string, actionRunId: string) {
    return this.prisma.workflowApproval.findFirst({
      where: {
        organizationId: orgId,
        actionRunId,
        status: 'PENDING',
      },
    });
  }

  listPending(orgId: string, limit = 50) {
    return this.prisma.workflowApproval.findMany({
      where: { organizationId: orgId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        actionRun: {
          select: {
            actionType: true,
            actionIndex: true,
          },
        },
        workflowRun: {
          select: {
            eventType: true,
            entityType: true,
            entityId: true,
          },
        },
      },
    });
  }

  listExpiredPending(now = new Date(), limit = 50) {
    return this.prisma.workflowApproval.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      orderBy: { expiresAt: 'asc' },
      take: limit,
      select: { id: true, organizationId: true },
    });
  }

  async create(
    tx: Tx,
    input: {
      organizationId: string;
      workflowRunId: string;
      workflowVersionId: string;
      actionRunId: string;
      expiresAt: Date;
      requestedByUserId?: string | null;
      makerCheckerRequired: boolean;
      rejectionStrategy: 'CANCEL_RUN' | 'SKIP_ACTION' | 'EXECUTE_FALLBACK';
      requestedPolicy?: Prisma.InputJsonValue;
      reason?: string;
    },
  ) {
    return tx.workflowApproval.create({
      data: {
        organizationId: input.organizationId,
        workflowRunId: input.workflowRunId,
        workflowVersionId: input.workflowVersionId,
        actionRunId: input.actionRunId,
        status: 'PENDING',
        requestedBySystem: !input.requestedByUserId,
        requestedByUserId: input.requestedByUserId ?? null,
        makerCheckerRequired: input.makerCheckerRequired,
        rejectionStrategy: input.rejectionStrategy,
        requestedPolicy: input.requestedPolicy,
        reason: input.reason,
        expiresAt: input.expiresAt,
      },
    });
  }

  async decide(
    tx: Tx,
    input: {
      orgId: string;
      approvalId: string;
      fromStatus: WorkflowRuntimeApprovalStatus;
      toStatus: WorkflowRuntimeApprovalStatus;
      approvedByUserId: string;
      decidedByName?: string;
      reason?: string;
    },
  ) {
    const result = await tx.workflowApproval.updateMany({
      where: {
        id: input.approvalId,
        organizationId: input.orgId,
        status: input.fromStatus,
      },
      data: {
        status: input.toStatus,
        approvedByUserId: input.approvedByUserId,
        decidedByName: input.decidedByName ?? null,
        reason: input.reason ?? null,
        decidedAt: new Date(),
      },
    });
    return result.count;
  }

  addComment(
    tx: Tx,
    input: {
      organizationId: string;
      approvalId: string;
      userId?: string;
      userName?: string;
      comment: string;
    },
  ) {
    return tx.workflowApprovalComment.create({
      data: input,
    });
  }

  markNotificationPrepared(approvalId: string, orgId: string) {
    return this.prisma.workflowApproval.updateMany({
      where: { id: approvalId, organizationId: orgId },
      data: { notificationPreparedAt: new Date() },
    });
  }
}
