import { Injectable } from '@nestjs/common';
import type { WorkflowActionRun, WorkflowRun } from '@prisma/client';
import { WorkflowActionExecutorService } from '../workflow-action-executor.service';
import type { WorkflowActionDef } from '../workflow-definition.validator';
import type { WorkflowActionRunStatus } from './workflow-runtime-status.constants';

export interface CanonicalActionExecutionResult {
  status: WorkflowActionRunStatus;
  output?: Record<string, unknown>;
  errorMessage?: string;
  approvalId?: string;
  waitingUntil?: Date;
}

const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /connection/i,
  /temporarily unavailable/i,
  /rate limit/i,
];

@Injectable()
export class WorkflowRuntimeActionExecutorAdapter {
  constructor(private readonly legacyExecutor: WorkflowActionExecutorService) {}

  async execute(
    action: WorkflowActionDef,
    run: WorkflowRun,
    actionRun: WorkflowActionRun,
    attemptCount: number,
    maxAttempts: number,
  ): Promise<CanonicalActionExecutionResult> {
    const inputPayload =
      run.inputPayload && typeof run.inputPayload === 'object' && !Array.isArray(run.inputPayload)
        ? (run.inputPayload as Record<string, unknown>)
        : {};

    const result = await this.legacyExecutor.execute(action, {
      organizationId: run.organizationId,
      workflowId: run.workflowDefinitionId,
      workflowRunId: run.id,
      actionRunId: actionRun.id,
      actionIndex: actionRun.actionIndex,
      eventType: run.eventType,
      entityType: run.entityType,
      entityId: run.entityId,
      payload: inputPayload,
      idempotencyKey: run.idempotencyKey,
    });

    return this.mapLegacyResult(result, attemptCount, maxAttempts);
  }

  private mapLegacyResult(
    result: Awaited<ReturnType<WorkflowActionExecutorService['execute']>>,
    attemptCount: number,
    maxAttempts: number,
  ): CanonicalActionExecutionResult {
    if (result.status === 'SUCCESS') {
      return { status: 'SUCCEEDED', output: result.output };
    }

    if (result.status === 'WAITING_APPROVAL') {
      return {
        status: 'WAITING_FOR_APPROVAL',
        output: result.output,
      };
    }

    if (result.status === 'FAILED') {
      const message = result.errorMessage ?? 'Action failed';
      if (attemptCount < maxAttempts && this.isRetryableError(message)) {
        return {
          status: 'FAILED_RETRYABLE',
          errorMessage: message,
        };
      }
      return {
        status: 'FAILED_PERMANENT',
        errorMessage: message,
      };
    }

    return {
      status: 'FAILED_PERMANENT',
      errorMessage: `Unsupported legacy action status: ${result.status}`,
    };
  }

  private isRetryableError(message: string): boolean {
    return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  }

  buildActionDef(actionRun: WorkflowActionRun): WorkflowActionDef {
    const input =
      actionRun.input && typeof actionRun.input === 'object' && !Array.isArray(actionRun.input)
        ? (actionRun.input as Record<string, unknown>)
        : {};
    return {
      type: actionRun.actionType,
      config: input,
      requiresApproval: actionRun.requiresApproval,
    };
  }
}
