import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowActionRunRuntimeRepository } from './workflow-action-run-runtime.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { WorkflowRunRuntimeService } from './workflow-run-runtime.service';
import { WorkflowRuntimeActionExecutorAdapter } from './workflow-runtime-action-executor.adapter';
import { WorkflowRuntimeStatusAuditService } from './workflow-runtime-status-audit.service';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';
import type { WorkflowActionRunStatus } from './workflow-runtime-status.constants';
import type { WorkflowRuntimeActor } from './workflow-runtime-status.types';
import {
  buildEventContext,
  buildPolicyContext,
  type WorkflowActionExecutionContext,
  type WorkflowActionExecutionResult,
} from './workflow-action-run-execution.types';
import {
  classifyActionError,
  resolveStatusFromClassification,
} from './workflow-action-run-error.classifier';
import {
  buildInputSnapshot,
  buildResultSummary,
  extractProviderReference,
  resolveActionFromRunSnapshot,
  stripSecretsFromValue,
} from './workflow-action-run-snapshot.util';
import { computeWorkflowOutboxBackoffMs } from '../outbox/workflow-event-outbox-error.util';
import type { WorkflowActionDef } from '../workflow-definition.validator';

@Injectable()
export class WorkflowActionRunExecutorService {
  private readonly logger = new Logger(WorkflowActionRunExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly actionRuns: WorkflowActionRunRuntimeRepository,
    private readonly runs: WorkflowRunRuntimeRepository,
    private readonly runRuntime: WorkflowRunRuntimeService,
    private readonly audit: WorkflowRuntimeStatusAuditService,
    private readonly adapter: WorkflowRuntimeActionExecutorAdapter,
  ) {}

  private get defaultMaxAttempts() {
    return this.config.get<number>('workflowRuntime.maxActionAttempts', 5);
  }

  private get actionTimeoutMs() {
    return this.config.get<number>('workflowRuntime.actionTimeoutMs', 120000);
  }

  private get retryBackoffMs() {
    return this.config.get<number>('workflowRuntime.retryBackoffMs', 30000);
  }

  private get maxRetryBackoffMs() {
    return this.config.get<number>('workflowRuntime.maxRetryBackoffMs', 900000);
  }

  /**
   * Execute a claimed action run — idempotent, snapshot-bound, atomically persisted.
   */
  async executeClaimed(
    orgId: string,
    actionRunId: string,
    actor: WorkflowRuntimeActor,
  ): Promise<WorkflowActionExecutionResult> {
    const actionRun = await this.actionRuns.findByIdOrThrow(orgId, actionRunId);
    const run = await this.runs.findByIdOrThrow(orgId, actionRun.workflowRunId);

    if (actionRun.organizationId !== orgId || run.organizationId !== orgId) {
      throw new NotFoundException({
        message: 'Cross-tenant action execution denied',
        code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.TENANT_VIOLATION,
      });
    }

    const idempotent = await this.checkIdempotentCompletion(orgId, actionRun);
    if (idempotent) {
      return idempotent;
    }

    if (actionRun.status !== 'RUNNING') {
      throw new ConflictException({
        message: 'Action run must be RUNNING before execution',
        code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.CLAIM_CONFLICT,
      });
    }

    const policySnapshot = await this.prisma.workflowPolicySnapshot.findFirst({
      where: { id: run.policySnapshotId, organizationId: orgId },
    });
    if (!policySnapshot) {
      throw new NotFoundException({
        message: 'Policy snapshot not found for run',
        code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.NOT_FOUND,
      });
    }

    const ctx = this.buildExecutionContext(run, actionRun, policySnapshot, actor);
    await this.ensureInputSnapshot(orgId, actionRun, ctx);

    if (this.isTimedOut(actionRun.timeoutAt)) {
      return this.persistFailure(orgId, run.id, actionRun, ctx, {
        timedOut: true,
        err: new Error('Action execution exceeded configured timeout'),
      });
    }

    try {
      const actionDef: WorkflowActionDef = {
        type: ctx.actionSnapshot.actionType,
        config: ctx.actionSnapshot.config,
        requiresApproval: ctx.actionSnapshot.requiresApproval,
      };

      const raw = await this.executeWithTimeout(
        () =>
          this.adapter.execute(
            actionDef,
            run,
            actionRun,
            actionRun.attemptCount,
            actionRun.maxAttempts ?? ctx.policy.maxActionAttempts,
          ),
        ctx.policy.actionTimeoutMs,
      );

      return this.persistResult(orgId, run.id, actionRun, ctx, raw);
    } catch (err) {
      return this.persistFailure(orgId, run.id, actionRun, ctx, { err });
    }
  }

