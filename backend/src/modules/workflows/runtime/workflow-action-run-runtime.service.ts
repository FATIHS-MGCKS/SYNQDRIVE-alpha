import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';
import {
  type WorkflowActionRunStatus,
} from './workflow-runtime-status.constants';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';
import { assertWorkflowActionRunTransitionOrThrow } from './workflow-runtime-status.transitions';
import { buildWorkflowActionRunStatusFields } from './workflow-runtime-status.util';
import type { WorkflowActionRunStatusTransitionInput } from './workflow-runtime-status.types';

@Injectable()
export class WorkflowActionRunRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
    private readonly runs: WorkflowRunRuntimeRepository,
    private readonly runRuntime: WorkflowRunRuntimeService,
    private readonly audit: WorkflowRuntimeStatusAuditService,
  ) {}

  async getActionRun(orgId: string, actionRunId: string) {
    return this.actionRuns.findByIdOrThrow(orgId, actionRunId);
  }

  async listByRun(orgId: string, workflowRunId: string) {
    await this.runs.findByIdOrThrow(orgId, workflowRunId);
    return this.actionRuns.listByRun(orgId, workflowRunId);
  }

  async listResumableActionRuns(orgId: string) {
    return this.actionRuns.listResumable(orgId);
  }

  async transitionStatus(
    orgId: string,
    actionRunId: string,
    input: WorkflowActionRunStatusTransitionInput,
  ) {
    const actionRun = await this.actionRuns.findByIdOrThrow(orgId, actionRunId);
    const fromStatus = actionRun.status as WorkflowActionRunStatus;
    const toStatus = input.toStatus;

    assertWorkflowActionRunTransitionOrThrow(fromStatus, toStatus);

    if (actionRun.lockVersion !== input.expectedLockVersion) {
      throw new ConflictException({
        message: 'Workflow action run was modified concurrently',
        code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.LOCK_CONFLICT,
        currentLockVersion: actionRun.lockVersion,
      });
    }

    const fields = buildWorkflowActionRunStatusFields(fromStatus, toStatus, {
      waitingUntil: input.waitingUntil,
      approvalId: input.approvalId,
      nextAttemptAt: input.nextAttemptAt,
      attemptCount: actionRun.attemptCount,
    });

    await this.prisma.$transaction(async (tx) => {
      const count = await this.actionRuns.transitionStatus(tx, {
        orgId,
        actionRunId,
        fromStatus,
        expectedLockVersion: input.expectedLockVersion,
        toStatus,
        waitingUntil: fields.waitingUntil,
        approvalId: fields.approvalId,
        finishedAt: fields.finishedAt,
        attemptCount: fields.attemptCount,
        nextAttemptAt: fields.nextAttemptAt,
        errorMessage: input.errorMessage,
      });
      if (count === 0) {
        throw new ConflictException({
          message: 'Workflow action run status transition conflict',
          code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.LOCK_CONFLICT,
        });
      }

      await this.audit.recordActionRunTransition(tx, {
        orgId,
        workflowRunId: actionRun.workflowRunId,
        actionRunId,
        fromStatus,
        toStatus,
        actor: input.actor,
        reason: input.reason,
        metadata: {
          attemptCount: fields.attemptCount,
          nextAttemptAt: fields.nextAttemptAt?.toISOString() ?? null,
        },
      });
    });

    await this.runRuntime.deriveAndApplyRunStatus(
      orgId,
      actionRun.workflowRunId,
      input.actor,
      'Derived after action run transition',
    );

    return this.actionRuns.findByIdOrThrow(orgId, actionRunId);
  }
}
