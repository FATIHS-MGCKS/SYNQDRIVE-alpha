import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult } from '../workflow-action-registry.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class AiSuggestActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'ai.suggest_action',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'CRITICAL',
    requiresApproval: true,
    requiredPermission: 'WORKFLOW_AI_SUGGEST',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
      },
    },
  });

  constructor(
    private readonly tasksService: TasksService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  protected describePlannedEffects(): string[] {
    return ['Create AI suggestion task and approval gate — no auto-execution'];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const dedupKey = `${ctx.idempotencyKey}:action:${ctx.actionIndex}:ai_suggest`;
    const task = await this.tasksService.upsertByDedup(ctx.organizationId, dedupKey, {
      title: 'AI action suggestion (approval required)',
      description:
        (typeof config.summary === 'string' && config.summary) ||
        'Workflow generated an AI suggestion. Review before any action.',
      category: 'workflow_ai',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'WORKFLOW_AI_SUGGEST',
      priority: 'NORMAL',
      vehicleId: this.vehicleIdFromContext(ctx) ?? null,
      bookingId: this.bookingIdFromContext(ctx) ?? null,
      metadata: {
        suggestionOnly: true,
        config: config ?? {},
      } as Prisma.InputJsonValue,
    });
    await this.prisma.orgWorkflowApproval.create({
      data: {
        organizationId: ctx.organizationId,
        workflowRunId: ctx.workflowRunId,
        actionRunId: ctx.actionRunId,
        status: 'PENDING',
        requestedBySystem: true,
        reason: 'AI suggestion requires human approval',
      },
    });
    return {
      status: 'WAITING_APPROVAL',
      output: { suggestionTaskId: task.id, suggestionOnly: true },
    };
  }
}
