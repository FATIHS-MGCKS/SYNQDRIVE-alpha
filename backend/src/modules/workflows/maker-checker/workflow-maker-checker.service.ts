import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkflowChangeRequestStatus,
  WorkflowMakerCheckerOperation,
  type OrgWorkflow,
  type OrgWorkflowApproval,
  type OrgWorkflowChangeRequest,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertMembershipPermission,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  WORKFLOW_MAKER_CHECKER_TTL_MS,
  assessWorkflowSensitivity,
  requiresMakerCheckerForPublish,
  requiresMakerCheckerForRuntimeAction,
  resolveActionOperation,
} from './workflow-maker-checker.constants';
import {
  buildDefinitionSnapshot,
  computeWorkflowDefinitionHash,
  diffDefinitionSnapshots,
  type WorkflowDefinitionSnapshot,
} from './workflow-maker-checker.util';

export interface MakerCheckerActor extends PermissionActor {
  id: string;
}

@Injectable()
export class WorkflowMakerCheckerService {
  private readonly logger = new Logger(WorkflowMakerCheckerService.name);

  constructor(private readonly prisma: PrismaService) {}

  assessPublishSensitivity(workflow: Pick<OrgWorkflow, 'actions'>): ReturnType<typeof assessWorkflowSensitivity> {
    const actions = Array.isArray(workflow.actions)
      ? (workflow.actions as Array<{ type: string }>)
      : [];
    return assessWorkflowSensitivity(actions);
  }

  publishRequiresMakerChecker(workflow: Pick<OrgWorkflow, 'actions'>): boolean {
    return requiresMakerCheckerForPublish(this.assessPublishSensitivity(workflow));
  }

