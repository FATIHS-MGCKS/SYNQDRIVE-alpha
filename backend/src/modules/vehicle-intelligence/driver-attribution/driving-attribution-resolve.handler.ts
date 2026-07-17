import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { DriverAttributionService } from './driver-attribution.service';

@Injectable()
export class DrivingAttributionResolveJobHandler {
  private readonly logger = new Logger(DrivingAttributionResolveJobHandler.name);

  constructor(private readonly driverAttributionService: DriverAttributionService) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`DRIVING_ATTRIBUTION_RESOLVE missing tripId job=${job.id}`);
      return;
    }

    await this.driverAttributionService.materializePipelineSnapshot({
      organizationId: job.organizationId,
      tripId: job.tripId,
      analysisRunId: job.analysisRunId,
      pipelineJobId: job.id,
    });
  }
}
