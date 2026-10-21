import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { BrakeRecalculationOrchestratorService } from '../../modules/vehicle-intelligence/brakes/brake-recalculation-orchestrator.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class BrakeRecalculationScheduler {
  private readonly logger = new Logger(BrakeRecalculationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: BrakeRecalculationOrchestratorService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Interval(3600000)
  async enqueueBrakeRecalculationJobs(): Promise<void> {
    if (!this.leaderGuard.shouldRun('brake_recalculation')) return;
    if (!canEnqueueQueue(this.logger, 'brake-recalculation')) return;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const vehicles = await this.prisma.brakeHealthCurrent.findMany({
      where: {
        isInitialized: true,
        OR: [{ lastRecalculatedAt: null }, { lastRecalculatedAt: { lt: oneHourAgo } }],
      },
      select: { vehicleId: true, organizationId: true },
    });

    const hourBucket = Math.floor(Date.now() / 3_600_000);
    for (const v of vehicles) {
      await this.orchestrator.enqueue({
        vehicleId: v.vehicleId,
        organizationId: v.organizationId,
        trigger: 'scheduler',
        hourBucket,
      });
    }

    if (vehicles.length > 0) {
      this.logger.debug(
        `Enqueued ${vehicles.length} brake recalculation jobs (hourBucket=${hourBucket})`,
      );
    }
  }
}
