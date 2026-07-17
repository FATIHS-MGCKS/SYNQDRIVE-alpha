import { BadRequestException, Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../../workers/queues/queue-names';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { BrakeHealthService } from './brake-health.service';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';
import {
  buildBrakeRecalculationJobId,
  brakeRecalculationLockKey,
  type BrakeRecalculationTrigger,
} from './brake-recalculation-fingerprint';

export interface BrakeRecalculationJobData {
  vehicleId: string;
  organizationId?: string | null;
  trigger: BrakeRecalculationTrigger;
  force?: boolean;
  reason?: string | null;
  actorId?: string | null;
  requestedAt: string;
}

export interface BrakeRecalculationEnqueueInput {
  vehicleId: string;
  organizationId?: string | null;
  trigger: BrakeRecalculationTrigger;
  force?: boolean;
  reason?: string | null;
  actorId?: string | null;
  /** Scheduler uses hourly bucket dedupe; burst triggers coalesce on vehicle id. */
  hourBucket?: number;
}

export interface BrakeRecalculationEnqueueResult {
  queued: boolean;
  jobId: string;
  executedInline?: boolean;
  result?: Awaited<ReturnType<BrakeHealthService['recalculate']>>;
}

const LOCK_TTL_MS = 120_000;

@Injectable()
export class BrakeRecalculationOrchestratorService {
  private readonly logger = new Logger(BrakeRecalculationOrchestratorService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BRAKE_RECALCULATION) private readonly queue: Queue,
    @Inject(forwardRef(() => BrakeHealthService))
    private readonly brakeHealth: BrakeHealthService,
    private readonly lockService: RedisDistributedLockService,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
  ) {}

  async enqueue(input: BrakeRecalculationEnqueueInput): Promise<BrakeRecalculationEnqueueResult> {
    if (input.force && !input.reason?.trim()) {
      throw new BadRequestException('Force brake recalculation requires a non-empty reason.');
    }

    const jobId = buildBrakeRecalculationJobId(input.vehicleId, input.hourBucket);
    const payload: BrakeRecalculationJobData = {
      vehicleId: input.vehicleId,
      organizationId: input.organizationId ?? null,
      trigger: input.trigger,
      force: input.force ?? false,
      reason: input.reason?.trim() ?? null,
      actorId: input.actorId ?? null,
      requestedAt: new Date().toISOString(),
    };

    if (!canEnqueueQueue(this.logger, 'brake-recalculation')) {
      const result = await this.executeWithLock(payload);
      return { queued: false, jobId, executedInline: true, result };
    }

    await this.clearTerminalJob(jobId);

    try {
      await this.queue.add('brake-recalc', payload, {
        jobId,
        removeOnComplete: { count: 500, age: 24 * 3600 },
        removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      });
      return { queued: true, jobId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('duplicate')) {
        this.logger.debug(
          `Brake recalc already queued: vehicle=${input.vehicleId} trigger=${input.trigger}`,
        );
        return { queued: false, jobId };
      }
      throw err;
    }
  }

  async executeWithLock(
    job: BrakeRecalculationJobData,
  ): Promise<Awaited<ReturnType<BrakeHealthService['recalculate']>>> {
    const lock = await this.lockService.acquire(
      brakeRecalculationLockKey(job.vehicleId),
      LOCK_TTL_MS,
    );
    if (!lock.acquired) {
      const error = new Error('brake_recalc_lock_contended');
      (error as Error & { code?: string }).code = 'LOCK_CONTENTED';
      throw error;
    }

    const startedAt = Date.now();
    try {
      const result = await this.brakeHealth.recalculate(job.vehicleId, {
        force: job.force,
        reason: job.reason ?? undefined,
        actorId: job.actorId ?? undefined,
        trigger: job.trigger,
      });

      if (result?.skipped) {
        this.observability?.recordRecalculation({
          result: 'deduplicated',
          durationMs: Date.now() - startedAt,
          skipReason: result.skipReason ?? 'identical_input_fingerprint',
          trigger: job.trigger,
          vehicleId: job.vehicleId,
        });
      } else if (result) {
        this.observability?.recordRecalculation({
          result: 'success',
          durationMs: Date.now() - startedAt,
          trigger: job.trigger,
          vehicleId: job.vehicleId,
        });
      } else {
        this.observability?.recordRecalculation({
          result: 'skipped',
          durationMs: Date.now() - startedAt,
          skipReason: 'not_initialized_or_missing_odometer',
          trigger: job.trigger,
          vehicleId: job.vehicleId,
        });
      }

      return result;
    } catch (err: unknown) {
      this.observability?.recordRecalculation({
        result: 'failed',
        durationMs: Date.now() - startedAt,
        errorCode: err instanceof Error ? err.message : 'unknown',
        trigger: job.trigger,
        vehicleId: job.vehicleId,
      });
      throw err;
    } finally {
      await this.lockService.release(lock.handle);
    }
  }

  private async clearTerminalJob(jobId: string): Promise<void> {
    try {
      const existing = await this.queue.getJob(jobId);
      if (!existing) return;
      const state = await existing.getState();
      if (state === 'failed' || state === 'completed') {
        await existing.remove();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to clear terminal brake recalc job ${jobId}: ${message}`);
    }
  }
}
