import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import tireDs4ShadowConfig, { isTireDs4ShadowVehicleAllowlisted } from '@config/tire-ds4-shadow.config';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from './tire-ds4-shadow-adapter.version';
import { TIRE_DS4_SHADOW_JOB_NAME, type TireDs4ShadowJobData } from './tire-ds4-shadow.types';

export type TireDs4ShadowEnqueueInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tireTripUsageLedgerId: string;
  attempt?: number;
  delayMs?: number;
};

@Injectable()
export class TireDs4ShadowProducerService {
  private readonly logger = new Logger(TireDs4ShadowProducerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TIRE_DS4_SHADOW)
    private readonly queue: Queue<TireDs4ShadowJobData>,
    @Inject(tireDs4ShadowConfig.KEY)
    private readonly config: ConfigType<typeof tireDs4ShadowConfig>,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  buildJobId(tireTripUsageLedgerId: string, attempt = 0): string {
    const key =
      attempt === 0
        ? `${TIRE_DS4_SHADOW_ADAPTER_VERSION}:${tireTripUsageLedgerId}`
        : `${TIRE_DS4_SHADOW_ADAPTER_VERSION}:${tireTripUsageLedgerId}:retry:${attempt}`;
    return sanitizeBullMqJobId({ namespace: 'tire-ds4-shadow', key });
  }

  async enqueueMaterialize(input: TireDs4ShadowEnqueueInput): Promise<string | null> {
    if (!this.config.enabled) return null;
    if (!isTireDs4ShadowVehicleAllowlisted(this.config.vehicleAllowlist, input.vehicleId)) {
      return null;
    }
    if (!canEnqueueQueue(this.logger, 'tire-ds4-shadow')) return null;

    const attempt = input.attempt ?? 0;
    const jobId = this.buildJobId(input.tireTripUsageLedgerId, attempt);
    const data: TireDs4ShadowJobData = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      tireTripUsageLedgerId: input.tireTripUsageLedgerId,
      attempt,
    };

    const delay = input.delayMs ?? 0;
    await this.queue.add(TIRE_DS4_SHADOW_JOB_NAME, data, {
      jobId,
      delay,
      removeOnComplete: 500,
      removeOnFail: 2000,
    });

    return jobId;
  }

  computeRetryDelayMs(attempt: number): number {
    const base = this.config.retryBaseMs;
    const cappedAttempt = Math.min(attempt, 10);
    return Math.min(base * 2 ** cappedAttempt, 3_600_000);
  }
}
