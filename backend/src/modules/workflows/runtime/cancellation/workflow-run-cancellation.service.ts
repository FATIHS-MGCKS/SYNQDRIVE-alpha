import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { OrganizationStatus } from '@prisma/client';
import { WorkflowActionRunRuntimeRepository } from '../workflow-action-run-runtime.repository';
import { WorkflowRunRuntimeRepository } from '../workflow-run-runtime.repository';
import { WorkflowRuntimeStatusAuditService } from '../workflow-runtime-status-audit.service';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from '../workflow-runtime-status.errors';
import {
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  type WorkflowActionRunStatus,
  type WorkflowRunStatus,
} from '../workflow-runtime-status.constants';
import { assertWorkflowRunTransitionOrThrow } from '../workflow-runtime-status.transitions';
import { WorkflowApprovalRepository } from '../approval/workflow-approval.repository';
import { WorkflowTimerRepository } from './workflow-timer.repository';
import {
  WORKFLOW_CANCELLATION_ERROR_CODES,
  type WorkflowRunCancelInput,
  type WorkflowRunCancelResult,
  type WorkflowRunStatusView,
} from './workflow-run-cancellation.types';

const CANCELLABLE_ACTION_STATUSES: WorkflowActionRunStatus[] = [
  'PENDING',
  'RUNNING',
  'WAITING',
  'WAITING_FOR_APPROVAL',
  'FAILED_RETRYABLE',
];

const LOCKED_ORG_STATUSES: OrganizationStatus[] = ['ARCHIVED', 'SUSPENDED'];

