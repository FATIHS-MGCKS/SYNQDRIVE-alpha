import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskPriority } from '@prisma/client';
import { normalizeTaskPriority } from '@modules/tasks/task-priority.util';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult, WorkflowActionValidationResult } from '../workflow-action-registry.types';
import { WorkflowActionAuditService } from '../adapters/workflow-action-audit.service';
import type { TaskCreateActionConfig } from '../adapters/workflow-action-adapter.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class TaskCreateActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'task.create',
    version: '1.1.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'LOW',
    requiredPermission: 'WORKFLOW_EXECUTE',
    configSchema: {
      schemaVersion: '1.1.0',
      additionalProperties: false,
      properties: {
        title: { type: 'string', required: true, description: 'Task title' },
        description: { type: 'string' },
        category: { type: 'string' },
        priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] },
        vehicleId: { type: 'string' },
        bookingId: { type: 'string' },
        customerId: { type: 'string' },
      },
    },
  });

  constructor(
    private readonly tasksService: TasksService,
    private readonly prisma: PrismaService,
    private readonly audit: WorkflowActionAuditService,
  ) {
    super();
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    const title = typeof config.title === 'string' ? config.title : 'Workflow task';
    return [`Upsert task "${title}" with workflow provenance (idempotent)`];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as unknown as TaskCreateActionConfig;
    const title = parsed.title?.trim() || 'Workflow task';
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:task`;

    const existing = await this.tasksService.findActiveByDedup(ctx.organizationId, dedupKey);
    if (existing) {
      const audit = this.audit.record(ctx, 'task.create', 'duplicate', 'Task already exists for dedup key', {
        taskId: existing.id,
      });
      return {
        status: 'SUCCESS',
        idempotentReplay: true,
        output: { taskId: existing.id, auditId: audit.auditId },
      };
    }

    const vehicleId = parsed.vehicleId ?? this.vehicleIdFromContext(ctx) ?? null;
    const bookingId = parsed.bookingId ?? this.bookingIdFromContext(ctx) ?? null;
    let customerId = parsed.customerId ?? null;

    if (bookingId && !customerId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId: ctx.organizationId },
        select: { customerId: true },
      });
      if (!booking) {
        return {
          status: 'FAILED',
          errorMessage: 'Booking not found in organization',
          errorCategory: 'NOT_FOUND',
        };
      }
      customerId = booking.customerId;
    }

    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!vehicle) {
        return {
          status: 'FAILED',
          errorMessage: 'Vehicle not found in organization',
          errorCategory: 'NOT_FOUND',
        };
      }
    }

    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title,
      description: parsed.description,
      category: parsed.category ?? 'workflow',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_AUTOMATION',
      priority: normalizeTaskPriority(String(parsed.priority ?? '')) as TaskPriority,
      vehicleId,
      bookingId,
      customerId,
      metadata: {
        workflowId: ctx.workflowId,
        workflowRunId: ctx.workflowRunId,
        actionRunId: ctx.actionRunId,
        eventType: ctx.event.eventType,
        provenance: 'workflow',
      },
    });

    const audit = this.audit.record(ctx, 'task.create', 'execute', `Task created: ${task.id}`, {
      taskId: task.id,
      bookingId,
      vehicleId,
      customerId,
    });
    return { status: 'SUCCESS', output: { taskId: task.id, auditId: audit.auditId } };
  }
}
