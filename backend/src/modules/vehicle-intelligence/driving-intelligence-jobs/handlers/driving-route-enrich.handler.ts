import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripsService } from '../../trips/trips.service';

@Injectable()
export class DrivingRouteEnrichJobHandler {
  private readonly logger = new Logger(DrivingRouteEnrichJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`DRIVING_ROUTE_ENRICH missing tripId job=${job.id}`);
      return;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) {
      this.logger.warn(`DRIVING_ROUTE_ENRICH vehicle not found job=${job.id}`);
      return;
    }

    await this.tripsService.enrichTrip(vehicle.organizationId, job.vehicleId, job.tripId);
    this.logger.log(`DRIVING_ROUTE_ENRICH completed trip=${job.tripId}`);
  }
}
