import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { validateWorkflowDefinition } from './workflow-definition.validator';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto';
import { WorkflowEventService } from './workflow-event.service';
import { WorkflowEngineService } from './workflow-engine.service';
import {
  buildWorkflowActionCapabilityPlan,
  collectWorkflowActionCapabilityIssues,
  listWorkflowActionCapabilities,
} from './workflow-action-capabilities';
import {
  assessWorkflowActionRemediation,
  normalizeStoredWorkflowActions,
} from './workflow-remediation.util';
import { WorkflowApprovalInterimService } from './workflow-approval-interim.service';
import { assertWorkflowActivatableWithApprovalPolicy } from './workflow-approval-interim.util';

const STATUS_DISPLAY: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  DISABLED: 'Disabled',
  INVALID: 'Invalid',
};

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly workflowEngine: WorkflowEngineService,
    private readonly approvalInterim: WorkflowApprovalInterimService,
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

  async create(orgId: string, dto: CreateWorkflowDto, userId?: string, userName?: string) {
    const status = dto.status ?? 'DRAFT';
    const validated = validateWorkflowDefinition({ ...dto, status });
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
        remediationRequired: false,
        remediationReason: null,
        remediationDetectedAt: null,
        version: 1,
        createdById: userId,
        createdByName: userName,
        updatedById: userId,
        updatedByName: userName,
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
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

    const nextStatus = dto.status ?? existing.status;
    const validated = validateWorkflowDefinition({
      name: dto.name ?? existing.name,
      category: dto.category ?? existing.category,
      trigger: (dto.trigger ?? existing.trigger) as any,
      conditions: (dto.conditions ?? existing.conditions) as any,
      actions: (dto.actions ?? existing.actions) as any,
      scope: (dto.scope ?? existing.scope) as any,
      status: nextStatus,
    });

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
        remediationRequired: false,
        remediationReason: null,
        remediationDetectedAt: null,
        version: { increment: 1 },
        updatedById: userId,
        updatedByName: userName,
      },
    });
    return this.format(row as unknown as Record<string, unknown>);
  }

  async toggleStatus(orgId: string, id: string, userId?: string, userName?: string) {
    const existing = await this.prisma.orgWorkflow.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Workflow not found');

    const newStatus = existing.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (newStatus === 'ACTIVE') {
      const actions = normalizeStoredWorkflowActions(existing.actions);
      const issues = collectWorkflowActionCapabilityIssues(actions, 'activate');
      if (issues.length > 0) {
        throw new BadRequestException({
          message: issues[0].message,
          code: issues[0].code,
          issues,
        });
      }
      assertWorkflowActivatableWithApprovalPolicy(actions, newStatus);
    }

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
  ) {
    const wf = await this.prisma.orgWorkflow.findFirst({
      where: { id: workflowId, organizationId: orgId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');

    const actions = normalizeStoredWorkflowActions(wf.actions);
    const plan = buildWorkflowActionCapabilityPlan(actions);
    const blocking = plan.filter((item) => !item.wouldExecute);
    if (blocking.length > 0) {
      return {
        runIds: [],
        runs: [],
        executed: false,
        actionPlan: plan,
        message: 'Workflow test blocked — invalid or unavailable actions detected',
        policyBlockers: blocking.map((item) => item.message ?? item.validationErrors.join('; ')),
      };
    }

    const runId = await this.workflowEngine.executeWorkflow(wf, {
      organizationId: orgId,
      type: 'manual.test',
      entityType: dto.entityType,
      entityId: dto.entityId,
      payload: {
        ...(dto.payload ?? {}),
        manualTest: true,
      },
      idempotencyKey: `manual.test:${workflowId}:${Date.now()}`,
    });

    if (!runId) {
      return { runIds: [], runs: [], message: 'Workflow skipped (scope/conditions)' };
    }
    const run = await this.getRun(orgId, runId);
    return { runIds: [runId], runs: [run] };
  }

  getActionCapabilities() {
    return listWorkflowActionCapabilities();
  }

  async previewWorkflowActions(orgId: string, workflowId: string) {
    const wf = await this.prisma.orgWorkflow.findFirst({
      where: { id: workflowId, organizationId: orgId },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
    const actions = normalizeStoredWorkflowActions(wf.actions);
    return {
      workflowId: wf.id,
      workflowName: wf.name,
      remediationRequired: wf.remediationRequired,
      remediationReason: wf.remediationReason,
      capabilityRevision: listWorkflowActionCapabilities().revision,
      executed: false,
      plannedActions: buildWorkflowActionCapabilityPlan(actions),
    };
  }

  async remediateOrganizationWorkflows(orgId: string) {
    const rows = await this.prisma.orgWorkflow.findMany({
      where: { organizationId: orgId },
      select: { id: true, actions: true },
    });
    const results = rows.map((row) => assessWorkflowActionRemediation(row));
    for (const result of results) {
      if (!result.remediationRequired) {
        await this.prisma.orgWorkflow.update({
          where: { id: result.workflowId },
          data: {
            remediationRequired: false,
            remediationReason: null,
            remediationDetectedAt: null,
          },
        });
        continue;
      }
      await this.prisma.orgWorkflow.update({
        where: { id: result.workflowId },
        data: {
          status: 'INVALID',
          enabled: false,
          remediationRequired: true,
          remediationReason: result.remediationReason,
          remediationDetectedAt: new Date(),
        },
      });
    }
    return {
      scanned: results.length,
      remediated: results.filter((r) => r.remediationRequired).length,
      results,
    };
  }

  async approveActionRun(
    orgId: string,
    actionRunId: string,
    user?: { id?: string; name?: string; email?: string; roles?: string[] },
    comment?: string,
  ) {
    return this.approvalInterim.approveActionRun(orgId, actionRunId, user, comment);
  }

  async rejectActionRun(
    orgId: string,
    actionRunId: string,
    user?: { id?: string; name?: string; email?: string; roles?: string[] },
    reason?: string,
  ) {
    return this.approvalInterim.rejectActionRun(orgId, actionRunId, user, reason);
  }
}
