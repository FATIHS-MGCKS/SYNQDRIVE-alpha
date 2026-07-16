import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { MisuseCaseReconcileService } from './misuse-case-reconcile.service';
import { inferMisuseReconcileTrigger } from './misuse-case-reconcile.trigger';

@Injectable()
export class DrivingMisuseReconcileJobHandler {
  private readonly logger = new Logger(DrivingMisuseReconcileJobHandler.name);

  constructor(private readonly reconcile: MisuseCaseReconcileService) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      throw new Error(`DRIVING_MISUSE_RECONCILE requires tripId (job=${job.id})`);
    }

    const trigger = inferMisuseReconcileTrigger(job);
    const result = await this.reconcile.reconcileTrip({
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      tripId: job.tripId,
      analysisRunId: job.analysisRunId,
      trigger,
    });

    this.logger.debug(
      `DRIVING_MISUSE_RECONCILE completed job=${job.id} trip=${job.tripId} ` +
        `upserted=${result.upserted} resolved=${result.resolved}`,
    );
  }
}
