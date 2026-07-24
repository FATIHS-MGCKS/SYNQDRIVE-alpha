import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { DenySwitchService } from '../deny-switch/deny-switch.service';
import { ScheduledJobRevocationService } from './scheduled-job-revocation.service';
import type { RevocationSchedulerKey } from './revocation-queue-catalog';

export interface QueueEnqueueGuardInput {
  organizationId: string;
  processingActivityId?: string | null;
  vehicleId?: string | null;
  schedulerKey?: RevocationSchedulerKey;
  context?: string;
}

/**
 * Unified enqueue guard — runtime workers flag + deny-switch queue block + scheduler pause.
 */
@Injectable()
export class QueueEnqueueGuardService {
  private readonly logger = new Logger(QueueEnqueueGuardService.name);

  constructor(
    @Inject(forwardRef(() => DenySwitchService))
    private readonly denySwitch: DenySwitchService,
    @Optional() private readonly scheduledJobs?: ScheduledJobRevocationService,
  ) {}

  async mayEnqueue(input: QueueEnqueueGuardInput): Promise<boolean> {
    if (!canEnqueueQueue(this.logger, input.context)) return false;

    if (
      this.denySwitch.isQueueEnqueueDenied(input.organizationId, {
        processingActivityId: input.processingActivityId,
        vehicleId: input.vehicleId,
      })
    ) {
      this.logger.debug(
        `Enqueue denied by deny-switch org=${input.organizationId} context=${input.context ?? 'n/a'}`,
      );
      return false;
    }

    if (input.schedulerKey && this.scheduledJobs) {
      const paused = await this.scheduledJobs.isSchedulerPaused(
        input.organizationId,
        input.schedulerKey,
      );
      if (paused) {
        this.logger.debug(
          `Enqueue denied scheduler paused org=${input.organizationId} scheduler=${input.schedulerKey}`,
        );
        return false;
      }
    }

    return true;
  }
}