  async checkIdempotentCompletion(
    orgId: string,
    actionRun: { id: string; status: string; resultSummary: unknown; output: unknown; providerReference: string | null },
  ): Promise<WorkflowActionExecutionResult | null> {
    if (actionRun.status === 'SUCCEEDED') {
      return {
        status: 'SUCCEEDED',
        resultSummary:
          actionRun.resultSummary && typeof actionRun.resultSummary === 'object'
            ? (actionRun.resultSummary as Record<string, unknown>)
            : undefined,
        output:
          actionRun.output && typeof actionRun.output === 'object'
            ? (actionRun.output as Record<string, unknown>)
            : undefined,
        providerReference: actionRun.providerReference ?? undefined,
        idempotentReplay: true,
      };
    }
    return null;
  }

  buildExecutionContext(
    run: Awaited<ReturnType<WorkflowRunRuntimeRepository['findByIdOrThrow']>>,
    actionRun: Awaited<ReturnType<WorkflowActionRunRuntimeRepository['findByIdOrThrow']>>,
    policySnapshot: Awaited<ReturnType<PrismaService['workflowPolicySnapshot']['findFirst']>>,
    actor: WorkflowRuntimeActor,
  ): WorkflowActionExecutionContext {
    if (!policySnapshot) {
      throw new NotFoundException('Policy snapshot required');
    }
    return {
      organizationId: run.organizationId,
      actor,
      run,
      actionRun,
      event: buildEventContext(run),
      policy: buildPolicyContext(policySnapshot, {
        maxActionAttempts: actionRun.maxAttempts ?? this.defaultMaxAttempts,
        actionTimeoutMs: this.actionTimeoutMs,
      }),
      actionSnapshot: resolveActionFromRunSnapshot(run, actionRun),
    };
  }

  private async ensureInputSnapshot(
    orgId: string,
    actionRun: Awaited<ReturnType<WorkflowActionRunRuntimeRepository['findByIdOrThrow']>>,
    ctx: WorkflowActionExecutionContext,
  ) {
    if (actionRun.inputSnapshot) return;
    const snapshot = buildInputSnapshot(actionRun);
    await this.actionRuns.patchExecutionFields(orgId, actionRun.id, {
      inputSnapshot: snapshot as never,
      timeoutAt: new Date(Date.now() + ctx.policy.actionTimeoutMs),
    });
  }

