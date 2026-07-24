import { Injectable, Logger } from '@nestjs/common';
import {
  OrgWorkflow,
  Prisma,
  WorkflowActionRunStatus,
  WorkflowRunStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateWorkflowConditions } from './workflow-condition.evaluator';
import {
  normalizeTriggerType,
  type WorkflowActionDef,
  type WorkflowConditionDef,
  type WorkflowScopeDef,
} from './workflow-definition.validator';
import { WorkflowActionExecutorService } from './workflow-action-executor.service';
import {
  assertLiveExecution,
  WorkflowExecutionMode,
} from './workflow-execution-mode';
import { evaluateWorkflowScope } from './workflow-scope.evaluator';
import { WorkflowTenantGuardService } from './workflow-tenant-guard.service';

export interface ExecuteWorkflowOptions {
  executionMode: WorkflowExecutionMode;
}

export interface WorkflowDomainEvent {
  organizationId: string;
  type: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
  idempotencyKey?: string;
}

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionExecutor: WorkflowActionExecutorService,
    private readonly tenantGuard: WorkflowTenantGuardService,
  ) {}

  async processEvent(event: WorkflowDomainEvent): Promise<string[]> {
    const orgId = this.tenantGuard.assertEventOrganization(event);
    await this.tenantGuard.validateEventEntities(orgId, event);

    const workflows = await this.findMatchingWorkflows(event);
    const runIds: string[] = [];

    for (const workflow of workflows) {
      const runId = await this.executeWorkflow(workflow, event, {
        executionMode: WorkflowExecutionMode.LIVE,
      });
      if (runId) runIds.push(runId);
    }
    return runIds;
  }

  async findMatchingWorkflows(event: WorkflowDomainEvent): Promise<OrgWorkflow[]> {
    const eventType = normalizeTriggerType(event.type);
    const rows = await this.prisma.orgWorkflow.findMany({
      where: {
        organizationId: event.organizationId,
        status: 'ACTIVE',
        enabled: true,
      },
    });

    return rows.filter((wf) => {
      const trigger = wf.trigger as { type?: string };
      const wfType = normalizeTriggerType(trigger?.type ?? '');
      return wfType === eventType;
    });
  }

  async executeWorkflow(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
    options: ExecuteWorkflowOptions,
  ): Promise<string | null> {
    assertLiveExecution(
      options.executionMode,
      'WorkflowEngineService.executeWorkflow',
    );

    const scopeResult = evaluateWorkflowScope(
      workflow.scope as unknown as WorkflowScopeDef,
      event,
    );
    if (!scopeResult.passed) {
      return null;
    }

    const conditions = (workflow.conditions as unknown as WorkflowConditionDef[]) ?? [];
    const conditionEval = evaluateWorkflowConditions(conditions, event.payload);
    if (!conditionEval.passed) {
      return this.createSkippedRun(workflow, event, conditionEval);
    }

    const baseKey =
      event.idempotencyKey ??
      `${event.type}:${event.entityType ?? 'none'}:${event.entityId ?? 'none'}`;
    const idempotencyKey = `${baseKey}:workflow:${workflow.id}`;

    const existing = await this.prisma.orgWorkflowRun.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: event.organizationId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      this.logger.debug(
        `Skipping duplicate workflow run ${idempotencyKey} for org ${event.organizationId}`,
      );
      return existing.id;
    }

    const run = await this.prisma.orgWorkflowRun.create({
      data: {
        organizationId: event.organizationId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        eventType: event.type,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        status: 'RUNNING',
        inputPayload: event.payload as unknown as Prisma.InputJsonValue,
        conditionResult: conditionEval as unknown as Prisma.InputJsonValue,
        idempotencyKey,
        startedAt: event.occurredAt ?? new Date(),
      },
    });

    const actions = (workflow.actions as unknown as WorkflowActionDef[]) ?? [];
    let runStatus: WorkflowRunStatus = 'SUCCESS';
    let runError: string | null = null;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionRun = await this.prisma.orgWorkflowActionRun.create({
        data: {
          organizationId: event.organizationId,
          workflowRunId: run.id,
          workflowId: workflow.id,
          actionType: action.type,
          actionIndex: i,
          status: 'RUNNING',
          input: (action.config ?? {}) as unknown as Prisma.InputJsonValue,
          requiresApproval: action.requiresApproval === true,
          startedAt: new Date(),
        },
      });

      const result = await this.actionExecutor.execute(action, {
        organizationId: event.organizationId,
        workflowId: workflow.id,
        workflowRunId: run.id,
        actionRunId: actionRun.id,
        actionIndex: i,
        eventType: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: event.payload,
        idempotencyKey,
        executionMode: WorkflowExecutionMode.LIVE,
      });

      await this.prisma.orgWorkflowActionRun.updateMany({
        where: { id: actionRun.id, organizationId: event.organizationId },
        data: {
          status: result.status,
          output: (result.output ?? undefined) as unknown as Prisma.InputJsonValue,
          errorMessage: result.errorMessage ?? null,
          finishedAt: new Date(),
        },
      });

      if (result.status === 'FAILED') {
        runStatus = 'FAILED';
        runError = result.errorMessage ?? 'Action failed';
        break;
      }
      if (result.status === 'WAITING_APPROVAL') {
        runStatus = 'WAITING_APPROVAL';
        break;
      }
    }

    await this.prisma.orgWorkflowRun.updateMany({
      where: { id: run.id, organizationId: event.organizationId },
      data: {
        status: runStatus,
        errorMessage: runError,
        finishedAt: new Date(),
      },
    });

    await this.prisma.orgWorkflow.updateMany({
      where: { id: workflow.id, organizationId: event.organizationId },
      data: {
        triggerCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    });

    return run.id;
  }

  private async createSkippedRun(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
    conditionResult: unknown,
  ): Promise<string> {
    const baseKey =
      event.idempotencyKey ??
      `${event.type}:${event.entityType ?? 'none'}:${event.entityId ?? 'none'}`;
    const idempotencyKey = `${baseKey}:workflow:${workflow.id}:skipped`;

    const existing = await this.prisma.orgWorkflowRun.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: event.organizationId,
          idempotencyKey,
        },
      },
    });
    if (existing) return existing.id;

    const run = await this.prisma.orgWorkflowRun.create({
      data: {
        organizationId: event.organizationId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        eventType: event.type,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        status: 'SKIPPED',
        inputPayload: event.payload as unknown as Prisma.InputJsonValue,
        conditionResult: conditionResult as unknown as Prisma.InputJsonValue,
        idempotencyKey,
        finishedAt: new Date(),
      },
    });
    return run.id;
  }
}
