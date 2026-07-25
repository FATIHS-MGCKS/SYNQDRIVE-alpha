import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRunOrchestratorRepository } from './workflow-run-orchestrator.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowRuntimeActionExecutorAdapter } from './workflow-runtime-action-executor.adapter';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';
import {
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
  type WorkflowActionRunStatus,
} from './workflow-runtime-status.constants';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';
import { resolveWorkflowRuntimeWorkerId } from './workflow-runtime.worker-id.util';
import { computeWorkflowOutboxBackoffMs } from '../outbox/workflow-event-outbox-error.util';

@Injectable()
export class WorkflowRunWorkerService {
  private readonly logger = new Logger(WorkflowRunWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
    private readonly runs: WorkflowRunRuntimeRepository,
    private readonly orchestratorRepo: WorkflowRunOrchestratorRepository,
    private readonly runRuntime: WorkflowRunRuntimeService,
    private readonly audit: WorkflowRuntimeStatusAuditService,
    private readonly executor: WorkflowRuntimeActionExecutorAdapter,
  ) {}

  private get leaseMs() {
    return this.config.get<number>('workflowRuntime.actionLeaseMs', 60000);
  }

  private get heartbeatMs() {
    return this.config.get<number>('workflowRuntime.actionHeartbeatMs', 15000);
  }

  private get staleRunningMs() {
    return this.config.get<number>('workflowRuntime.staleRunningMs', 120000);
  }

  private get maxActionAttempts() {
    return this.config.get<number>('workflowRuntime.maxActionAttempts', 5);
  }

  private get retryBackoffMs() {
    return this.config.get<number>('workflowRuntime.retryBackoffMs', 30000);
  }

  private get maxRetryBackoffMs() {
    return this.config.get<number>('workflowRuntime.maxRetryBackoffMs', 900000);
  }

  private get maxRunDurationMs() {
    return this.config.get<number>('workflowRuntime.maxRunDurationMs', 86400000);
  }