  async supersedePendingChangeRequests(orgId: string, workflowId: string): Promise<number> {
    const result = await this.prisma.orgWorkflowChangeRequest.updateMany({
      where: { organizationId: orgId, workflowId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async expireStaleApprovals(orgId: string): Promise<number> {
    const now = new Date();
    const result = await this.prisma.orgWorkflowApproval.updateMany({
      where: {
        organizationId: orgId,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED', decidedAt: now },
    });
    return result.count;
  }

  async expireStaleChangeRequests(orgId: string): Promise<number> {
    const now = new Date();
    const result = await this.prisma.orgWorkflowChangeRequest.updateMany({
      where: {
        organizationId: orgId,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED', decidedAt: now },
    });
    return result.count;
  }

  async submitActivationRequest(input: {
    orgId: string;
    workflow: OrgWorkflow;
    maker: MakerCheckerActor;
    makerReason: string;
    proposedStatus?: 'ACTIVE' | 'PENDING_ACTIVATION';
  }): Promise<OrgWorkflowChangeRequest> {
    const reason = input.makerReason?.trim();
    if (!reason) {
      throw new BadRequestException('Maker reason is required for activation approval');
    }

    const sensitivity = this.assessPublishSensitivity(input.workflow);
    if (!requiresMakerCheckerForPublish(sensitivity)) {
      throw new BadRequestException('Workflow does not require maker-checker activation');
    }

    await this.expireStaleChangeRequests(input.orgId);
    await this.supersedePendingChangeRequests(input.orgId, input.workflow.id);

    const proposedSnapshot = buildDefinitionSnapshot({
      ...input.workflow,
      status: input.proposedStatus ?? 'ACTIVE',
    });
    const baselineSnapshot = buildDefinitionSnapshot(input.workflow);
    const expiresAt = new Date(Date.now() + WORKFLOW_MAKER_CHECKER_TTL_MS);

    return this.prisma.orgWorkflowChangeRequest.create({
      data: {
        organizationId: input.orgId,
        workflowId: input.workflow.id,
        operation: 'WORKFLOW_PUBLISH_HIGH_CRITICAL',
        makerUserId: input.maker.id,
        makerReason: reason,
        proposedDefinition: proposedSnapshot as unknown as Prisma.InputJsonValue,
        proposedDefinitionHash: computeWorkflowDefinitionHash(proposedSnapshot),
        baselineDefinitionHash: computeWorkflowDefinitionHash(baselineSnapshot),
        proposedWorkflowVersion: input.workflow.version,
        proposedStatus: 'ACTIVE',
        expiresAt,
      },
    });
  }

  async approveChangeRequest(input: {
    orgId: string;
    requestId: string;
    checker: MakerCheckerActor;
    checkerReason: string;
    emergency?: { reason: string };
    expectedDecisionVersion?: number;
  }): Promise<{ request: OrgWorkflowChangeRequest; workflow: OrgWorkflow }> {
    const checkerReason = input.checkerReason?.trim();
    if (!checkerReason) {
      throw new BadRequestException('Checker approval reason is required');
    }

    if (input.emergency) {
      await this.assertEmergencyOverride(input.checker, input.orgId, input.emergency.reason);
    } else {
      await this.assertCheckerPermission(input.checker, input.orgId);
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.orgWorkflowChangeRequest.findFirst({
        where: { id: input.requestId, organizationId: input.orgId },
      });
      if (!request) throw new NotFoundException('Change request not found');
      if (request.status !== 'PENDING') {
        throw new BadRequestException(`Change request is ${request.status}`);
      }
      if (request.expiresAt < new Date()) {
        await tx.orgWorkflowChangeRequest.update({
          where: { id: request.id },
          data: { status: 'EXPIRED', decidedAt: new Date() },
        });
        throw new BadRequestException('Change request has expired');
      }
      if (
        input.expectedDecisionVersion != null
        && request.decisionVersion !== input.expectedDecisionVersion
      ) {
        throw new BadRequestException('Concurrent decision — refresh and retry');
      }

      const workflow = await tx.orgWorkflow.findFirst({
        where: { id: request.workflowId, organizationId: input.orgId },
      });
      if (!workflow) throw new NotFoundException('Workflow not found');

      const currentHash = computeWorkflowDefinitionHash(buildDefinitionSnapshot(workflow));
      if (currentHash !== request.proposedDefinitionHash) {
        await tx.orgWorkflowChangeRequest.update({
          where: { id: request.id },
          data: { status: 'SUPERSEDED', decidedAt: new Date() },
        });
        throw new BadRequestException(
          'Workflow changed after approval request — approval invalidated',
        );
      }

      this.assertSeparation({
        makerUserId: request.makerUserId,
        checkerUserId: input.checker.id,
        lastEditorUserId: workflow.updatedById,
        actor: input.checker,
        emergency: Boolean(input.emergency),
      });

      const updatedRequest = await tx.orgWorkflowChangeRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          checkerUserId: input.checker.id,
          checkerReason,
          emergencyOverride: Boolean(input.emergency),
          emergencyReason: input.emergency?.reason ?? null,
          decidedAt: new Date(),
          decisionVersion: { increment: 1 },
        },
      });

      const updatedWorkflow = await tx.orgWorkflow.update({
        where: { id: workflow.id },
        data: {
          status: request.proposedStatus,
          enabled: request.proposedStatus === 'ACTIVE',
          updatedById: input.checker.id,
        },
      });

      this.auditMasterAdminDualRole(input.checker, request.makerUserId, 'change_request.approve');

      return { request: updatedRequest, workflow: updatedWorkflow };
    });
  }

  async rejectChangeRequest(input: {
    orgId: string;
    requestId: string;
    checker: MakerCheckerActor;
    checkerReason: string;
    expectedDecisionVersion?: number;
  }): Promise<OrgWorkflowChangeRequest> {
    const checkerReason = input.checkerReason?.trim();
    if (!checkerReason) {
      throw new BadRequestException('Rejection reason is required');
    }
    await this.assertCheckerPermission(input.checker, input.orgId);

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.orgWorkflowChangeRequest.findFirst({
        where: { id: input.requestId, organizationId: input.orgId },
      });
      if (!request) throw new NotFoundException('Change request not found');
      if (request.status !== 'PENDING') {
        throw new BadRequestException(`Change request is ${request.status}`);
      }
      if (
        input.expectedDecisionVersion != null
        && request.decisionVersion !== input.expectedDecisionVersion
      ) {
        throw new BadRequestException('Concurrent decision — refresh and retry');
      }

      this.assertSeparation({
        makerUserId: request.makerUserId,
        checkerUserId: input.checker.id,
        actor: input.checker,
      });

      const updated = await tx.orgWorkflowChangeRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          checkerUserId: input.checker.id,
          checkerReason,
          decidedAt: new Date(),
          decisionVersion: { increment: 1 },
        },
      });

      await tx.orgWorkflow.updateMany({
        where: {
          id: request.workflowId,
          organizationId: input.orgId,
          status: 'PENDING_ACTIVATION',
        },
        data: { status: 'DRAFT', enabled: false },
      });

