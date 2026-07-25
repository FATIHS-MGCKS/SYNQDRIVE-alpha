import { Injectable } from '@nestjs/common';
import { TasksService } from '@modules/tasks/tasks.service';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult } from '../workflow-action-registry.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class NotificationPrepareActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'notification.prepare',
    version: '1.0.0',
    capabilityStatus: 'DEPRECATED',
    riskClass: 'LOW',
    requiredPermission: 'WORKFLOW_EXECUTE',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        message: { type: 'string' },
        target: { type: 'string', enum: ['admin', 'customer', 'fleet'] },
      },
    },
  });

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  protected describePlannedEffects(): string[] {
    return ['Prepare notification draft task only — no outbound send'];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const message =
      (typeof config.message === 'string' && config.message) ||
      'Notification draft prepared by workflow';
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:notification`;
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title: 'Notification draft (not sent)',
      description: message,
      category: 'workflow_notification',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_NOTIFICATION_PREPARE',
      priority: 'LOW',
      vehicleId: this.vehicleIdFromContext(ctx) ?? null,
      bookingId: this.bookingIdFromContext(ctx) ?? null,
      metadata: { target: config.target ?? 'admin', preparedOnly: true },
    });
    return { status: 'SUCCESS', output: { preparedOnly: true, taskId: task.id } };
  }
}
