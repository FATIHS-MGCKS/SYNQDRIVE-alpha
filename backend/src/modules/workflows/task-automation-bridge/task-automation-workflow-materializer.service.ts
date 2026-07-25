import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { WorkflowActionPreviewService } from '../workflow-action-preview.service';
import {
  WorkflowActionExecutorService,
  type ActionExecutionContext,
} from '../workflow-action-executor.service';
import { WorkflowExecutionMode } from '../workflow-execution-mode';
import type { WorkflowActionDef } from '../workflow-definition.validator';
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
    private readonly templateService: TaskAutomationWorkflowTemplateService,
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  async materializeViaWorkflow(
    payload: TaskAutomationMaterializationPayload,
    mode: 'execute' | 'preview',
  ): Promise<{ taskId?: string; shadow?: TaskAutomationShadowResult }> {
    const template = await this.templateService.ensureTemplateForCatalogKey(
      payload.organizationId,
      payload.catalogKey,
    );

    const actionConfig = this.buildTaskCreateConfig(payload);
    const action: WorkflowActionDef = { type: 'task.create', config: actionConfig };
    const ctx = this.buildExecutionContext(payload, template.workflowId);

    if (mode === 'preview') {
      const planned = await this.actionPreview.previewAction({
        action,
        index: 0,
        ctx: {
          organizationId: ctx.organizationId,
          payload: ctx.payload,
          entityType: ctx.entityType,
          entityId: ctx.entityId,
          eventType: ctx.eventType,
        },
      });
      return {
        shadow: {
          catalogKey: payload.catalogKey,
          ruleId: payload.ruleId,
          dedupKey: payload.dedupKey,
          previewSummary: planned.preview?.title
            ? `Would create task "${planned.preview.title}"`
            : 'Would create task via workflow runtime',
          plannedEffects: [
            `task.create dedup=${payload.dedupKey}`,
            `workflow=${template.workflowId}`,
          ],
        },
      };
    }

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