@Injectable()
export class WorkflowRunCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: WorkflowRunRuntimeRepository,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
    private readonly approvals: WorkflowApprovalRepository,
    private readonly timers: WorkflowTimerRepository,
    private readonly audit: WorkflowRuntimeStatusAuditService,
  ) {}

  async getRunStatusView(orgId: string, runId: string): Promise<WorkflowRunStatusView> {
    const run = await this.runs.findByIdOrThrow(orgId, runId);
    const actions = await this.actionRuns.listByRun(orgId, runId);

    const succeeded = actions.filter((a) => a.status === 'SUCCEEDED').length;
    const cancelled = actions.filter((a) => a.status === 'CANCELLED').length;
    const failed = actions.filter(
      (a) => a.status === 'FAILED_PERMANENT' || a.status === 'FAILED_RETRYABLE',
    ).length;
    const pending = actions.filter(
      (a) => !TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(a.status as WorkflowActionRunStatus),
    ).length;

    return {
      id: run.id,
      organizationId: run.organizationId,
      status: run.status,
      eventType: run.eventType,
      entityType: run.entityType,
      entityId: run.entityId,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      cancelledAt: run.cancelledAt?.toISOString() ?? null,
      cancelReason: run.cancelReason,
      cancelledByActorType: run.cancelledByActorType,
      errorMessage: run.errorMessage,
      actionSummary: {
        total: actions.length,
        succeeded,
        cancelled,
        failed,
        pending,
      },
    };
  }

  async cancelRun(input: WorkflowRunCancelInput): Promise<WorkflowRunCancelResult> {
    const run = await this.runs.findByIdOrThrow(input.organizationId, input.runId);

    if (run.organizationId !== input.organizationId) {
      throw new NotFoundException({
        message: 'Cross-tenant cancellation denied',
        code: WORKFLOW_CANCELLATION_ERROR_CODES.TENANT_VIOLATION,
      });
    }

    if (TERMINAL_WORKFLOW_RUN_STATUSES.has(run.status as WorkflowRunStatus)) {
      throw new ConflictException({
        message: 'Workflow run is already terminal',
        code: WORKFLOW_CANCELLATION_ERROR_CODES.ALREADY_TERMINAL,
        status: run.status,
      });
    }

    const lockVersion = input.expectedLockVersion ?? run.lockVersion;
    if (lockVersion !== run.lockVersion) {
      throw new ConflictException({
        message: 'Workflow run was modified concurrently',
        code: WORKFLOW_CANCELLATION_ERROR_CODES.LOCK_CONFLICT,
        currentLockVersion: run.lockVersion,
      });
    }

    assertWorkflowRunTransitionOrThrow(run.status as WorkflowRunStatus, 'CANCELLED');

    const now = new Date();
    let cancelledActions = 0;
    let providerUnclearActions = 0;
    let cancelledApprovals = 0;
    let cancelledTimers = 0;

    const actions = await this.actionRuns.listByRun(input.organizationId, input.runId);

    await this.prisma.$transaction(async (tx) => {
      for (const action of actions) {
        const status = action.status as WorkflowActionRunStatus;
        if (TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(status)) {
          continue;
        }
        if (!CANCELLABLE_ACTION_STATUSES.includes(status)) {
          continue;
        }

        const hasProviderHandoff = status === 'RUNNING' && !!action.providerReference;
        const toStatus = hasProviderHandoff ? 'FAILED_PERMANENT' : 'CANCELLED';

        const count = await this.actionRuns.forceTerminate(tx, {
          orgId: input.organizationId,
          actionRunId: action.id,
          fromStatuses: CANCELLABLE_ACTION_STATUSES,
          toStatus,
          errorCode: hasProviderHandoff
            ? WORKFLOW_CANCELLATION_ERROR_CODES.PROVIDER_STATE_UNKNOWN
            : 'WORKFLOW_RUN_CANCELLED',
          errorCategory: hasProviderHandoff ? 'PROVIDER_UNCLEAR' : 'CANCELLED',
          errorSummary: hasProviderHandoff
            ? 'Run cancelled while provider state is unknown — not safely stopped'
            : input.reason,
          finishedAt: now,
        });

        if (count > 0) {
          if (hasProviderHandoff) {
            providerUnclearActions += 1;
          } else {
            cancelledActions += 1;
          }

          await this.audit.recordActionRunTransition(tx, {
            orgId: input.organizationId,
            workflowRunId: input.runId,
            actionRunId: action.id,
            fromStatus: status,
            toStatus,
            actor: input.actor,
            reason: input.reason,
            metadata: {
              cancellationSource: input.source,
              providerReference: action.providerReference,
              providerStateUnclear: hasProviderHandoff,
            },
          });

          const timerResult = await this.timers.cancelScheduledForAction(
            tx,
            input.organizationId,
            action.id,
            now,
          );
          cancelledTimers += timerResult.count;
        }
      }

      const pendingApprovals = await this.approvals.listActiveForRun(
        input.organizationId,
        input.runId,
        tx,
      );

      for (const approval of pendingApprovals) {
        const count = await this.approvals.decide(tx, {
          orgId: input.organizationId,
          approvalId: approval.id,
          fromStatus: approval.status,
          toStatus: 'CANCELLED',
          approvedByUserId: input.userId ?? 'system',
          reason: input.reason,
        });
        if (count > 0) {
          cancelledApprovals += 1;
          const timerResult = await this.timers.cancelScheduledForApproval(
            tx,
            input.organizationId,
            approval.id,
            now,
          );
          cancelledTimers += timerResult.count;
        }
      }

      const runTimerResult = await this.timers.cancelScheduledForRun(
        tx,
        input.organizationId,
        input.runId,
        now,
      );
      cancelledTimers += runTimerResult.count;

      const runCount = await this.runs.transitionStatus(tx, {
        orgId: input.organizationId,
        runId: input.runId,
        fromStatus: run.status,
        expectedLockVersion: lockVersion,
        toStatus: 'CANCELLED',
        waitingUntil: null,
        approvalId: null,
        finishedAt: now,
        errorMessage: input.reason,
        cancelledAt: now,
        cancelledByUserId: input.userId ?? null,
        cancelledByActorType: input.actor.type,
        cancelReason: input.reason,
      });

      if (runCount === 0) {
        throw new ConflictException({
          message: 'Workflow run cancellation conflict',
          code: WORKFLOW_CANCELLATION_ERROR_CODES.LOCK_CONFLICT,
        });
      }

      await this.audit.recordRunTransition(tx, {
        orgId: input.organizationId,
        workflowRunId: input.runId,
        fromStatus: run.status,
        toStatus: 'CANCELLED',
        actor: input.actor,
        reason: input.reason,
        metadata: {
          cancellationSource: input.source,
          cancelledActions,
          providerUnclearActions,
          cancelledApprovals,
          cancelledTimers,
        },
      });
    });

    return {
      runId: input.runId,
      status: 'CANCELLED',
      cancelledAt: now.toISOString(),
      cancelledActions,
      providerUnclearActions,
      cancelledApprovals,
      cancelledTimers,
      source: input.source,
    };
  }

  async cancelRunsForLockedOrg(orgId: string, orgStatus: OrganizationStatus, limit = 25) {
    if (!LOCKED_ORG_STATUSES.includes(orgStatus)) {
      return { cancelled: 0 };
    }

    const source = orgStatus === 'ARCHIVED' ? 'ORG_ARCHIVED' : 'ORG_SUSPENDED';
    const reason =
      orgStatus === 'ARCHIVED'
        ? 'Organization archived — workflow runs cancelled by system policy'
        : 'Organization suspended — workflow runs cancelled by system policy';

    const activeRuns = await this.runs.listActive(orgId, limit);
    let cancelled = 0;

    for (const run of activeRuns) {
      try {
        await this.cancelRun({
          organizationId: orgId,
          runId: run.id,
          actor: { type: 'SYSTEM', source: `org-lock.${orgStatus.toLowerCase()}` },
          reason,
          source,
        });
        cancelled += 1;
      } catch {
        // Concurrent cancellation or terminal transition — skip
      }
    }

    return { cancelled };
  }

  async assertOrgNotLocked(orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: { status: true },
    });
    if (!org) {
      throw new NotFoundException({
        message: 'Organization not found',
        code: WORKFLOW_CANCELLATION_ERROR_CODES.NOT_FOUND,
      });
    }
    if (LOCKED_ORG_STATUSES.includes(org.status)) {
      throw new BadRequestException({
        message: 'Organization is locked for workflow execution',
        code: WORKFLOW_CANCELLATION_ERROR_CODES.ORG_LOCKED,
        status: org.status,
      });
    }
    return org;
  }
}