  private isTimedOut(timeoutAt: Date | null): boolean {
    return !!timeoutAt && timeoutAt.getTime() <= Date.now();
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Action execution exceeded configured timeout'));
      }, timeoutMs);
      fn()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async persistResult(
    orgId: string,
    runId: string,
    actionRun: Awaited<ReturnType<WorkflowActionRunRuntimeRepository['findByIdOrThrow']>>,
    ctx: WorkflowActionExecutionContext,
    raw: Awaited<ReturnType<WorkflowRuntimeActionExecutorAdapter['execute']>>,
  ): Promise<WorkflowActionExecutionResult> {
    const resultSummary = buildResultSummary(raw.output);
    const providerReference = extractProviderReference(raw.output);
    const sanitizedOutput = raw.output
      ? (stripSecretsFromValue(raw.output) as Record<string, unknown>)
      : undefined;
    const finishedAt = ['SUCCEEDED', 'FAILED_PERMANENT', 'SKIPPED', 'CANCELLED'].includes(raw.status)
      ? new Date()
      : null;

    let approvalId: string | null = null;
    if (raw.status === 'WAITING_FOR_APPROVAL') {
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
      raw.status === 'FAILED_RETRYABLE'
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

    await this.atomicComplete(orgId, runId, actionRun, {
      toStatus: raw.status,
      resultSummary,
      output: sanitizedOutput,
      errorSummary: raw.errorMessage ? raw.errorMessage.slice(0, 500) : null,
      errorCategory:
        raw.status === 'FAILED_RETRYABLE'
          ? 'RETRYABLE'
          : raw.status === 'FAILED_PERMANENT'
            ? 'PERMANENT'
            : undefined,
      providerReference,
      approvalId,
      finishedAt,
      nextAttemptAt,
    });

    return {
      status: raw.status,
      resultSummary,
      output: sanitizedOutput,
      providerReference,
      errorSummary: raw.errorMessage,
    };
  }

  private async persistFailure(
    orgId: string,
    runId: string,
    actionRun: Awaited<ReturnType<WorkflowActionRunRuntimeRepository['findByIdOrThrow']>>,
    ctx: WorkflowActionExecutionContext,
    input: { err: unknown; timedOut?: boolean },
  ): Promise<WorkflowActionExecutionResult> {
    const classification = classifyActionError(input.err, {
      attemptCount: actionRun.attemptCount,
      maxAttempts: actionRun.maxAttempts ?? ctx.policy.maxActionAttempts,
      timedOut: input.timedOut,
    });
    const status = resolveStatusFromClassification(classification);
    const nextAttemptAt =
      status === 'FAILED_RETRYABLE'
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

    await this.atomicComplete(orgId, runId, actionRun, {
      toStatus: status,
      errorCode: classification.errorCode,
      errorCategory: classification.errorCategory,
      errorSummary: classification.errorSummary,
      finishedAt: status === 'FAILED_PERMANENT' ? new Date() : null,
      nextAttemptAt,
    });

    return {
      status,
      errorCode: classification.errorCode,
      errorCategory: classification.errorCategory,
      errorSummary: classification.errorSummary,
    };
  }

  private async atomicComplete(
    orgId: string,
    runId: string,
    actionRun: Awaited<ReturnType<WorkflowActionRunRuntimeRepository['findByIdOrThrow']>>,
    patch: {
      toStatus: WorkflowActionRunStatus;
      resultSummary?: Record<string, unknown>;
      output?: Record<string, unknown>;
      errorCode?: string;
      errorCategory?: string;
      errorSummary?: string | null;
      providerReference?: string;
      approvalId?: string | null;
      finishedAt?: Date | null;
      nextAttemptAt?: Date | null;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const count = await this.actionRuns.completeExecution(tx, {
        orgId,
        actionRunId: actionRun.id,
        expectedLockVersion: actionRun.lockVersion,
        toStatus: patch.toStatus,
        output: patch.output as never,
        resultSummary: patch.resultSummary as never,
        errorCode: patch.errorCode ?? null,
        errorCategory: patch.errorCategory ?? null,
        errorSummary: patch.errorSummary ?? null,
        errorMessage: patch.errorSummary ?? null,
        providerReference: patch.providerReference ?? null,
        waitingUntil: null,
        approvalId: patch.approvalId ?? null,
        finishedAt: patch.finishedAt ?? null,
        attemptCount: actionRun.attemptCount,
        nextAttemptAt: patch.nextAttemptAt ?? null,
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
        toStatus: patch.toStatus,
        actor: { type: 'WORKER', source: 'action-run.executor' },
        reason: patch.errorSummary ?? 'Action execution completed',
        metadata: {
          errorCode: patch.errorCode ?? null,
          errorCategory: patch.errorCategory ?? null,
          providerReference: patch.providerReference ?? null,
          attemptCount: actionRun.attemptCount,
        },
      });
    });

    await this.runRuntime.deriveAndApplyRunStatus(
      orgId,
      runId,
      { type: 'WORKER', source: 'action-run.executor' },
      'Derived after action execution',
    );
  }
}