      return updated;
    });
  }

  async createRuntimeApproval(input: {
    orgId: string;
    workflowRunId: string;
    actionRunId: string;
    actionType: string;
    makerUserId?: string | null;
    lastEditorUserId?: string | null;
    reason: string;
  }): Promise<void> {
    const operation = requiresMakerCheckerForRuntimeAction(input.actionType)
      ? resolveActionOperation(input.actionType)
      : 'WORKFLOW_RUNTIME_ACTION';

    await this.prisma.orgWorkflowApproval.create({
      data: {
        organizationId: input.orgId,
        workflowRunId: input.workflowRunId,
        actionRunId: input.actionRunId,
        status: 'PENDING',
        requestedBySystem: !input.makerUserId,
        requestedByUserId: input.makerUserId ?? null,
        makerUserId: input.makerUserId ?? null,
        lastEditorUserId: input.lastEditorUserId ?? null,
        reason: input.reason,
        operationType: operation,
        expiresAt: new Date(Date.now() + WORKFLOW_MAKER_CHECKER_TTL_MS),
      },
    });
  }

  async approveRuntimeAction(input: {
    orgId: string;
    approval: OrgWorkflowApproval;
    actionRunId: string;
    workflowVersion: number;
    definitionHash: string;
    checker: MakerCheckerActor;
    checkerReason: string;
    emergency?: { reason: string };
    expectedDecisionVersion?: number;
  }): Promise<void> {
    const checkerReason = input.checkerReason?.trim();
    if (!checkerReason) {
      throw new BadRequestException('Checker approval reason is required');
    }

    if (input.emergency) {
      await this.assertEmergencyOverride(input.checker, input.orgId, input.emergency.reason);
    } else {
      await this.assertCheckerPermission(input.checker, input.orgId);
    }

    await this.expireStaleApprovals(input.orgId);

    if (input.approval.status !== 'PENDING') {
      throw new BadRequestException(`Approval is ${input.approval.status}`);
    }
    if (input.approval.expiresAt && input.approval.expiresAt < new Date()) {
      await this.prisma.orgWorkflowApproval.update({
        where: { id: input.approval.id },
        data: { status: 'EXPIRED', decidedAt: new Date() },
      });
      throw new BadRequestException('Approval has expired');
    }
    if (
      input.expectedDecisionVersion != null
      && input.approval.decisionVersion !== input.expectedDecisionVersion
    ) {
      throw new BadRequestException('Concurrent decision — refresh and retry');
    }

    if (
      input.approval.approvedDefinitionHash
      && input.approval.approvedDefinitionHash !== input.definitionHash
    ) {
      throw new BadRequestException('Workflow version no longer matches approved snapshot');
    }
    if (
      input.approval.approvedWorkflowVersion != null
      && input.approval.approvedWorkflowVersion !== input.workflowVersion
    ) {
      throw new BadRequestException('Workflow version no longer matches approved snapshot');
    }

    this.assertSeparation({
      makerUserId: input.approval.makerUserId ?? input.approval.requestedByUserId,
      checkerUserId: input.checker.id,
      lastEditorUserId: input.approval.lastEditorUserId,
      actor: input.checker,
      emergency: Boolean(input.emergency),
    });

    const updated = await this.prisma.orgWorkflowApproval.updateMany({
      where: {
        id: input.approval.id,
        organizationId: input.orgId,
        status: 'PENDING',
        decisionVersion: input.approval.decisionVersion,
      },
      data: {
        status: 'APPROVED',
        approvedByUserId: input.checker.id,
        checkerReason,
        emergencyOverride: Boolean(input.emergency),
        emergencyReason: input.emergency?.reason ?? null,
        decidedAt: new Date(),
        decisionVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new BadRequestException('Concurrent decision — refresh and retry');
    }

    this.auditMasterAdminDualRole(
      input.checker,
      input.approval.makerUserId ?? input.approval.requestedByUserId,
      'runtime.approve',
    );
  }

  async assertDeadLetterReplay(input: {
    orgId: string;
    maker: MakerCheckerActor;
    makerReason: string;
    isExternalAction: boolean;
  }): Promise<void> {
    if (!input.isExternalAction) return;
    const reason = input.makerReason?.trim();
    if (!reason) {
      throw new BadRequestException('Reason required for external dead-letter force replay');
    }
    // Replay itself is initiated by maker; checker approval happens via change request flow
    // when org policy requires dual control — enforced at admin replay endpoint.
  }

  async submitDeadLetterReplayRequest(input: {
    orgId: string;
    outboxId: string;
    maker: MakerCheckerActor;
    makerReason: string;
  }): Promise<OrgWorkflowChangeRequest> {
    const reason = input.makerReason?.trim();
    if (!reason) {
      throw new BadRequestException('Maker reason is required for dead-letter replay');
    }

    const expiresAt = new Date(Date.now() + WORKFLOW_MAKER_CHECKER_TTL_MS);
    const proposedDefinition = {
      outboxId: input.outboxId,
      operation: 'WORKFLOW_DEAD_LETTER_FORCE_REPLAY',
    };

    return this.prisma.orgWorkflowChangeRequest.create({
      data: {
        organizationId: input.orgId,
        workflowId: (
          await this.ensureSystemWorkflowAnchor(input.orgId)
        ).id,
        operation: 'WORKFLOW_DEAD_LETTER_FORCE_REPLAY',
        makerUserId: input.maker.id,
        makerReason: reason,
        proposedDefinition: proposedDefinition as Prisma.InputJsonValue,
        proposedDefinitionHash: computeWorkflowDefinitionHash({
          name: `dead-letter-replay:${input.outboxId}`,
          category: 'support',
          trigger: proposedDefinition,
          conditions: [],
          actions: [],
          scope: { type: 'organization' },
          status: 'DRAFT',
          version: 1,
        }),
        baselineDefinitionHash: 'dead-letter-replay',
        proposedWorkflowVersion: 1,
        proposedStatus: 'DRAFT',
        expiresAt,
      },
    });
  }

  formatChangeRequest(
    request: OrgWorkflowChangeRequest,
    workflow?: OrgWorkflow | null,
  ) {
    const proposed = request.proposedDefinition as unknown as WorkflowDefinitionSnapshot;
    const baseline = workflow
      ? buildDefinitionSnapshot(workflow)
      : null;
    return {
      ...request,
      diff: baseline ? diffDefinitionSnapshots(baseline, proposed) : null,
      expired: request.status === 'PENDING' && request.expiresAt < new Date(),
    };
  }

  private async ensureSystemWorkflowAnchor(orgId: string): Promise<OrgWorkflow> {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: {
        organizationId: orgId,
        name: '__system_maker_checker_anchor__',
      },
    });
    if (existing) return existing;
    return this.prisma.orgWorkflow.create({
      data: {
        organizationId: orgId,
        name: '__system_maker_checker_anchor__',
        category: 'support',
        trigger: { type: 'manual.test' },
        actions: [],
        status: 'DRAFT',
        enabled: false,
        isTemplate: true,
      },
    });
  }

  private assertSeparation(input: {
    makerUserId?: string | null;
    checkerUserId: string;
    lastEditorUserId?: string | null;
    actor: MakerCheckerActor;
    emergency?: boolean;
  }): void {
    if (!input.checkerUserId) {
      throw new ForbiddenException('Checker identity required');
    }
    if (input.makerUserId && input.makerUserId === input.checkerUserId && !input.emergency) {
      throw new ForbiddenException(
        'Maker-checker violation: approver cannot be the same user as the requester',
      );
    }
    if (
      input.lastEditorUserId
      && input.lastEditorUserId === input.checkerUserId
      && !input.emergency
    ) {
      throw new ForbiddenException(
        'Maker-checker violation: last editor cannot approve their own change',
      );
    }
  }

  private async assertCheckerPermission(actor: MakerCheckerActor, orgId: string): Promise<void> {
    if (actor.platformRole === 'MASTER_ADMIN') return;
    await assertMembershipPermission(
      this.prisma,
      actor,
      orgId,
      'workflow-automation',
      'manage',
    );
  }

  private async assertEmergencyOverride(
    actor: MakerCheckerActor,
    orgId: string,
    reason: string,
  ): Promise<void> {
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length < 10) {
      throw new BadRequestException('Emergency override requires a detailed reason (min 10 chars)');
    }
    if (actor.platformRole === 'MASTER_ADMIN') {
      this.logger.warn(
        `MASTER_ADMIN emergency workflow override orgId=${orgId} actorId=${actor.id}`,
      );
      return;
    }
    await assertMembershipPermission(
      this.prisma,
      actor,
      orgId,
      'workflow-emergency-override',
      'manage',
    );
    this.logger.warn(
      `Emergency workflow override orgId=${orgId} actorId=${actor.id} reason=${trimmed.slice(0, 80)}`,
    );
  }

  private auditMasterAdminDualRole(
    actor: MakerCheckerActor,
    makerUserId: string | null | undefined,
    operation: string,
  ): void {
    if (actor.platformRole !== 'MASTER_ADMIN') return;
    if (makerUserId && makerUserId === actor.id) {
      this.logger.warn(
        `MASTER_ADMIN attempted dual maker-checker role: operation=${operation} actorId=${actor.id}`,
      );
    }
  }
}
