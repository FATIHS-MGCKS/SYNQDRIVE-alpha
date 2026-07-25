import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { WorkflowDryRunService } from '../workflow-dry-run.service';
import { WorkflowActionPreviewService } from '../workflow-action-preview.service';
import {
  WorkflowActionExecutorService,
  type ActionExecutionContext,
} from '../workflow-action-executor.service';
import { WorkflowExecutionMode } from '../workflow-execution-mode';
import type { WorkflowActionDef } from '../workflow-definition.validator';
import type { WorkflowExecutionPlan } from '../workflow-execution-plan.types';
import type { WorkflowDomainEvent } from '../workflow-engine.service';
import type {
  TaskAutomationMaterializationPayload,
  TaskAutomationShadowResult,
} from './task-automation-workflow-bridge.types';
import { TaskAutomationWorkflowTemplateService } from './task-automation-workflow-template.service';

@Injectable()
export class TaskAutomationWorkflowMaterializerService {
  private readonly logger = new Logger(TaskAutomationWorkflowMaterializerService.name);

  constructor(
    private readonly actionExecutor: WorkflowActionExecutorService,
    private readonly actionPreview: WorkflowActionPreviewService,
    private readonly dryRun: WorkflowDryRunService,
    private readonly templateService: TaskAutomationWorkflowTemplateService,
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  async materializeViaWorkflow(
    payload: TaskAutomationMaterializationPayload,
    mode: 'execute' | 'preview',
  ): Promise<{ taskId?: string; shadow?: TaskAutomationShadowResult; plan?: WorkflowExecutionPlan }> {
    const template = await this.templateService.ensureTemplateForCatalogKey(
      payload.organizationId,
      payload.catalogKey,
    );

    const workflow = await this.prisma.orgWorkflow.findFirst({
      where: { id: template.workflowId, organizationId: payload.organizationId },
    });
    if (!workflow) {
      throw new Error(`Workflow template ${template.workflowId} not found`);
    }

    const event = this.buildDomainEvent(payload);

    if (mode === 'preview') {
      const plan = await this.dryRun.planWorkflow(workflow, event, {
        correlationId: randomUUID(),
      });
      const shadowPlan: WorkflowExecutionPlan = {
        ...plan,
        executionMode: WorkflowExecutionMode.SHADOW,
        message: 'Shadow evaluation — no actions executed.',
      };

      const wouldTrigger =
        shadowPlan.scope.passed
        && shadowPlan.conditions.passed
        && shadowPlan.plannedActions.length > 0
        && shadowPlan.policyBlockers.length === 0;

      const taskPreview = shadowPlan.plannedActions.find((a) => a.actionType === 'task.create');

      return {
        plan: shadowPlan,
        shadow: {
          catalogKey: payload.catalogKey,
          ruleId: payload.ruleId,
          dedupKey: payload.dedupKey,
          workflowId: template.workflowId,
          previewSummary: taskPreview?.preview?.title
            ? `Would create task "${taskPreview.preview.title}"`
            : wouldTrigger
              ? 'Workflow would execute planned actions'
              : 'Workflow would not trigger',
          plannedEffects: shadowPlan.plannedActions.map(
            (action) => `${action.actionType}:${action.status}`,
          ),
          wouldTrigger,
          wouldCreateApprovals: shadowPlan.wouldCreateApprovals,
          plannedActionCount: shadowPlan.plannedActions.length,
          policyBlockers: shadowPlan.policyBlockers,
        },
      };
    }

    const actionConfig = this.buildTaskCreateConfig(payload);
    const action: WorkflowActionDef = { type: 'task.create', config: actionConfig };
    const ctx = this.buildExecutionContext(payload, template.workflowId);

    const existing = await this.tasksService.findActiveByDedup(
      payload.organizationId,
      payload.dedupKey,
    );
    if (existing) {
      return { taskId: existing.id };
    }

    if (payload.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: payload.vehicleId, organizationId: payload.organizationId },
        select: { id: true },
      });
      if (!vehicle) {
        throw new Error('Vehicle not found in organization');
      }
    }

    const result = await this.actionExecutor.execute(action, ctx);
    if (result.status !== 'SUCCESS') {
      throw new Error(result.errorMessage ?? 'task.create failed in workflow bridge');
    }
    const taskId = typeof result.output?.taskId === 'string' ? result.output.taskId : undefined;
    return { taskId };
  }

  private buildDomainEvent(payload: TaskAutomationMaterializationPayload): WorkflowDomainEvent {
    return {
      organizationId: payload.organizationId,
      type: payload.eventType ?? 'task.automation.materialize',
      entityType: payload.entityType,
      entityId: payload.entityId,
      payload: {
        catalogKey: payload.catalogKey,
        ruleId: payload.ruleId,
        dedupKey: payload.dedupKey,
        bookingId: payload.bookingId,
        vehicleId: payload.vehicleId,
        title: payload.title,
        priority: payload.priority,
        type: payload.type,
        activatesAt: payload.activatesAt?.toISOString(),
        dueDate: payload.dueDate?.toISOString(),
      },
      occurredAt: new Date(),
      idempotencyKey: `task-auto:${payload.organizationId}:${payload.ruleId}:${payload.dedupKey}`,
    };
  }

  private buildTaskCreateConfig(payload: TaskAutomationMaterializationPayload): Record<string, unknown> {
    return {
      __payloadMerge: true,
      title: payload.title,
      description: payload.description,
      category: payload.category,
      priority: payload.priority,
      taskType: payload.type,
      sourceType: payload.sourceType,
      source: payload.source,
      vehicleId: payload.vehicleId ?? undefined,
      bookingId: payload.bookingId ?? undefined,
      customerId: payload.customerId ?? undefined,
      dedupKey: payload.dedupKey,
      withChecklist: payload.withChecklist,
      checklist: payload.checklist,
      dueDate: payload.dueDate?.toISOString(),
      activatesAt: payload.activatesAt?.toISOString(),
      automationRuleId: payload.ruleId,
      automationCatalogKey: payload.catalogKey,
      metadata: {
        ...(payload.metadata ?? {}),
        automationRuleId: payload.ruleId,
        automationCatalogKey: payload.catalogKey,
        dedupKey: payload.dedupKey,
        workflowRuntime: true,
      },
    };
  }

  private buildExecutionContext(
    payload: TaskAutomationMaterializationPayload,
    workflowId: string,
  ): ActionExecutionContext {
    const actionRunId = randomUUID();
    const workflowRunId = randomUUID();
    const idempotencyKey = `task-auto:${payload.organizationId}:${payload.ruleId}:${payload.dedupKey}`;
    return {
      organizationId: payload.organizationId,
      workflowRunId,
      actionRunId,
      workflowId,
      actionIndex: 0,
      eventType: payload.eventType ?? 'task.automation.materialize',
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      payload: {
        catalogKey: payload.catalogKey,
        ruleId: payload.ruleId,
        dedupKey: payload.dedupKey,
        bookingId: payload.bookingId,
        vehicleId: payload.vehicleId,
      },
      idempotencyKey,
      executionMode: WorkflowExecutionMode.LIVE,
    };
  }
}
