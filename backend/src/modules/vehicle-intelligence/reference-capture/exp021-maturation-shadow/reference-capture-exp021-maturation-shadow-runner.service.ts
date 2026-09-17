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

    const linked = await this.repository.linkBullJobIdIfAbsent(input.observationSlotId, jobId);
    if (!linked && transportRetryOrdinal === 0) {
      const slot = await this.repository.findObservationSlotById(input.observationSlotId);
      if (slot?.bullJobId) {
        return slot.bullJobId;
      }
      return null;
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
      return jobId;
    } catch (error) {
      await this.repository.clearBullJobId(input.observationSlotId);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Job') && message.includes('exists')) {
        this.logger.debug(`Maturation shadow job already queued slot=${input.observationSlotId}`);
        return jobId;
      }
      throw error;
    }
  }

  async recoverMissingJobs(limit = 200): Promise<number> {
    if (!this.config.isExp021MaturationShadowEnabled()) {
      return 0;
    }

    const slots = await this.repository.findSlotsMissingBullJob(limit);
    let recovered = 0;
    for (const slot of slots) {
      const jobId = await this.enqueueObservationSlot({
        observationSlotId: slot.id,
        windowFamilyId: slot.stratum.family.id,
        windowStratumId: slot.stratum.id,
        plannedAgeMs: slot.plannedAgeMs,
        canonicalWindowTo: slot.stratum.family.canonicalWindowTo,
        organizationId: slot.stratum.family.organizationId,
        vehicleId: slot.stratum.family.vehicleId,
        tokenId: slot.stratum.family.tokenId,
      });
      if (jobId) {
        recovered += 1;
      }
    }
    return recovered;
  }
}
