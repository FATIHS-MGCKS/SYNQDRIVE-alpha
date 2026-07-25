import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';

/**
 * VW-F-038: optional rental-health Redis cache warm on worker boot.
 * Enabled via RENTAL_HEALTH_CACHE_WARM_ON_BOOT=true.
 */
@Injectable()
export class RentalHealthCacheWarmService implements OnModuleInit {
  private readonly logger = new Logger(RentalHealthCacheWarmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalHealth: RentalHealthService,
    @Optional() private readonly cache?: RentalHealthSummaryCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.RENTAL_HEALTH_CACHE_WARM_ON_BOOT !== 'true') return;
    if (!this.cache) return;

    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
      take: 20,
    });

    let warmed = 0;
    for (const org of orgs) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: {
          organizationId: org.id,
          status: { in: ['AVAILABLE', 'RENTED', 'RESERVED', 'IN_SERVICE'] },
        },
        select: { id: true },
        take: 50,
      });
      for (const vehicle of vehicles) {
        try {
          const health = await this.rentalHealth.getVehicleHealth(org.id, vehicle.id);
          await this.cache.set(org.id, vehicle.id, health);
          warmed += 1;
        } catch {
          // skip individual vehicle failures during warm
        }
      }
    }

    this.logger.log(`Rental-health cache warm complete: ${warmed} vehicle rows`);
  }
}
