import { Injectable } from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult } from '../workflow-action-registry.types';
import type { ApprovalRequestActionConfig } from '../adapters/workflow-action-adapter.types';
import { WorkflowActionApprovalService } from '../adapters/workflow-action-approval.service';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

@Injectable()
export class ApprovalRequestActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'approval.request',
    version: '1.0.0',
    capabilityStatus: 'ENABLED',
    riskClass: 'MEDIUM',
    requiredPermission: 'WORKFLOW_EXECUTE',
    requiresApproval: false,
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        message: { type: 'string' },
        approverRoleScope: {
          type: 'string',
          enum: ['ORG_ADMIN', 'SUB_ADMIN', 'FLEET_MANAGER', 'OPERATIONS'],
        },
        ttlHours: { type: 'number' },
      },
    },
  });

  constructor(private readonly approvalService: WorkflowActionApprovalService) {
    super();
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    return [
      'Create durable approval gate — workflow pauses until decision',
      typeof config.message === 'string' ? config.message : 'Approval requested',
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const parsed = config as ApprovalRequestActionConfig;
    const result = await this.approvalService.requestApproval({
      ctx,
      actionType: 'approval.request',
      message: parsed.message,
      approverRoleScope: parsed.approverRoleScope,
    });

    return {
      status: 'WAITING_APPROVAL',
      idempotentReplay: !result.created,
      output: {
        approvalId: result.approvalId,
        waitingApproval: true,
        auditId: result.auditId,
        created: result.created,
      },
    };
  }
}
