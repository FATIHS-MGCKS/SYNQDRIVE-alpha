import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryObservationClassifyPayload } from '../battery-v2-job.types';
import { BatteryV2SnapshotIngestionService } from '../battery-v2-snapshot-ingestion.service';

@Injectable()
export class BatteryObservationClassifyHandler
  implements BatteryV2JobHandler<'BATTERY_OBSERVATION_CLASSIFY'>
{
  readonly jobType = 'BATTERY_OBSERVATION_CLASSIFY' as const;
  private readonly logger = new Logger(BatteryObservationClassifyHandler.name);

  constructor(private readonly ingestion: BatteryV2SnapshotIngestionService) {}

  async handle(payload: BatteryObservationClassifyPayload): Promise<void> {
    this.logger.debug(
      `Battery V2 classify job org=${payload.organizationId} vehicle=${payload.vehicleId}`,
    );
    await this.ingestion.ingestObservationClassify(payload);
  }
}
