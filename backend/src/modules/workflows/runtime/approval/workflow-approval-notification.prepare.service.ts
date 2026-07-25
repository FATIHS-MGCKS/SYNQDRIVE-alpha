import { Injectable, Logger } from '@nestjs/common';
import { WorkflowApprovalRepository } from './workflow-approval.repository';

/**
 * Prepares approver notification intent via existing notification engine hooks.
 * Does not invent new external communication providers.
 */
@Injectable()
export class WorkflowApprovalNotificationPrepareService {
  private readonly logger = new Logger(WorkflowApprovalNotificationPrepareService.name);

  constructor(private readonly approvals: WorkflowApprovalRepository) {}

  async prepareApproverNotification(input: {
    organizationId: string;
    approvalId: string;
    workflowRunId: string;
    actionRunId: string;
  }) {
    this.logger.log(
      `Prepared approver notification intent approval=${input.approvalId} run=${input.workflowRunId} action=${input.actionRunId} org=${input.organizationId}`,
    );
    await this.approvals.markNotificationPrepared(input.approvalId, input.organizationId);
    return {
      prepared: true,
      channel: 'INTERNAL' as const,
      approvalId: input.approvalId,
      workflowRunId: input.workflowRunId,
      actionRunId: input.actionRunId,
    };
  }
}