  async processRun(orgId: string, runId: string, workerId = resolveWorkflowRuntimeWorkerId()) {
    const run = await this.runs.findByIdOrThrow(orgId, runId);
    this.orchestratorRepo.assertTenant(run, orgId);

    if (this.isRunExpired(run.startedAt)) {
      await this.cancelRunForMaxDuration(orgId, runId, run.lockVersion);
      return { processed: false, reason: 'max_duration_exceeded' };
    }

    if (['WAITING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(run.status)) {
      return { processed: false, reason: 'run_not_executable' };
    }

    const nextAction = await this.findNextExecutableAction(orgId, runId);
    if (!nextAction) {
      await this.runRuntime.deriveAndApplyRunStatus(
        orgId,
        runId,
        { type: 'WORKER', source: 'worker.derive' },
        'No executable actions remaining',
      );
      return { processed: false, reason: 'no_executable_action' };
    }

    const claimed = await this.actionRuns.claimForExecution(
      orgId,
      nextAction.id,
      workerId,
      this.leaseMs,
    );
    if (!claimed) {
      return { processed: false, reason: 'claim_conflict' };
    }

    const heartbeat = this.startHeartbeat(orgId, claimed.id, workerId);
    try {
      const actionDef = this.executor.buildActionDef(claimed);
      const result = await this.executor.execute(
        actionDef,
        run,
        claimed,
        claimed.attemptCount,
        this.maxActionAttempts,
      );

      await this.finalizeAction(orgId, runId, claimed, result);
      return { processed: true, actionRunId: claimed.id, status: result.status };
    } finally {
      clearInterval(heartbeat);
    }
  }

  async recoverStaleRunningActions(now = new Date()) {
    const staleBefore = new Date(now.getTime() - this.staleRunningMs);
    const batch = await this.actionRuns.findStaleRunningBatch(
      staleBefore,
      this.config.get<number>('workflowRuntime.pollBatchSize', 25),
    );
    let recovered = 0;
    for (const row of batch) {
      const released = await this.actionRuns.releaseStaleClaim(row.id, now);
      if (released) recovered += 1;
    }
    return recovered;
  }

  private async findNextExecutableAction(orgId: string, runId: string) {
    const actions = await this.actionRuns.listByRun(orgId, runId);
    for (const action of actions) {
      if (!this.isActionExecutable(action.status as WorkflowActionRunStatus, action.nextAttemptAt)) {
        continue;
      }
      const priorActions = actions.filter((a) => a.actionIndex < action.actionIndex);
      const priorReady = priorActions.every((a) =>
        TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(a.status as WorkflowActionRunStatus),
      );
      if (priorReady) {
        return action;
      }
    }
    return null;
  }

  private isActionExecutable(status: WorkflowActionRunStatus, nextAttemptAt: Date | null) {
    if (status === 'PENDING' || status === 'SKIPPED') {
      return status === 'PENDING';
    }
    if (status === 'FAILED_RETRYABLE') {
      return !nextAttemptAt || nextAttemptAt <= new Date();
    }
    return false;
  }

  private startHeartbeat(orgId: string, actionRunId: string, workerId: string) {
    return setInterval(() => {
      void this.actionRuns.renewHeartbeat(orgId, actionRunId, workerId, this.leaseMs).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Heartbeat failed for action ${actionRunId}: ${message}`);
      });
    }, this.heartbeatMs);
  }

  private async finalizeAction(
    orgId: string,
    runId: string,
    actionRun: Awaited<ReturnType<WorkflowActionRunRuntimeRepository['claimForExecution']>>,
    result: Awaited<ReturnType<WorkflowRuntimeActionExecutorAdapter['execute']>>,
  ) {
    if (!actionRun) {
      throw new NotFoundException({
        message: 'Action run not found after claim',
        code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.ACTION_RUN_NOT_FOUND,
      });
    }

    let approvalId: string | null = null;
    if (result.status === 'WAITING_FOR_APPROVAL') {
      const approval = await this.prisma.workflowApproval.create({
        data: {
          organizationId: orgId,
          workflowRunId: runId,
          actionRunId: actionRun.id,
          status: 'PENDING',
          requestedBySystem: true,
          reason: `Approval required for ${actionRun.actionType}`,
        },
      });
      approvalId = approval.id;
    }

    const nextAttemptAt =
      result.status === 'FAILED_RETRYABLE'
        ? new Date(
            Date.now() +
              computeWorkflowOutboxBackoffMs(
                this.retryBackoffMs,
                this.maxRetryBackoffMs,
                0,
                actionRun.attemptCount,
              ),
          )
        : null;

    const finishedAt = ['SUCCEEDED', 'FAILED_PERMANENT', 'SKIPPED', 'CANCELLED'].includes(
      result.status,
    )
      ? new Date()
      : null;

    await this.prisma.$transaction(async (tx) => {
      const count = await this.actionRuns.completeExecution(tx, {
        orgId,
        actionRunId: actionRun.id,
        expectedLockVersion: actionRun.lockVersion,
        toStatus: result.status,
        output: (result.output ?? undefined) as never,
        errorMessage: result.errorMessage ?? null,
        waitingUntil: result.waitingUntil ?? null,
        approvalId,
        finishedAt,
        attemptCount: actionRun.attemptCount,
        nextAttemptAt,
      });
      if (count === 0) {
        throw new ConflictException({
          message: 'Action completion conflict',
          code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.LOCK_CONFLICT,
        });
      }

      await this.audit.recordActionRunTransition(tx, {
        orgId,
        workflowRunId: runId,
        actionRunId: actionRun.id,
        fromStatus: 'RUNNING',
        toStatus: result.status,
        actor: { type: 'WORKER', source: 'worker.execute' },
        reason: result.errorMessage ?? 'Action completed',
        metadata: {
          attemptCount: actionRun.attemptCount,
          nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
        },
      });
    });

    await this.runRuntime.deriveAndApplyRunStatus(
      orgId,
      runId,
      { type: 'WORKER', source: 'worker.finalize' },
      'Derived after action execution',
    );
  }

  private isRunExpired(startedAt: Date) {
    return Date.now() - startedAt.getTime() > this.maxRunDurationMs;
  }

  private async cancelRunForMaxDuration(orgId: string, runId: string, lockVersion: number) {
    await this.runRuntime.transitionStatus(orgId, runId, {
      toStatus: 'CANCELLED',
      expectedLockVersion: lockVersion,
      actor: { type: 'SYSTEM', source: 'worker.max_duration' },
      reason: 'Maximum run duration exceeded',
      errorMessage: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.MAX_RUN_DURATION_EXCEEDED,
    });
  }
}
