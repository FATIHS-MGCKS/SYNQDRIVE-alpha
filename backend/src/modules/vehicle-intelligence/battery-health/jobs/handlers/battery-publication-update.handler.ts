import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryPublicationUpdatePayload } from '../battery-v2-job.types';
import { BatteryPublicationService } from '../../battery-publication.service';

@Injectable()
export class BatteryPublicationUpdateHandler
  implements BatteryV2JobHandler<'BATTERY_PUBLICATION_UPDATE'>
{
  readonly jobType = 'BATTERY_PUBLICATION_UPDATE' as const;
  private readonly logger = new Logger(BatteryPublicationUpdateHandler.name);

  constructor(private readonly publicationService: BatteryPublicationService) {}

  async handle(payload: BatteryPublicationUpdatePayload): Promise<void> {
    if (!payload.assessmentId) {
      this.logger.debug(
        `LV publication skipped vehicle=${payload.vehicleId} — missing assessmentId`,
      );
      return;
    }

    const result = await this.publicationService.updateLvPublication({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      assessmentId: payload.assessmentId,
      publicationVersion:
        payload.publicationVersion != null
          ? Number(payload.publicationVersion)
          : undefined,
    });

    this.logger.log(
      `LV publication evaluated vehicle=${payload.vehicleId} maturity=${result.decision.maturity} persisted=${result.persistedPublicationId ?? 'none'}`,
    );
  }
}
