import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { validateWorkflowDefinition } from './workflow-definition.validator';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowMakerCheckerService } from './maker-checker/workflow-maker-checker.service';
import {
  buildDefinitionSnapshot,
  computeWorkflowDefinitionHash,
} from './maker-checker/workflow-maker-checker.util';
import { TaskAutomationAdminService } from '@modules/tasks/automation/task-automation-admin.service';

const STATUS_DISPLAY: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  DISABLED: 'Disabled',
  INVALID: 'Invalid',
  PENDING_ACTIVATION: 'Pending activation',
};

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly makerChecker: WorkflowMakerCheckerService,
    private readonly taskAutomationAdmin: TaskAutomationAdminService,
  ) {}

  private format(wf: Record<string, unknown>) {
    return {
      ...wf,
      statusLabel: STATUS_DISPLAY[(wf.status as string)] || wf.status,
    };
  }

  async findByOrg(orgId: string, filters?: { status?: string; category?: string }) {
    const where: Prisma.OrgWorkflowWhereInput = { organizationId: orgId };
    if (filters?.status) where.status = filters.status as Prisma.EnumWorkflowStatusFilter;
    if (filters?.category) where.category = filters.category;

    const rows = await this.prisma.orgWorkflow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.format(r as unknown as Record<string, unknown>));
  }

  async findById(orgId: string, id: string) {
    const row = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Workflow not found');
    return this.format(row as unknown as Record<string, unknown>);
  }

  async listChangeRequests(orgId: string, workflowId: string) {
    await this.findById(orgId, workflowId);
    const workflow = await this.prisma.orgWorkflow.findFirst({
      where: { id: workflowId, organizationId: orgId },
    });
    const rows = await this.prisma.orgWorkflowChangeRequest.findMany({
      where: { organizationId: orgId, workflowId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => this.makerChecker.formatChangeRequest(row, workflow));
  }

  async getChangeRequest(orgId: string, requestId: string) {
    const request = await this.prisma.orgWorkflowChangeRequest.findFirst({
      where: { id: requestId, organizationId: orgId },
    });
    if (!request) throw new NotFoundException('Change request not found');
    const workflow = await this.prisma.orgWorkflow.findFirst({
      where: { id: request.workflowId, organizationId: orgId },
    });
    return this.makerChecker.formatChangeRequest(request, workflow);
  }

  async create(orgId: string, dto: CreateWorkflowDto, userId?: string, userName?: string) {
    const validated = validateWorkflowDefinition(dto);
    const requestedStatus = dto.status ?? 'DRAFT';
    const makerCheckerRequired =
      requestedStatus === 'ACTIVE'
      && this.makerChecker.publishRequiresMakerChecker({ actions: validated.actions as Prisma.JsonArray });

    if (makerCheckerRequired) {
      if (!userId) throw new ForbiddenException('Authenticated maker required');
      if (!dto.activationReason?.trim()) {
        throw new BadRequestException(
          'activationReason is required to publish HIGH/CRITICAL workflows',
        );
      }
    }

    const status = makerCheckerRequired ? 'PENDING_ACTIVATION' : requestedStatus;
    const enabled = status === 'ACTIVE';

    const row = await this.prisma.orgWorkflow.create({
      data: {
        organizationId: orgId,
        name: dto.name.trim(),
        description: dto.description,
        category: dto.category,
        trigger: validated.trigger as unknown as Prisma.InputJsonValue,
        conditions: validated.conditions as unknown as Prisma.InputJsonValue,
        actions: validated.actions as unknown as Prisma.InputJsonValue,
        scope: validated.scope as unknown as Prisma.InputJsonValue,
        status,
        enabled,
        version: 1,
        createdById: userId,
        createdByName: userName,
        updatedById: userId,
        updatedByName: userName,
      },
    });

    let changeRequest = null;
    if (makerCheckerRequired && userId) {
      changeRequest = await this.makerChecker.submitActivationRequest({
        orgId,
        workflow: row,
        maker: { id: userId, platformRole: undefined },
        makerReason: dto.activationReason!.trim(),
      });
    }

    return {
      ...this.format(row as unknown as Record<string, unknown>),
      pendingActivation: Boolean(changeRequest),
      changeRequest,
    };
  }

  async update(
    orgId: string,
    id: string,
    dto: UpdateWorkflowDto,
    userId?: string,
    userName?: string,
  ) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');

    const validated = validateWorkflowDefinition({
      name: dto.name ?? existing.name,
      category: dto.category ?? existing.category,
      trigger: (dto.trigger ?? existing.trigger) as any,
      conditions: (dto.conditions ?? existing.conditions) as any,
      actions: (dto.actions ?? existing.actions) as any,
      scope: (dto.scope ?? existing.scope) as any,
    });

    const requestedStatus = dto.status ?? existing.status;
    const activating =
      requestedStatus === 'ACTIVE'
      && existing.status !== 'ACTIVE';
    const makerCheckerRequired =
      activating
      && this.makerChecker.publishRequiresMakerChecker({
        actions: validated.actions as Prisma.JsonArray,
      });

    if (makerCheckerRequired && !dto.activationReason?.trim()) {
      throw new BadRequestException(
        'activationReason is required to publish HIGH/CRITICAL workflows',
      );
    }

    await this.makerChecker.supersedePendingChangeRequests(orgId, id);

    const nextStatus = makerCheckerRequired ? 'PENDING_ACTIVATION' : requestedStatus;
    const row = await this.prisma.orgWorkflow.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        trigger: validated.trigger as unknown as Prisma.InputJsonValue,
        conditions: validated.conditions as unknown as Prisma.InputJsonValue,
        actions: validated.actions as unknown as Prisma.InputJsonValue,
        scope: validated.scope as unknown as Prisma.InputJsonValue,
        status: nextStatus,
        enabled: nextStatus === 'ACTIVE',
        version: { increment: 1 },
        updatedById: userId,
        updatedByName: userName,
      },
    });

    let changeRequest = null;
    if (makerCheckerRequired && userId) {
      changeRequest = await this.makerChecker.submitActivationRequest({
        orgId,
        workflow: row,
        maker: { id: userId },
        makerReason: dto.activationReason!.trim(),
      });
    }

    return {
      ...this.format(row as unknown as Record<string, unknown>),
      pendingActivation: Boolean(changeRequest),
      changeRequest,
    };
  }

  async toggleStatus(
    orgId: string,
    id: string,
    userId?: string,
    userName?: string,
    activationReason?: string,
  ) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');

    const enabling = existing.status !== 'ACTIVE';
    const makerCheckerRequired =
      enabling && this.makerChecker.publishRequiresMakerChecker(existing);

    if (makerCheckerRequired) {
      if (!userId) throw new ForbiddenException('Authenticated maker required');
      if (!activationReason?.trim()) {
        throw new BadRequestException(
          'activationReason is required to activate HIGH/CRITICAL workflows',
        );
      }
      await this.makerChecker.supersedePendingChangeRequests(orgId, id);
      const row = await this.prisma.orgWorkflow.update({
        where: { id },
        data: {
          status: 'PENDING_ACTIVATION',
          enabled: false,
          version: { increment: 1 },
          updatedById: userId,
          updatedByName: userName,
        },
      });
      const changeRequest = await this.makerChecker.submitActivationRequest({
        orgId,
        workflow: row,
        maker: { id: userId },
        makerReason: activationReason.trim(),
      });
      return {
        ...this.format(row as unknown as Record<string, unknown>),
        pendingActivation: true,
        changeRequest,
      };
    }

    const newStatus = existing.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const row = await this.prisma.orgWorkflow.update({
      where: { id },
      data: {
        status: newStatus,
        enabled: newStatus === 'ACTIVE',
        updatedById: userId,
        updatedByName: userName,
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async approveChangeRequest(
    orgId: string,
    requestId: string,
    actor: PermissionActor & { id: string },
    body: {
      reason: string;
      decisionVersion?: number;
      emergencyOverride?: boolean;
      emergencyReason?: string;
    },
  ) {
    const result = await this.makerChecker.approveChangeRequest({
      orgId,
      requestId,
      checker: actor,
      checkerReason: body.reason,
      expectedDecisionVersion: body.decisionVersion,
      emergency: body.emergencyOverride
        ? { reason: body.emergencyReason ?? body.reason }
        : undefined,
    });

    if (result.request.operation === 'WORKFLOW_DEAD_LETTER_FORCE_REPLAY') {
      const proposed = result.request.proposedDefinition as { outboxId?: string };
      if (proposed?.outboxId) {
        await this.taskAutomationAdmin.executeDeadLetterReplay(orgId, proposed.outboxId);
      }
    }

    return {
      changeRequest: this.makerChecker.formatChangeRequest(result.request, result.workflow),
      workflow: this.format(result.workflow as unknown as Record<string, unknown>),
    };
  }

  async rejectChangeRequest(
    orgId: string,
    requestId: string,
    actor: PermissionActor & { id: string },
    body: { reason: string; decisionVersion?: number },
  ) {
    const request = await this.makerChecker.rejectChangeRequest({
      orgId,
      requestId,
      checker: actor,
      checkerReason: body.reason,
      expectedDecisionVersion: body.decisionVersion,
    });
    return this.makerChecker.formatChangeRequest(request);
  }

  async duplicate(orgId: string, id: string, userId?: string, userName?: string) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');

    const row = await this.prisma.orgWorkflow.create({
      data: {
        organizationId: orgId,
        name: `${existing.name} (Kopie)`,
        description: existing.description,
        category: existing.category,
        trigger: existing.trigger as Prisma.InputJsonValue,
        conditions: existing.conditions as Prisma.InputJsonValue,
        actions: existing.actions as Prisma.InputJsonValue,
        scope: existing.scope as Prisma.InputJsonValue,
        status: 'DRAFT',
        enabled: false,
        version: 1,
        createdById: userId,
        createdByName: userName,
        updatedById: userId,
        updatedByName: userName,
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async remove(orgId: string, id: string) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');
    await this.prisma.orgWorkflow.delete({ where: { id } });
    return { success: true };
  }

  async getStats(orgId: string) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      total,
      active,
      draft,
      disabled,
      invalid,
      pendingActivation,
      totalRuns,
      successfulRuns,
      failedRuns,
      waitingApprovalRuns,
      runsLast24h,
      lastRun,
    ] = await Promise.all([
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId } }),
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId, status: 'DRAFT' } }),
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId, status: 'DISABLED' } }),
      this.prisma.orgWorkflow.count({ where: { organizationId: orgId, status: 'INVALID' } }),
      this.prisma.orgWorkflow.count({
        where: { organizationId: orgId, status: 'PENDING_ACTIVATION' },
      }),
      this.prisma.orgWorkflowRun.count({ where: { organizationId: orgId } }),
      this.prisma.orgWorkflowRun.count({ where: { organizationId: orgId, status: 'SUCCESS' } }),
      this.prisma.orgWorkflowRun.count({ where: { organizationId: orgId, status: 'FAILED' } }),
      this.prisma.orgWorkflowRun.count({
        where: { organizationId: orgId, status: 'WAITING_APPROVAL' },
      }),
      this.prisma.orgWorkflowRun.count({
        where: { organizationId: orgId, createdAt: { gte: since24h } },
      }),
      this.prisma.orgWorkflowRun.findFirst({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      total,
      active,
      draft,
      disabled,
      invalid,
      pendingActivation,
      totalRuns,
      successfulRuns,
      failedRuns,
      waitingApprovalRuns,
      runsLast24h,
      lastRunAt: lastRun?.createdAt ?? null,
    };
  }

  async listRuns(orgId: string, workflowId: string, limit = 25) {
    await this.findById(orgId, workflowId);
    return this.prisma.orgWorkflowRun.findMany({
      where: { organizationId: orgId, workflowId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        actionRuns: { orderBy: { actionIndex: 'asc' } },
      },
    });
  }

  async getRun(orgId: string, runId: string) {
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

  async testWorkflow(
    orgId: string,
    workflowId: string,
    dto: { payload?: Record<string, unknown>; entityType?: string; entityId?: string },
    triggeredByUserId?: string,
  ) {
    const wf = await this.prisma.orgWorkflow.findFirst({
      where: { id: workflowId, organizationId: orgId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');

    const runId = await this.workflowEngine.executeWorkflow(wf, {
      organizationId: orgId,
      type: 'manual.test',
      entityType: dto.entityType,
      entityId: dto.entityId,
      payload: {
        ...(dto.payload ?? {}),
        manualTest: true,
        triggeredByUserId,
      },
      idempotencyKey: `manual.test:${workflowId}:${Date.now()}`,
    });

    if (!runId) {
      return { runIds: [], runs: [], message: 'Workflow skipped (scope/conditions)' };
    }
    const run = await this.getRun(orgId, runId);
    return { runIds: [runId], runs: [run] };
  }

  async approveActionRun(
    orgId: string,
    actionRunId: string,
    userId: string | undefined,
    body: {
      reason: string;
      decisionVersion?: number;
      emergencyOverride?: boolean;
      emergencyReason?: string;
    },
    actor?: PermissionActor,
  ) {
    if (!userId || !actor?.id) {
      throw new ForbiddenException('Authenticated checker required');
    }

    const actionRun = await this.prisma.orgWorkflowActionRun.findFirst({
      where: { id: actionRunId, organizationId: orgId },
    });
    if (!actionRun) throw new NotFoundException('Action run not found');
    if (actionRun.status !== 'WAITING_APPROVAL') {
      throw new BadRequestException('Action run is not waiting for approval');
    }

    const approval = await this.prisma.orgWorkflowApproval.findFirst({
      where: { actionRunId, organizationId: orgId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!approval) throw new NotFoundException('Pending approval not found');

    const workflow = await this.prisma.orgWorkflow.findFirst({
      where: { id: actionRun.workflowId, organizationId: orgId },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');

    const definitionHash = computeWorkflowDefinitionHash(buildDefinitionSnapshot(workflow));

    await this.makerChecker.approveRuntimeAction({
      orgId,
      approval,
      actionRunId,
      workflowVersion: workflow.version,
      definitionHash,
      checker: { id: userId, ...actor },
      checkerReason: body.reason,
      expectedDecisionVersion: body.decisionVersion ?? approval.decisionVersion,
      emergency: body.emergencyOverride
        ? { reason: body.emergencyReason ?? body.reason }
        : undefined,
    });

    await this.prisma.orgWorkflowActionRun.update({
      where: { id: actionRunId },
      data: {
        status: 'SUCCESS',
        approvedByUserId: userId,
        approvedAt: new Date(),
        finishedAt: new Date(),
        output: { approved: true, executedAfterApproval: false },
      },
    });

    return this.getRun(orgId, actionRun.workflowRunId);
  }

  async rejectActionRun(
    orgId: string,
    actionRunId: string,
    userId?: string,
    reason?: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const actionRun = await this.prisma.orgWorkflowActionRun.findFirst({
      where: { id: actionRunId, organizationId: orgId },
    });
    if (!actionRun) throw new NotFoundException('Action run not found');

    await this.prisma.orgWorkflowActionRun.update({
      where: { id: actionRunId },
      data: {
        status: 'FAILED',
        errorMessage: reason,
        finishedAt: new Date(),
      },
    });

    await this.prisma.orgWorkflowApproval.updateMany({
      where: { actionRunId, organizationId: orgId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        approvedByUserId: userId ?? null,
        checkerReason: reason,
        reason,
        decidedAt: new Date(),
      },
    });

    await this.prisma.orgWorkflowRun.update({
      where: { id: actionRun.workflowRunId },
      data: { status: 'FAILED', errorMessage: 'Action rejected', finishedAt: new Date() },
    });

    return this.getRun(orgId, actionRun.workflowRunId);
  }
}
