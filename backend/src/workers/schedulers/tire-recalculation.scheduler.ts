import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Interval } from '@nestjs/schedule';
import { TireSetupStatus, VehicleStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class TireRecalculationScheduler {
  private readonly logger = new Logger(TireRecalculationScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TIRE_RECALCULATION) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  @Interval(3600000)
  async enqueueTireRecalculationJobs(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const setups = await this.prisma.vehicleTireSetup.findMany({
      where: {
        status: TireSetupStatus.ACTIVE,
        removedAt: null,
        OR: [
          { lastRecalculatedAt: null },
          { lastRecalculatedAt: { lt: oneHourAgo } },
        ],
      },
      select: { vehicleId: true },
      distinct: ['vehicleId'],
    });

    // jobId includes an hourly bucket so that scheduler runs inside the same
    // hour naturally deduplicate against an already-queued / running job for
    // the same vehicle, while still letting a new job be created in the next
    // hour window. Combined with defaultJobOptions (removeOnComplete), this
    // prevents unbounded Redis memory growth.
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    for (const s of setups) {
      await this.queue.add(
        'tire-recalc',
        { vehicleId: s.vehicleId },
        {
          jobId: `tire-recalc:${s.vehicleId}:${hourBucket}`,
          removeOnComplete: { count: 500, age: 24 * 3600 },
          removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
        },
      );
    }

    if (setups.length > 0) {
      this.logger.debug(
        `Enqueued ${setups.length} tire recalculation jobs (hourBucket=${hourBucket})`,
      );
    }
  }
}
