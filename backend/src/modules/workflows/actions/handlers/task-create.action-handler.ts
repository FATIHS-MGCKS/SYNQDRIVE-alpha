import { Injectable } from '@nestjs/common';
import { TaskPriority } from '@prisma/client';
import { TasksService } from '@modules/tasks/tasks.service';
import { normalizeTaskPriority } from '@modules/tasks/task-priority.util';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult } from '../workflow-action-registry.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class TaskCreateActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'task.create',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'LOW',
    requiredPermission: 'WORKFLOW_EXECUTE',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        title: { type: 'string', required: true, description: 'Task title' },
        description: { type: 'string' },
        category: { type: 'string' },
        priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] },
      },
    },
  });

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    const title = typeof config.title === 'string' ? config.title : 'Workflow task';
    return [`Upsert task "${title}" (idempotent)`];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const title =
      (typeof config.title === 'string' && config.title.trim()) || 'Workflow task';
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:task`;
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title,
      description: typeof config.description === 'string' ? config.description : undefined,
      category: typeof config.category === 'string' ? config.category : 'workflow',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_AUTOMATION',
      priority: normalizeTaskPriority(String(config.priority ?? '')) as TaskPriority,
      vehicleId: this.vehicleIdFromContext(ctx) ?? null,
      bookingId: this.bookingIdFromContext(ctx) ?? null,
      metadata: {
        workflowId: ctx.workflowId,
        workflowRunId: ctx.workflowRunId,
        eventType: ctx.event.eventType,
      },
    });
    ctx.logger.log('task.create executed', { taskId: task.id, actionRunId: ctx.actionRunId });
    return { status: 'SUCCESS', output: { taskId: task.id } };
  }
}
