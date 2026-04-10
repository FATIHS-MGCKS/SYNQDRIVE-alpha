import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeHealthService } from '../../modules/vehicle-intelligence/brakes/brake-health.service';

@Injectable()
export class BrakeRecalculationScheduler {
  private readonly logger = new Logger(BrakeRecalculationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeHealth: BrakeHealthService,
  ) {}

  @Interval(3600000)
  async recalculateAll(): Promise<void> {
    const vehicles = await this.prisma.brakeHealthCurrent.findMany({
      where: { isInitialized: true },
      select: { vehicleId: true },
    });

    let count = 0;
    for (const v of vehicles) {
      try {
        await this.brakeHealth.recalculate(v.vehicleId);
        count++;
      } catch (err: any) {
        this.logger.warn(`Brake recalc failed for ${v.vehicleId}: ${err.message}`);
      }
    }

    if (count > 0) {
      this.logger.debug(`Brake health recalculated for ${count}/${vehicles.length} vehicles`);
    }
  }
}
