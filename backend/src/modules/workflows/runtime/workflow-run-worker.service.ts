import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRunOrchestratorRepository } from './workflow-run-orchestrator.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowActionRunExecutorService } from './workflow-action-run-executor.service';
import { WorkflowRunCancellationService } from './cancellation/workflow-run-cancellation.service';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';
import {
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  type WorkflowActionRunStatus,
  type WorkflowRunStatus,
} from './workflow-runtime-status.constants';
import { resolveWorkflowRuntimeWorkerId } from './workflow-runtime.worker-id.util';

@Injectable()
export class WorkflowRunWorkerService {
  private readonly logger = new Logger(WorkflowRunWorkerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
    private readonly runs: WorkflowRunRuntimeRepository,
    private readonly orchestratorRepo: WorkflowRunOrchestratorRepository,
    private readonly runRuntime: WorkflowRunRuntimeService,
    private readonly actionExecutor: WorkflowActionRunExecutorService,
    private readonly cancellation: WorkflowRunCancellationService,
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

  private get actionTimeoutMs() {
    const configured = this.config.get<number>('workflowRuntime.actionTimeoutMs', 120000);
    const minMs = this.config.get<number>('workflowRuntime.minActionTimeoutMs', 5000);
    const maxMs = this.config.get<number>('workflowRuntime.maxActionTimeoutMs', 600000);
    return Math.min(maxMs, Math.max(minMs, configured));
  }

  private get maxRunDurationMs() {
    return this.config.get<number>('workflowRuntime.maxRunDurationMs', 86400000);
  }

  async processRun(orgId: string, runId: string, workerId = resolveWorkflowRuntimeWorkerId()) {
    await this.cancellation.assertOrgNotLocked(orgId);

    const run = await this.runs.findByIdOrThrow(orgId, runId);
    this.orchestratorRepo.assertTenant(run, orgId);

    if (TERMINAL_WORKFLOW_RUN_STATUSES.has(run.status as WorkflowRunStatus)) {
      return { processed: false, reason: 'run_terminal' };
    }

    if (this.isRunExpired(run.startedAt)) {
      await this.cancelRunForMaxDuration(orgId, runId);
      return { processed: false, reason: 'max_duration_exceeded' };
    }

    if (['WAITING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'COMPLETED_WITH_FALLBACK', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(run.status)) {
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
      this.actionTimeoutMs,
    );
    if (!claimed) {
      return { processed: false, reason: 'claim_conflict' };
    }

    const heartbeat = this.startHeartbeat(orgId, runId, claimed.id, workerId);
    try {
      const currentRun = await this.runs.findById(orgId, runId);
      if (!currentRun || currentRun.status === 'CANCELLED') {
        return { processed: false, reason: 'run_cancelled_during_execution' };
      }

      const result = await this.actionExecutor.executeClaimed(orgId, claimed.id, {
        type: 'WORKER',
        source: workerId,
      });
      return {
        processed: true,
        actionRunId: claimed.id,
        status: result.status,
        idempotentReplay: result.idempotentReplay ?? false,
      };
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

  async cancelExpiredRuns(limit?: number) {
    const batch = await this.runs.listExpiredByMaxDuration(
      this.maxRunDurationMs,
      limit ?? this.config.get<number>('workflowRuntime.pollBatchSize', 25),
    );
    let cancelled = 0;
    for (const row of batch) {
      try {
        await this.cancelRunForMaxDuration(row.organizationId, row.id);
        cancelled += 1;
      } catch {
        // Concurrent cancel or terminal transition
      }
    }
    return cancelled;
  }

  async findOpenActionRuns(orgId: string) {
    return this.actionRuns.findOpenActionRuns(orgId);
  }

  private async findNextExecutableAction(orgId: string, runId: string) {
    const actions = await this.actionRuns.listByRun(orgId, runId);
    for (const action of actions) {
      if (!this.isActionExecutable(action.status as WorkflowActionRunStatus, action.nextAttemptAt)) {
        continue;
      }
      const priorActions = actions.filter((a) => a.actionIndex < action.actionIndex);
      const priorReady = priorActions.every((a) => this.isPriorActionSatisfied(a));
      if (priorReady) {
        return action;
      }
    }
    return null;
  }

  private isPriorActionSatisfied(action: {
    status: string;
    blockingOnFailure: boolean;
  }): boolean {
    const status = action.status as WorkflowActionRunStatus;
    if (TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(status)) {
      if (status === 'FAILED_PERMANENT' && !action.blockingOnFailure) {
        return true;
      }
      return status !== 'FAILED_PERMANENT';
    }
    return false;
  }

  private isActionExecutable(status: WorkflowActionRunStatus, nextAttemptAt: Date | null) {
    if (status === 'PENDING') return true;
    if (status === 'FAILED_RETRYABLE') {
      return !nextAttemptAt || nextAttemptAt <= new Date();
    }
    return false;
  }

  private startHeartbeat(
    orgId: string,
    runId: string,
    actionRunId: string,
    workerId: string,
  ) {
    return setInterval(() => {
      void (async () => {
        const run = await this.runs.findById(orgId, runId);
        if (!run || run.status === 'CANCELLED') {
          return;
        }
        await this.actionRuns.renewHeartbeat(orgId, actionRunId, workerId, this.leaseMs);
      })().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Heartbeat failed for action ${actionRunId}: ${message}`);
      });
    }, this.heartbeatMs);
  }

  private isRunExpired(startedAt: Date) {
    return Date.now() - startedAt.getTime() > this.maxRunDurationMs;
  }

  private async cancelRunForMaxDuration(orgId: string, runId: string) {
    await this.cancellation.cancelRun({
      organizationId: orgId,
      runId,
      actor: { type: 'SYSTEM', source: 'worker.max_duration' },
      reason: 'Maximum run duration exceeded',
      source: 'MAX_RUN_DURATION',
    });
  }
}
