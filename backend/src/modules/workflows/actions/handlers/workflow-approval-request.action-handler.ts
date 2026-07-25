import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult } from '../workflow-action-registry.types';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class WorkflowApprovalRequestActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'workflow.approval.request',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'MEDIUM',
    requiresApproval: true,
    requiredPermission: 'WORKFLOW_EXECUTE',
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        message: { type: 'string' },
      },
    },
  });

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    return [
      'Create approval gate — no side effects until approved',
      typeof config.message === 'string' ? config.message : 'Approval requested',
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    await this.prisma.orgWorkflowApproval.create({
      data: {
        organizationId: ctx.organizationId,
        workflowRunId: ctx.workflowRunId,
        actionRunId: ctx.actionRunId,
        status: 'PENDING',
        requestedBySystem: true,
        reason:
          (typeof config.message === 'string' && config.message) ||
          'Workflow approval requested',
      },
    });
    return {
      status: 'WAITING_APPROVAL',
      output: { waitingApproval: true },
    };
  }
}
