import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Interval } from '@nestjs/schedule';
import { VehicleStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class DimoSnapshotScheduler {
  private readonly logger = new Logger(DimoSnapshotScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DIMO_SNAPSHOT) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  @Interval(30000) // 30 seconds
  async enqueueSnapshotJobs(): Promise<void> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        dimoVehicleId: { not: null },
        status: { in: [VehicleStatus.AVAILABLE, VehicleStatus.RENTED] },
        dimoVehicle: {
          connectionStatus: 'CONNECTED',
          tokenId: { not: null },
        },
      },
      include: { dimoVehicle: true },
    });

    for (const v of vehicles) {
      const tokenId = v.dimoVehicle?.tokenId;
      if (tokenId == null) continue;

      try {
        await this.queue.add(
          'snapshot',
          { vehicleId: v.id, dimoTokenId: tokenId },
          {
            jobId: `snapshot-${v.id}`,
            removeOnComplete: true,
            removeOnFail: 3,
          },
        );
      } catch (err: unknown) {
        const msg = (err as Error).message ?? '';
        if (!msg.includes('Duplicate')) {
          this.logger.warn(`Failed to enqueue snapshot for ${v.id}: ${msg}`);
        }
      }
    }

    if (vehicles.length > 0) {
      this.logger.debug(
        `Enqueued ${vehicles.length} snapshot jobs for DIMO polling`,
      );
    }
  }
}
