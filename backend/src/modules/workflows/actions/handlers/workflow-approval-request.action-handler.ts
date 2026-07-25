import { Injectable } from '@nestjs/common';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type { WorkflowActionExecuteResult } from '../workflow-action-registry.types';
import { WorkflowActionApprovalService } from '../adapters/workflow-action-approval.service';
import { BaseWorkflowActionHandler } from './base-workflow-action.handler';

/** @deprecated Use `approval.request` — kept for legacy workflow definitions. */
@Injectable()
export class WorkflowApprovalRequestActionHandler extends BaseWorkflowActionHandler {
  readonly definition = this.buildDefinition({
    type: 'workflow.approval.request',
    version: '1.0.0',
    capabilityStatus: 'DEPRECATED',
    riskClass: 'MEDIUM',
    requiredPermission: 'WORKFLOW_EXECUTE',
    requiresApproval: false,
    configSchema: {
      schemaVersion: '1.0.0',
      additionalProperties: false,
      properties: {
        message: { type: 'string' },
      },
    },
  });

  constructor(private readonly approvalService: WorkflowActionApprovalService) {
    super();
  }

  protected describePlannedEffects(config: Record<string, unknown>): string[] {
    return [
      'Create approval gate (legacy alias of approval.request)',
      typeof config.message === 'string' ? config.message : 'Approval requested',
    ];
  }

  async execute(
    config: Record<string, unknown>,
    ctx: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecuteResult> {
    const result = await this.approvalService.requestApproval({
      ctx,
      actionType: 'workflow.approval.request',
      message: typeof config.message === 'string' ? config.message : undefined,
    });
    return {
      status: 'WAITING_APPROVAL',
      idempotentReplay: !result.created,
      output: {
        approvalId: result.approvalId,
        waitingApproval: true,
        auditId: result.auditId,
        legacyAlias: true,
      },
    };
  }
}
