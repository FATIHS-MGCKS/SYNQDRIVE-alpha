import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  createWorkflowActionPiiSafeLogger,
  WorkflowActionNoopSecretsResolver,
  WorkflowActionRegistryExecutorService,
} from '../actions';
import type { TaskAutomationMaterializationPayload, TaskAutomationShadowResult } from './task-automation-workflow-bridge.types';
import { TaskAutomationWorkflowTemplateService } from './task-automation-workflow-template.service';

@Injectable()
export class TaskAutomationWorkflowMaterializerService {
  private readonly logger = new Logger(TaskAutomationWorkflowMaterializerService.name);

  constructor(
    private readonly registryExecutor: WorkflowActionRegistryExecutorService,
    private readonly templateService: TaskAutomationWorkflowTemplateService,
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
    const ctx = this.buildExecutionContext(payload, template.workflowId);

    if (mode === 'preview') {
      const preview = await this.registryExecutor.preview('task.create', actionConfig, ctx);
      return {
        shadow: {
          catalogKey: payload.catalogKey,
          ruleId: payload.ruleId,
          dedupKey: payload.dedupKey,
          previewSummary: preview.summary,
          plannedEffects: preview.plannedEffects,
        },
      };
    }

    const result = await this.registryExecutor.execute('task.create', actionConfig, ctx);
    if (result.status === 'FAILED') {
      throw new Error(result.errorMessage ?? 'task.create failed in workflow bridge');
    }
    return { taskId: typeof result.output?.taskId === 'string' ? result.output.taskId : undefined };
  }

  private buildTaskCreateConfig(payload: TaskAutomationMaterializationPayload): Record<string, unknown> {
    return {
      title: payload.title,
      description: payload.description,
      category: payload.category,
      priority: payload.priority,
      vehicleId: payload.vehicleId ?? undefined,
      bookingId: payload.bookingId ?? undefined,
      customerId: payload.customerId ?? undefined,
      dedupKey: payload.dedupKey,
      taskType: payload.type,
      sourceType: payload.sourceType,
      source: payload.source,
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
  ) {
    const actionRunId = randomUUID();
    const workflowRunId = randomUUID();
    const idempotencyKey = `task-auto:${payload.organizationId}:${payload.ruleId}:${payload.dedupKey}`;
    return {
      organizationId: payload.organizationId,
      workflowRunId,
      actionRunId,
      workflowId,
      actionIndex: 0,
      idempotencyKey,
      event: {
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
        correlationId: idempotencyKey,
      },
      workflowSnapshot: {},
      policySnapshot: {},
      scopeType: 'organization',
      actor: {
        kind: 'system' as const,
        permissions: ['WORKFLOW_EXECUTE'],
      },
      correlationId: idempotencyKey,
      secretsResolver: new WorkflowActionNoopSecretsResolver(),
      logger: createWorkflowActionPiiSafeLogger(`task-auto-bridge:${payload.catalogKey}`),
    };
  }
}
