import { Injectable } from '@nestjs/common';
import { TaskPriority } from '@prisma/client';
import { TasksService } from '@modules/tasks/tasks.service';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult } from '../workflow-action-registry.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class AlertCreateActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'alert.create',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'MEDIUM',
    requiredPermission: 'WORKFLOW_EXECUTE',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        message: { type: 'string', required: true },
        severity: { type: 'string', enum: ['info', 'warning', 'high', 'critical', 'urgent'] },
      },
    },
  });

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    return ['Create workflow alert task (prepared, idempotent)'];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const message =
      (typeof config.message === 'string' && config.message) || 'Workflow alert';
    const severity = String(config.severity ?? 'warning').toLowerCase();
    const priority: TaskPriority =
      severity === 'critical' || severity === 'urgent'
        ? 'CRITICAL'
        : severity === 'high'
          ? 'HIGH'
          : 'NORMAL';
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:alert`;
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title: `Alert: ${message.slice(0, 120)}`,
      description: message,
      category: 'workflow_alert',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_ALERT',
      priority,
      vehicleId: this.vehicleIdFromContext(ctx) ?? null,
      bookingId: this.bookingIdFromContext(ctx) ?? null,
      metadata: { severity, workflowRunId: ctx.workflowRunId },
    });
    return { status: 'SUCCESS', output: { alertTaskId: task.id, preparedOnly: true } };
  }
}
