import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { deriveWorkflowRunStatusFromActions } from './workflow-run-status.derivation';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';
import {
  type WorkflowActionRunStatus,
  type WorkflowRunStatus,
} from './workflow-runtime-status.constants';
import {
  assertWorkflowRunTransition,
  assertWorkflowRunTransitionOrThrow,
} from './workflow-runtime-status.transitions';
import { buildWorkflowRunStatusFields } from './workflow-runtime-status.util';
import type { WorkflowRunStatusTransitionInput } from './workflow-runtime-status.types';

@Injectable()
export class WorkflowRunRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: WorkflowRunRuntimeRepository,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
    private readonly audit: WorkflowRuntimeStatusAuditService,
  ) {}

  async getRun(orgId: string, runId: string) {
    return this.runs.findByIdOrThrow(orgId, runId);
  }

  async listStatusTransitions(orgId: string, runId: string) {
    await this.runs.findByIdOrThrow(orgId, runId);
    return this.audit.listForRun(orgId, runId);
  }

  async listResumableRuns(orgId: string) {
    return this.runs.listResumable(orgId);
  }

  async transitionStatus(orgId: string, runId: string, input: WorkflowRunStatusTransitionInput) {
    const run = await this.runs.findByIdOrThrow(orgId, runId);
    const fromStatus = run.status as WorkflowRunStatus;
    const toStatus = input.toStatus;

    assertWorkflowRunTransitionOrThrow(fromStatus, toStatus);

    if (run.lockVersion !== input.expectedLockVersion) {
      throw new ConflictException({
        message: 'Workflow run was modified concurrently',
        code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.LOCK_CONFLICT,
        currentLockVersion: run.lockVersion,
      });
    }

    const fields = buildWorkflowRunStatusFields(toStatus, {
      waitingUntil: input.waitingUntil,
      approvalId: input.approvalId,
    });

    await this.prisma.$transaction(async (tx) => {
      const count = await this.runs.transitionStatus(tx, {
        orgId,
        runId,
        fromStatus,
        expectedLockVersion: input.expectedLockVersion,
        toStatus,
        waitingUntil: fields.waitingUntil,
        approvalId: fields.approvalId,
        finishedAt: fields.finishedAt,
        errorMessage: input.errorMessage,
      });
      if (count === 0) {
        throw new ConflictException({
          message: 'Workflow run status transition conflict',
          code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.LOCK_CONFLICT,
        });
      }

      await this.audit.recordRunTransition(tx, {
        orgId,
        workflowRunId: runId,
        fromStatus,
        toStatus,
        actor: input.actor,
        reason: input.reason,
      });
    });

    return this.runs.findByIdOrThrow(orgId, runId);
  }

  /**
   * Recomputes run status from child action runs when all actions are terminal
   * or the aggregate active state changes.
   */
  async deriveAndApplyRunStatus(
    orgId: string,
    runId: string,
    actor: WorkflowRunStatusTransitionInput['actor'],
    reason?: string,
  ) {
    const run = await this.runs.findByIdOrThrow(orgId, runId);
    const actions = await this.actionRuns.listByRun(orgId, runId);
    const derived = deriveWorkflowRunStatusFromActions(
      actions.map((a) => ({
        status: a.status as WorkflowActionRunStatus,
        blockingOnFailure: a.blockingOnFailure,
        partialFailure: a.partialFailure,
        isFallbackRun: a.isFallbackRun,
      })),
    );

    if (!derived || derived === (run.status as WorkflowRunStatus)) {
      return run;
    }

    const decision = assertWorkflowRunTransition(run.status as WorkflowRunStatus, derived);
    if (!decision.allowed) {
      return run;
    }

    return this.transitionStatus(orgId, runId, {
      toStatus: derived,
      expectedLockVersion: run.lockVersion,
      actor,
      reason: reason ?? 'Derived from action run statuses',
    });
  }
}
