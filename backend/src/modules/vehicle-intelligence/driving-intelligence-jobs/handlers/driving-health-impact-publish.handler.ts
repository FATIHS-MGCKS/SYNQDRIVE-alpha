import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BrakeHealthService } from '../../brakes/brake-health.service';
import { TireHealthService } from '../../tires/tire-health.service';
import { readTripDrivingImpactProvenance } from '../../driving-impact/driving-impact-provenance.reader';

@Injectable()
export class DrivingHealthImpactPublishJobHandler {
  private readonly logger = new Logger(DrivingHealthImpactPublishJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeHealthService: BrakeHealthService,
    private readonly tireHealthService: TireHealthService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`DRIVING_HEALTH_IMPACT_PUBLISH missing tripId job=${job.id}`);
      return;
    }

    const impact = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId: job.tripId },
    });

    if (!impact) {
      this.logger.debug(`Health impact publish skipped — no impact row trip=${job.tripId}`);
      return;
    }

    const provenance = readTripDrivingImpactProvenance(impact);
    if (provenance.healthEligibility === 'NONE' || provenance.healthEligibility === 'LOW') {
      this.logger.debug(
        `Health impact publish skipped — eligibility=${provenance.healthEligibility} trip=${job.tripId}`,
      );
      return;
    }

    try {
      await this.brakeHealthService.recalculate(job.vehicleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Brake health recalculate failed vehicle=${job.vehicleId}: ${message}`);
    }

    try {
      await this.tireHealthService.recalculate(job.vehicleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tire health recalculate failed vehicle=${job.vehicleId}: ${message}`);
    }

    this.logger.log(
      `DRIVING_HEALTH_IMPACT_PUBLISH completed trip=${job.tripId} eligibility=${provenance.healthEligibility}`,
    );
    this.tripMetrics?.drivingHealthImpactPublished.inc({
      eligibility: provenance.healthEligibility,
    });
  }
}
