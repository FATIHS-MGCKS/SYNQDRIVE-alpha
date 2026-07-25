import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';

export interface WorkflowActionAuditEntry {
  auditId: string;
  organizationId: string;
  actionType: string;
  actionRunId: string;
  workflowRunId: string;
  outcome: 'preview' | 'execute' | 'duplicate' | 'denied';
  summary: string;
  metadata?: Record<string, unknown>;
  recordedAt: string;
}

@Injectable()
export class WorkflowActionAuditService {
  private readonly logger = new Logger(WorkflowActionAuditService.name);

  record(
    ctx: WorkflowActionExecutionContext,
    actionType: string,
    outcome: WorkflowActionAuditEntry['outcome'],
    summary: string,
    metadata?: Record<string, unknown>,
  ): WorkflowActionAuditEntry {
    const entry: WorkflowActionAuditEntry = {
      auditId: randomUUID(),
      organizationId: ctx.organizationId,
      actionType,
      actionRunId: ctx.actionRunId,
      workflowRunId: ctx.workflowRunId,
      outcome,
      summary,
      metadata,
      recordedAt: new Date().toISOString(),
    };
    ctx.logger.log(`audit:${outcome}`, {
      auditId: entry.auditId,
      actionType,
      actionRunId: ctx.actionRunId,
    });
    this.logger.log(
      JSON.stringify({
        type: 'workflow_action_audit',
        ...entry,
      }),
    );
    return entry;
  }
}
