import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  buildExp021MaturationShadowJobId,
  EXP021_MATURATION_SHADOW_TRANSPORT_RETRY_BASE_DELAY_MS,
  REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW_JOB_NAME,
} from './reference-capture-exp021-maturation-shadow.constants';
import type { Exp021MaturationShadowJobData } from './reference-capture-exp021-maturation-shadow-job.types';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import {
  deriveTransportRetryOrdinalFromAttempts,
  hasSuccessfulObservationAttempt,
  isTransportRetryExhausted,
} from './reference-capture-exp021-maturation-shadow-retry-authority.lib';
import {
  computeEnqueueDelayMs,
  computeObservationTargetAt,
} from './reference-capture-exp021-maturation-shadow-schedule.lib';

@Injectable()
export class ReferenceCaptureExp021MaturationShadowRunnerService {
  private readonly logger = new Logger(ReferenceCaptureExp021MaturationShadowRunnerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW)
    private readonly queue: Queue<Exp021MaturationShadowJobData>,
    private readonly repository: ReferenceCaptureExp021MaturationShadowRepository,
    private readonly config: ReferenceCaptureConfig,
  ) {}

  async enqueueObservationSlot(input: {
    observationSlotId: string;
    windowFamilyId: string;
    windowStratumId: string;
    plannedAgeMs: number;
    canonicalWindowTo: Date;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    transportRetryOrdinal?: number;
    now?: Date;
  }): Promise<string | null> {
    if (!this.config.isExp021MaturationShadowEnabled()) {
      return null;
    }

    const transportRetryOrdinal = input.transportRetryOrdinal ?? 0;
    const jobId = buildExp021MaturationShadowJobId({
      windowFamilyId: input.windowFamilyId,
      windowStratumId: input.windowStratumId,
      plannedAgeMs: input.plannedAgeMs,
      transportRetryOrdinal,
    });

    if (transportRetryOrdinal === 0) {
      const linked = await this.repository.linkBullJobIdIfAbsent(input.observationSlotId, jobId);
      if (!linked) {
        const slot = await this.repository.findObservationSlotById(input.observationSlotId);
        if (slot?.bullJobId) {
          return slot.bullJobId;
        }
        return null;
      }
    }

    const targetAt = computeObservationTargetAt(input.canonicalWindowTo, input.plannedAgeMs);
    const delay =
      transportRetryOrdinal > 0
        ? EXP021_MATURATION_SHADOW_TRANSPORT_RETRY_BASE_DELAY_MS * transportRetryOrdinal
        : computeEnqueueDelayMs(targetAt, input.now);

    const data: Exp021MaturationShadowJobData = {
      observationSlotId: input.observationSlotId,
      windowFamilyId: input.windowFamilyId,
      windowStratumId: input.windowStratumId,
      plannedAgeMs: input.plannedAgeMs,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tokenId: input.tokenId,
      transportRetryOrdinal,
    };

    try {
      await this.queue.add(REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW_JOB_NAME, data, {
        jobId,
        delay,
        removeOnComplete: 200,
        removeOnFail: 200,
        attempts: 1,
      });
      if (transportRetryOrdinal === 0) {
        await this.repository.linkBullJobIdIfAbsent(input.observationSlotId, jobId);
      }
      return jobId;
    } catch (error) {
      if (transportRetryOrdinal === 0) {
        await this.repository.clearBullJobId(input.observationSlotId);
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Job') && message.includes('exists')) {
        this.logger.debug(`Maturation shadow job already queued slot=${input.observationSlotId}`);
        return jobId;
      }
      throw error;
    }
  }

  async removeJobIfQueued(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting' || state === 'active') {
      await job.remove();
      return true;
    }
    return false;
  }

  async reconcileExecutionState(limit = 200): Promise<{ recovered: number; cleared: number }> {
    if (!this.config.isExp021MaturationShadowEnabled()) {
      return { recovered: 0, cleared: 0 };
    }

    const slots = await this.repository.findSlotsForReconciliation(limit);
    let recovered = 0;
    let cleared = 0;

    for (const slot of slots) {
      const outcome = await this.reconcileSlot(slot);
      if (outcome === 'recovered') recovered += 1;
      if (outcome === 'cleared') cleared += 1;
    }

    return { recovered, cleared };
  }

  /** @deprecated Use reconcileExecutionState */
  async recoverMissingJobs(limit = 200): Promise<number> {
    const { recovered } = await this.reconcileExecutionState(limit);
    return recovered;
  }

  private async reconcileSlot(
    slot: Awaited<ReturnType<ReferenceCaptureExp021MaturationShadowRepository['findObservationSlotById']>>,
  ): Promise<'recovered' | 'cleared' | 'noop'> {
    if (!slot) {
      return 'noop';
    }

    const { family } = slot.stratum;

    if (hasSuccessfulObservationAttempt(slot.attempts) || isTransportRetryExhausted(slot.attempts)) {
      if (slot.bullJobId) {
        await this.removeJobIfQueued(slot.bullJobId);
        await this.repository.clearBullJobId(slot.id);
        return 'cleared';
      }
      return 'noop';
    }

    const transportRetryOrdinal = deriveTransportRetryOrdinalFromAttempts(slot.attempts);
    if (transportRetryOrdinal == null) {
      return 'noop';
    }

    const expectedJobId = buildExp021MaturationShadowJobId({
      windowFamilyId: family.id,
      windowStratumId: slot.stratum.id,
      plannedAgeMs: slot.plannedAgeMs,
      transportRetryOrdinal,
    });

    const linkedJob = slot.bullJobId ? await this.queue.getJob(slot.bullJobId) : null;
    const expectedJob = await this.queue.getJob(expectedJobId);
    const executableJob = linkedJob ?? expectedJob;

    if (executableJob) {
      const state = await executableJob.getState();
      if (state === 'delayed' || state === 'waiting' || state === 'active') {
        return 'noop';
      }
      if (state === 'completed' || state === 'failed') {
        await this.repository.clearBullJobId(slot.id);
      }
    } else if (slot.bullJobId) {
      await this.repository.clearBullJobId(slot.id);
    }

    const jobId = await this.enqueueObservationSlot({
      observationSlotId: slot.id,
      windowFamilyId: family.id,
      windowStratumId: slot.stratum.id,
      plannedAgeMs: slot.plannedAgeMs,
      canonicalWindowTo: family.canonicalWindowTo,
      organizationId: family.organizationId,
      vehicleId: family.vehicleId,
      tokenId: family.tokenId,
      transportRetryOrdinal,
    });

    return jobId ? 'recovered' : 'noop';
  }
}
