import { Injectable, Logger } from '@nestjs/common';
import {
  OrgWorkflow,
  OrgWorkflowActionRun,
  OrgWorkflowRun,
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
import { WorkflowShadowGateService } from './shadow/workflow-shadow-gate.service';
import { WorkflowShadowService } from './shadow/workflow-shadow.service';
import { WorkflowRuntimeRolloutService } from './rollout/workflow-runtime-rollout.service';
import { shouldRunWorkflowLive } from './shadow/workflow-shadow-comparison.util';
import { ConfigService } from '@nestjs/config';
import {
  buildNotificationActionIdempotencyKey,
  extractNotificationWorkflowContext,
  resolveActionDefinitionId,
  resolveWorkflowRunIdempotencyKey,
  type NotificationWorkflowContext,
} from './workflow-notification-idempotency.util';

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

const TERMINAL_RUN_STATUSES = new Set<WorkflowRunStatus>([
  'SUCCESS',
  'SKIPPED',
  'WAITING_APPROVAL',
]);

const TERMINAL_ACTION_STATUSES = new Set<WorkflowActionRunStatus>([
  'SUCCESS',
  'WAITING_APPROVAL',
]);

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionExecutor: WorkflowActionExecutorService,
    private readonly shadowGate: WorkflowShadowGateService,
    private readonly shadowService: WorkflowShadowService,
    private readonly rollout: WorkflowRuntimeRolloutService,
    private readonly config: ConfigService,
  ) {}

  async processEvent(event: WorkflowDomainEvent): Promise<string[]> {
    const liveCandidates = await this.findMatchingWorkflows(event);
    const shadowCandidates = await this.findShadowCandidateWorkflows(event);
    const workflows = new Map<string, OrgWorkflow>();
    for (const wf of [...liveCandidates, ...shadowCandidates]) {
      workflows.set(wf.id, wf);
    }

    const runIds: string[] = [];
    let shadowEvaluations = 0;
    const maxShadow =
      this.config.get<number>('workflowShadow.maxEvaluationsPerEvent')
      ?? this.config.get<number>('workflowRuntimeRollout.maxEvaluationsPerEvent')
      ?? 20;

    for (const workflow of workflows.values()) {
      const rolloutFlags = await this.rollout.resolveEffectiveFlags(event.organizationId, workflow.id);
      const gate = await this.shadowGate.resolve(event.organizationId, workflow);

      const runLive =
        rolloutFlags.runLiveEngine
        && gate.runLive
        && shouldRunWorkflowLive(workflow)
        && !workflow.shadowEnabled;

      if (runLive) {
        const runId = await this.executeWorkflow(workflow, event, {
          executionMode: WorkflowExecutionMode.LIVE,
        });
        if (runId) runIds.push(runId);
      }

      const runShadow = rolloutFlags.runShadow && gate.runShadow;
      if (runShadow && shadowEvaluations < maxShadow) {
        shadowEvaluations += 1;
        this.shadowService.scheduleShadowEvaluation(workflow, event);
      }
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

  /** Workflows eligible for shadow evaluation (includes shadow-only pilots). */
  async findShadowCandidateWorkflows(event: WorkflowDomainEvent): Promise<OrgWorkflow[]> {
    const orgEnabled = await this.shadowGate.isOrgShadowEnabled(event.organizationId);
    if (!orgEnabled) return [];

    const eventType = normalizeTriggerType(event.type);
    const rows = await this.prisma.orgWorkflow.findMany({
      where: {
        organizationId: event.organizationId,
        status: 'ACTIVE',
        OR: [{ shadowEnabled: true }, { systemMetadata: { not: Prisma.DbNull } }],
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

    const notificationCtx = extractNotificationWorkflowContext(event);
    const idempotencyKey = resolveWorkflowRunIdempotencyKey(event, workflow.id);

    const existing = await this.prisma.orgWorkflowRun.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: event.organizationId,
          idempotencyKey,
        },
      },
      include: { actionRuns: { orderBy: { actionIndex: 'asc' } } },
    });

    if (existing) {
      if (TERMINAL_RUN_STATUSES.has(existing.status)) {
        this.logger.debug(
          `Reusing terminal workflow run ${idempotencyKey} for org ${event.organizationId}`,
        );
        return existing.id;
      }
      return this.resumeWorkflowRun(workflow, event, existing, notificationCtx, options);
    }

    let run: OrgWorkflowRun;
    try {
      run = await this.prisma.orgWorkflowRun.create({
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
          notificationId: notificationCtx?.notificationId ?? null,
          notificationFingerprint: notificationCtx?.notificationFingerprint ?? null,
          notificationGeneration: notificationCtx?.notificationGeneration ?? null,
          triggerEventId: notificationCtx?.triggerEventId ?? null,
          correlationId: notificationCtx?.correlationId ?? null,
          causationId: notificationCtx?.causationId ?? null,
          startedAt: event.occurredAt ?? new Date(),
        },
      });
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        const raced = await this.prisma.orgWorkflowRun.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: event.organizationId,
              idempotencyKey,
            },
          },
          include: { actionRuns: { orderBy: { actionIndex: 'asc' } } },
        });
        if (raced) {
          if (TERMINAL_RUN_STATUSES.has(raced.status)) return raced.id;
          return this.resumeWorkflowRun(workflow, event, raced, notificationCtx, options);
        }
      }
      throw err;
    }

    const runStatus = await this.executeActionsForRun(
      workflow,
      event,
      run,
      notificationCtx,
      idempotencyKey,
      options,
    );

    await this.prisma.orgWorkflow.update({
      where: { id: workflow.id },
      data: {
        triggerCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    });

    return runStatus === 'ABORTED' ? null : run.id;
  }

  private async resumeWorkflowRun(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
    run: OrgWorkflowRun & { actionRuns: OrgWorkflowActionRun[] },
    notificationCtx: NotificationWorkflowContext | null,
    options: ExecuteWorkflowOptions,
  ): Promise<string> {
    this.logger.debug(`Resuming workflow run ${run.id} for org ${event.organizationId}`);
    await this.executeActionsForRun(
      workflow,
      event,
      run,
      notificationCtx,
      run.idempotencyKey,
      options,
      run.actionRuns,
    );
    return run.id;
  }

  private async executeActionsForRun(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
    run: OrgWorkflowRun,
    notificationCtx: NotificationWorkflowContext | null,
    runIdempotencyKey: string,
    options: ExecuteWorkflowOptions,
    existingActionRuns: OrgWorkflowActionRun[] = [],
  ): Promise<WorkflowRunStatus | 'ABORTED'> {
    const actions = (workflow.actions as unknown as WorkflowActionDef[]) ?? [];
    const actionRunsByIndex = new Map(
      existingActionRuns.map((row) => [row.actionIndex, row]),
    );

    let runStatus: WorkflowRunStatus = 'SUCCESS';
    let runError: string | null = null;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionDefinitionId = resolveActionDefinitionId(action, i);
      const actionIdempotencyKey = this.resolveActionIdempotencyKey({
        organizationId: event.organizationId,
        workflowId: workflow.id,
        workflowRunId: run.id,
        runIdempotencyKey,
        notificationCtx,
        actionDefinitionId,
      });

      let actionRun = actionRunsByIndex.get(i)
        ?? await this.findActionRunByIdempotency(event.organizationId, actionIdempotencyKey);

      if (actionRun && TERMINAL_ACTION_STATUSES.has(actionRun.status)) {
        if (actionRun.status === 'WAITING_APPROVAL') {
          runStatus = 'WAITING_APPROVAL';
        }
        continue;
      }

      if (!actionRun) {
        actionRun = await this.createActionRun({
          organizationId: event.organizationId,
          workflowId: workflow.id,
          workflowRunId: run.id,
          action,
          actionIndex: i,
          actionDefinitionId,
          actionIdempotencyKey,
          notificationCtx,
          causationId: run.id,
        });
      } else if (actionRun.status === 'RUNNING' || actionRun.status === 'FAILED') {
        await this.prisma.orgWorkflowActionRun.update({
          where: { id: actionRun.id },
          data: { status: 'RUNNING', errorMessage: null, startedAt: new Date() },
        });
      }

      const result = await this.actionExecutor.execute(action, {
        organizationId: event.organizationId,
        workflowId: workflow.id,
        workflowRunId: run.id,
        actionRunId: actionRun.id,
        actionIndex: i,
        actionDefinitionId,
        eventType: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: event.payload,
        idempotencyKey: runIdempotencyKey,
        actionIdempotencyKey,
        notificationContext: notificationCtx ?? undefined,
        executionMode: WorkflowExecutionMode.LIVE,
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

    return runStatus;
  }

  private resolveActionIdempotencyKey(input: {
    organizationId: string;
    workflowId: string;
    workflowRunId: string;
    runIdempotencyKey: string;
    notificationCtx: NotificationWorkflowContext | null;
    actionDefinitionId: string;
  }): string {
    if (input.notificationCtx) {
      return buildNotificationActionIdempotencyKey({
        organizationId: input.organizationId,
        workflowId: input.workflowId,
        notificationId: input.notificationCtx.notificationId,
        notificationGeneration: input.notificationCtx.notificationGeneration,
        actionDefinitionId: input.actionDefinitionId,
      });
    }
    return `workflow-action:${input.organizationId}:${input.workflowRunId}:${input.actionDefinitionId}`;
  }

  private async findActionRunByIdempotency(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<OrgWorkflowActionRun | null> {
    return this.prisma.orgWorkflowActionRun.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  private async createActionRun(input: {
    organizationId: string;
    workflowId: string;
    workflowRunId: string;
    action: WorkflowActionDef;
    actionIndex: number;
    actionDefinitionId: string;
    actionIdempotencyKey: string;
    notificationCtx: NotificationWorkflowContext | null;
    causationId: string;
  }): Promise<OrgWorkflowActionRun> {
    try {
      return await this.prisma.orgWorkflowActionRun.create({
        data: {
          organizationId: input.organizationId,
          workflowRunId: input.workflowRunId,
          workflowId: input.workflowId,
          actionType: input.action.type,
          actionIndex: input.actionIndex,
          actionDefinitionId: input.actionDefinitionId,
          status: 'RUNNING',
          input: (input.action.config ?? {}) as unknown as Prisma.InputJsonValue,
          requiresApproval: input.action.requiresApproval === true,
          idempotencyKey: input.actionIdempotencyKey,
          notificationId: input.notificationCtx?.notificationId ?? null,
          notificationFingerprint: input.notificationCtx?.notificationFingerprint ?? null,
          notificationGeneration: input.notificationCtx?.notificationGeneration ?? null,
          triggerEventId: input.notificationCtx?.triggerEventId ?? null,
          correlationId: input.notificationCtx?.correlationId ?? null,
          causationId: input.causationId,
          startedAt: new Date(),
        },
      });
    } catch (err) {
      if (!this.isUniqueConstraintError(err)) throw err;
      const existing = await this.findActionRunByIdempotency(
        input.organizationId,
        input.actionIdempotencyKey,
      );
      if (!existing) throw err;
      return existing;
    }
  }

  private async createSkippedRun(
    workflow: OrgWorkflow,
    event: WorkflowDomainEvent,
    conditionResult: unknown,
  ): Promise<string> {
    const notificationCtx = extractNotificationWorkflowContext(event);
    const idempotencyKey = `${resolveWorkflowRunIdempotencyKey(event, workflow.id)}:skipped`;

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
        notificationId: notificationCtx?.notificationId ?? null,
        notificationFingerprint: notificationCtx?.notificationFingerprint ?? null,
        notificationGeneration: notificationCtx?.notificationGeneration ?? null,
        triggerEventId: notificationCtx?.triggerEventId ?? null,
        correlationId: notificationCtx?.correlationId ?? null,
        causationId: notificationCtx?.causationId ?? null,
        finishedAt: new Date(),
      },
    });
    return run.id;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return (
      typeof err === 'object'
      && err !== null
      && 'code' in err
      && (err as { code: string }).code === 'P2002'
    );
  }
}
