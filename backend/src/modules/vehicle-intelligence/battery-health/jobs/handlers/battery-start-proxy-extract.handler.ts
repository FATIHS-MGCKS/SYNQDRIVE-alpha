import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryStartProxyExtractPayload } from '../battery-v2-job.types';
import { BatteryV2SnapshotIngestionService } from '../battery-v2-snapshot-ingestion.service';

@Injectable()
export class BatteryStartProxyExtractHandler
  implements BatteryV2JobHandler<'BATTERY_START_PROXY_EXTRACT'>
{
  readonly jobType = 'BATTERY_START_PROXY_EXTRACT' as const;
  private readonly logger = new Logger(BatteryStartProxyExtractHandler.name);

  constructor(private readonly ingestion: BatteryV2SnapshotIngestionService) {}

  async handle(payload: BatteryStartProxyExtractPayload): Promise<void> {
    this.logger.debug(
      `Battery V2 start proxy job org=${payload.organizationId} vehicle=${payload.vehicleId} trip=${payload.tripId}`,
    );
    await this.ingestion.ingestStartProxyExtract({
      vehicleId: payload.vehicleId,
      tripId: payload.tripId,
      tripStartedAt: payload.tripStartedAt,
    });
  }
}
