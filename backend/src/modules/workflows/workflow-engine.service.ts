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
  ) {}

  async processEvent(event: WorkflowDomainEvent): Promise<string[]> {
    const workflows = await this.findMatchingWorkflows(event);
    const runIds: string[] = [];

    for (const workflow of workflows) {
      const runId = await this.executeWorkflow(workflow, event);
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

  private matchesScope(scope: WorkflowScopeDef, event: WorkflowDomainEvent): boolean {
    if (!scope || scope.type === 'organization') return true;
    const vehicleId =
      event.entityType === 'vehicle'
        ? event.entityId
        : (event.payload.vehicleId as string | undefined);
    if (scope.type === 'vehicle' && scope.vehicleIds?.length) {
      return !!vehicleId && scope.vehicleIds.includes(vehicleId);
    }
    if (scope.type === 'station' && scope.stationIds?.length) {
      const stationId = event.payload.stationId as string | undefined;
      return !!stationId && scope.stationIds.includes(stationId);
    }
    return true;
  }

  async executeWorkflow(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
  ): Promise<string | null> {
    const scope = workflow.scope as unknown as WorkflowScopeDef;
    if (!this.matchesScope(scope, event)) {
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
      });

      await this.prisma.orgWorkflowActionRun.update({
        where: { id: actionRun.id },
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

    await this.prisma.orgWorkflowRun.update({
      where: { id: run.id },
      data: {
        status: runStatus,
        errorMessage: runError,
        finishedAt: new Date(),
      },
    });

    await this.prisma.orgWorkflow.update({
      where: { id: workflow.id },
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
