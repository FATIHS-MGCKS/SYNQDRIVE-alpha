import { Logger } from '@nestjs/common';
import { DI_V0_S4_LIMITS } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { isDiV0S4Rejection, type DiV0S4RejectionCode } from '../s4a-foundation/di-v0-s4a-errors';
import type { DiV0S4ClaimResult, DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import { isDiV0S4WorkerConfigured } from './di-v0-s4b-config';
import type { DiV0S4ExecutionOutcome, DiV0S4ExecutorRegistry, DiV0S4WorkItemExecutor } from './di-v0-s4b-executor.port';
import type { DiV0S4RuntimePipeline } from './di-v0-s4b-pipeline-manifest';

/** Every T07 `failure_reason` the orchestrator can write (bounded; matches `^[A-Z0-9_]{1,128}$`). */
export const DI_V0_S4B_RELEASE_REASONS = [
  'EXECUTOR_ERROR',
  'EXECUTOR_RELEASED',
  'EXECUTOR_POSTCONDITION_FAILED',
  'WORK_BUDGET_EXCEEDED',
  'CONTROL_PLANE_RELINQUISH',
  'SHUTDOWN_RELINQUISH',
] as const;
export type DiV0S4bReleaseReason = (typeof DI_V0_S4B_RELEASE_REASONS)[number];

type StopCause = 'WORK_BUDGET' | 'LEASE_LOST' | 'CONTROL_PLANE' | 'SHUTDOWN';

const STOP_RELEASE_REASON: Record<Exclude<StopCause, 'LEASE_LOST'>, DiV0S4bReleaseReason> = {
  WORK_BUDGET: 'WORK_BUDGET_EXCEEDED',
  CONTROL_PLANE: 'CONTROL_PLANE_RELINQUISH',
  SHUTDOWN: 'SHUTDOWN_RELINQUISH',
};

/** Heartbeat or release refusals meaning another actor now owns the row: never write again. */
const LEASE_LOST_CODES: readonly DiV0S4RejectionCode[] = [
  'LEASE_NOT_HELD',
  'LEASE_EXPIRED',
  'CONDITIONAL_UPDATE_LOST',
  'ILLEGAL_SOURCE_STATE',
  'WORK_ITEM_NOT_FOUND',
];

/** Heartbeat refusals that stop the attempt but still allow the T07 safe relinquish. */
const CONTROL_PLANE_STOP_CODES: readonly DiV0S4RejectionCode[] = [
  'CONTROL_PLANE_DISABLED',
  'DB_KILL_ACTIVE',
  'DB_KILL_ROW_MISSING',
  'DB_KILL_ROW_UNREADABLE',
  'DB_KILL_ROW_MALFORMED',
];

export type DiV0S4ClaimLoopStatus =
  | 'BUSY'
  | 'WORKER_DISABLED'
  | 'EXECUTOR_NOT_READY'
  | 'IDLE'
  | 'CLAIM_REFUSED'
  | 'SETTLED'
  | 'BOUNDARY_SUPERSEDED'
  | 'RELEASED'
  | 'LEASE_LOST'
  | 'RELEASE_REFUSED'
  | 'RELEASE_FAILED';

export interface DiV0S4ClaimLoopResult {
  status: DiV0S4ClaimLoopStatus;
  workItemId: string | null;
  transitionId: DiV0S4ClaimResult['transitionId'] | null;
  releaseReason: DiV0S4bReleaseReason | null;
  refusalCode: DiV0S4RejectionCode | 'UNEXPECTED_ERROR' | null;
  heartbeats: number;
}

export interface DiV0S4ClaimLoopOptions {
  leaseOwner: string;
  /** Test hook; must be positive and at most the contract heartbeat interval. */
  heartbeatIntervalMs?: number;
  /** Test hook; must be positive and at most the contract work budget. */
  workBudgetMs?: number;
}

type AttemptEnd = { kind: 'OUTCOME'; outcome: DiV0S4ExecutionOutcome } | { kind: 'ERROR' } | { kind: 'STOPPED'; cause: StopCause };

/**
 * DB-authoritative claim loop (S4A_CONTRACT_DESIGN §8 S4B). One attempt at a time per replica.
 * Correctness comes from the repository fence (`workItemId`, `lease_epoch`, DB clock); the local
 * timers only decide when this worker gives up, never whether a lease is still valid.
 */
export class DiV0S4ClaimLoop {
  private readonly logger = new Logger(DiV0S4ClaimLoop.name);
  private readonly heartbeatIntervalMs: number;
  private readonly workBudgetMs: number;
  private inFlight = false;
  private activeStop: ((cause: StopCause) => void) | null = null;

  constructor(
    private readonly repository: DiV0S4WorkItemRepository,
    private readonly config: DiV0S4ControlPlaneConfig,
    private readonly pipeline: DiV0S4RuntimePipeline,
    private readonly executors: DiV0S4ExecutorRegistry,
    private readonly options: DiV0S4ClaimLoopOptions,
  ) {
    const maxHeartbeatMs = DI_V0_S4_LIMITS.heartbeatIntervalSeconds * 1000;
    const maxBudgetMs = DI_V0_S4_LIMITS.workExecutionBudgetSeconds * 1000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? maxHeartbeatMs;
    this.workBudgetMs = options.workBudgetMs ?? maxBudgetMs;
    if (!(this.heartbeatIntervalMs > 0 && this.heartbeatIntervalMs <= maxHeartbeatMs)) {
      throw new Error('DI_V0_S4B_CLAIM_LOOP:heartbeatIntervalMs out of contract range');
    }
    if (!(this.workBudgetMs > 0 && this.workBudgetMs <= maxBudgetMs)) {
      throw new Error('DI_V0_S4B_CLAIM_LOOP:workBudgetMs out of contract range');
    }
  }

  isConfigured(): boolean {
    return isDiV0S4WorkerConfigured(this.config);
  }

  /** Aborts the in-flight attempt (process shutdown); the attempt then relinquishes through T07. */
  stop(): void {
    this.activeStop?.('SHUTDOWN');
  }

  async runOnce(): Promise<DiV0S4ClaimLoopResult> {
    const result: DiV0S4ClaimLoopResult = {
      status: 'WORKER_DISABLED',
      workItemId: null,
      transitionId: null,
      releaseReason: null,
      refusalCode: null,
      heartbeats: 0,
    };
    if (this.inFlight) return { ...result, status: 'BUSY' };
    if (!this.isConfigured()) return result;
    const executor = this.executors.readyExecutor();
    if (!executor) return { ...result, status: 'EXECUTOR_NOT_READY' };

    this.inFlight = true;
    try {
      let lease: DiV0S4ClaimResult;
      try {
        lease = await this.repository.claim({ leaseOwner: this.options.leaseOwner, pipelineManifest: this.pipeline.manifest });
      } catch (error) {
        if (isDiV0S4Rejection(error, 'NO_CLAIMABLE_WORK_ITEM')) return { ...result, status: 'IDLE' };
        return { ...result, status: 'CLAIM_REFUSED', refusalCode: isDiV0S4Rejection(error) ? error.code : 'UNEXPECTED_ERROR' };
      }
      result.workItemId = lease.workItemId;
      result.transitionId = lease.transitionId;

      const recheck = await this.repository.evaluateAttemptStartBoundary(lease);
      if (recheck.kind === 'LEASE_LOST') {
        return { ...result, status: 'LEASE_LOST', refusalCode: recheck.code };
      }
      if (recheck.kind === 'SUPERSEDE') {
        try {
          await this.repository.holderSupersede(lease, recheck.reason);
          return { ...result, status: 'BOUNDARY_SUPERSEDED' };
        } catch (error) {
          if (isDiV0S4Rejection(error) && LEASE_LOST_CODES.includes(error.code)) {
            return { ...result, status: 'LEASE_LOST', refusalCode: error.code };
          }
          if (isDiV0S4Rejection(error)) {
            return { ...result, status: 'RELEASE_REFUSED', refusalCode: error.code };
          }
          this.logger.warn(
            `DI V0 S4 attempt-start supersede failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
          );
          return { ...result, status: 'RELEASE_FAILED', refusalCode: 'UNEXPECTED_ERROR' };
        }
      }

      return await this.runAttempt(executor, lease, result);
    } finally {
      this.inFlight = false;
    }
  }

  private async runAttempt(
    executor: DiV0S4WorkItemExecutor,
    lease: DiV0S4ClaimResult,
    result: DiV0S4ClaimLoopResult,
  ): Promise<DiV0S4ClaimLoopResult> {
    const controller = new AbortController();
    const state: { stopCause: StopCause | null } = { stopCause: null };
    let resolveStopped!: (end: AttemptEnd) => void;
    const stopped = new Promise<AttemptEnd>((resolve) => (resolveStopped = resolve));
    const stop = (cause: StopCause): void => {
      if (state.stopCause) return;
      state.stopCause = cause;
      controller.abort(cause);
      resolveStopped({ kind: 'STOPPED', cause });
    };
    this.activeStop = stop;

    let heartbeat: Promise<void> | null = null;
    const heartbeatTimer = setInterval(() => {
      if (heartbeat || state.stopCause) return;
      heartbeat = this.heartbeatOnce(lease, stop, result).finally(() => (heartbeat = null));
    }, this.heartbeatIntervalMs);
    const budgetTimer = setTimeout(() => stop('WORK_BUDGET'), this.workBudgetMs);

    const execution: Promise<AttemptEnd> = Promise.resolve()
      .then(() =>
        executor.execute({
          lease,
          pipelineManifest: this.pipeline.manifest,
          repository: this.repository,
          signal: controller.signal,
        }),
      )
      .then(
        (outcome): AttemptEnd => ({ kind: 'OUTCOME', outcome }),
        (): AttemptEnd => ({ kind: 'ERROR' }),
      );

    let end: AttemptEnd;
    try {
      end = await Promise.race([execution, stopped]);
    } finally {
      clearInterval(heartbeatTimer);
      clearTimeout(budgetTimer);
      this.activeStop = null;
      if (heartbeat) await heartbeat;
    }

    if (end.kind === 'STOPPED') {
      if (end.cause === 'LEASE_LOST') return { ...result, status: 'LEASE_LOST' };
      return this.release(lease, STOP_RELEASE_REASON[end.cause], result);
    }
    if (state.stopCause === 'LEASE_LOST') return { ...result, status: 'LEASE_LOST' };
    if (end.kind === 'ERROR') return this.release(lease, 'EXECUTOR_ERROR', result);
    if (end.outcome?.kind === 'SETTLED') return this.acceptSettled(lease, result);
    return this.release(lease, 'EXECUTOR_RELEASED', result);
  }

  private async heartbeatOnce(
    lease: DiV0S4ClaimResult,
    stop: (cause: StopCause) => void,
    result: DiV0S4ClaimLoopResult,
  ): Promise<void> {
    try {
      await this.repository.heartbeat(lease);
      result.heartbeats += 1;
    } catch (error) {
      if (isDiV0S4Rejection(error) && LEASE_LOST_CODES.includes(error.code)) {
        stop('LEASE_LOST');
      } else if (isDiV0S4Rejection(error) && CONTROL_PLANE_STOP_CODES.includes(error.code)) {
        stop('CONTROL_PLANE');
      }
      // Transient errors: the next beat retries; DB-clock expiry turns a persistent failure into LEASE_EXPIRED.
    }
  }

  /** SETTLED is accepted only when the DB row is in a durable terminal state (not an active lease). */
  private async acceptSettled(lease: DiV0S4ClaimResult, result: DiV0S4ClaimLoopResult): Promise<DiV0S4ClaimLoopResult> {
    const post = await this.repository.readExecutionPostcondition(lease.workItemId);
    if (post.terminal && !post.leaseActivelyHeld) return { ...result, status: 'SETTLED' };
    if (post.leaseActivelyHeld) return this.release(lease, 'EXECUTOR_POSTCONDITION_FAILED', result);
    if (post.terminal) return { ...result, status: 'SETTLED' };
    return { ...result, status: 'LEASE_LOST' };
  }

  /** T07: the only holder write allowed while killed; refusals mean the lease is already gone. */
  private async release(
    lease: DiV0S4ClaimResult,
    reason: DiV0S4bReleaseReason,
    result: DiV0S4ClaimLoopResult,
  ): Promise<DiV0S4ClaimLoopResult> {
    try {
      await this.repository.failRetryable(lease, reason);
      return { ...result, status: 'RELEASED', releaseReason: reason };
    } catch (error) {
      if (isDiV0S4Rejection(error) && LEASE_LOST_CODES.includes(error.code)) {
        return { ...result, status: 'LEASE_LOST', releaseReason: reason, refusalCode: error.code };
      }
      if (isDiV0S4Rejection(error)) {
        return { ...result, status: 'RELEASE_REFUSED', releaseReason: reason, refusalCode: error.code };
      }
      this.logger.warn(`DI V0 S4 T07 release failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
      return { ...result, status: 'RELEASE_FAILED', releaseReason: reason, refusalCode: 'UNEXPECTED_ERROR' };
    }
  }
}
