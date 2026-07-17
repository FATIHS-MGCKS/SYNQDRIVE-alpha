import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { LteR1BehaviorEnrichmentService } from '../../trips/lte-r1-behavior-enrichment.service';

@Injectable()
export class DrivingNativeEventsIngestJobHandler {
  private readonly logger = new Logger(DrivingNativeEventsIngestJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lteR1Enrichment: LteR1BehaviorEnrichmentService,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`DRIVING_NATIVE_EVENTS_INGEST missing tripId job=${job.id}`);
      return;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { hardwareType: true },
    });

    if (vehicle?.hardwareType !== 'LTE_R1') {
      this.logger.debug(
        `Native events ingest skipped (non LTE_R1) trip=${job.tripId} hardware=${vehicle?.hardwareType ?? 'unknown'}`,
      );
      return;
    }

    const result = await this.lteR1Enrichment.enrichTrip(job.tripId);
    this.logger.log(
      `DRIVING_NATIVE_EVENTS_INGEST completed trip=${job.tripId} events=${result?.drivingEventsIngested ?? 0}`,
    );
  }
}
