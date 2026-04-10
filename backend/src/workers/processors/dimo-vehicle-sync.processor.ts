import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DimoApiSyncService } from '@modules/dimo/dimo-api-sync.service';
import { PrismaService } from '@shared/database/prisma.service';

@Processor(QUEUE_NAMES.DIMO_VEHICLE_SYNC)
export class DimoVehicleSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(DimoVehicleSyncProcessor.name);

  constructor(
    private readonly dimoApiSync: DimoApiSyncService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const startedAt = new Date();

    try {
      const { synced } = await this.dimoApiSync.fetchAndSyncFromDimoApi();

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      await this.prisma.dimoPollLog.create({
        data: {
          vehicleId: null,
          jobType: DimoPollJobType.VEHICLE_SYNC,
          status: DimoPollStatus.SUCCESS,
          startedAt,
          finishedAt,
          durationMs,
          metaJson: { syncedCount: synced },
        },
      });

      this.logger.log(`DIMO vehicle sync completed: ${synced} vehicles in ${durationMs}ms`);
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const errorMessage = err instanceof Error ? err.message : String(err);

      await this.prisma.dimoPollLog.create({
        data: {
          vehicleId: null,
          jobType: DimoPollJobType.VEHICLE_SYNC,
          status: DimoPollStatus.FAILURE,
          startedAt,
          finishedAt,
          durationMs,
          errorMessage,
        },
      });

      this.logger.warn(`DIMO vehicle sync failed: ${errorMessage}`);
      throw err;
    }
  }
}
