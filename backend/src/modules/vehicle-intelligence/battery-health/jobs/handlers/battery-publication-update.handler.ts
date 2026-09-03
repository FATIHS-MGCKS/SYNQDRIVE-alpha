import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryPublicationUpdatePayload } from '../battery-v2-job.types';
import { BatteryPublicationService } from '../../battery-publication.service';
import {
  LvPublicationHandoffService,
  mapPublicationUpdateOutcome,
} from '../../lv-assessment/lv-publication-handoff.service';
import {
  BATTERY_V2_JOB_ERROR_CODES,
  BatteryV2JobProcessingError,
} from '../battery-v2-job.errors';

@Injectable()
export class BatteryPublicationUpdateHandler
  implements BatteryV2JobHandler<'BATTERY_PUBLICATION_UPDATE'>
{
  readonly jobType = 'BATTERY_PUBLICATION_UPDATE' as const;
  private readonly logger = new Logger(BatteryPublicationUpdateHandler.name);

  constructor(
    private readonly publicationService: BatteryPublicationService,
    private readonly publicationHandoff: LvPublicationHandoffService,
  ) {}

  async handle(payload: BatteryPublicationUpdatePayload): Promise<void> {
    const assessmentId = payload.assessmentId;
    if (!assessmentId) {
      this.logger.debug(
        `LV publication skipped vehicle=${payload.vehicleId} — missing assessmentId`,
      );
      return;
    }

    const result = await this.publicationService.updateLvPublication({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      assessmentId,
      publicationVersion:
        typeof payload.publicationVersion === 'number'
          ? payload.publicationVersion
          : undefined,
    });

    if (!result.ok) {
      throw new BatteryV2JobProcessingError({
        code: BATTERY_V2_JOB_ERROR_CODES.HANDLER_FAILED,
        message: `lv_publication_update_failed:${result.decision.reasons.map((r) => r.code).join(',')}`,
        retryable: true,
        jobType: 'BATTERY_PUBLICATION_UPDATE',
      });
    }

    await this.publicationHandoff.acknowledgeExecuted({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      assessmentId,
      outcome: mapPublicationUpdateOutcome({
        ok: result.ok,
        persistedPublicationId: result.persistedPublicationId,
      }),
    });

    this.logger.log(
      `LV publication evaluated vehicle=${payload.vehicleId} maturity=${result.decision.maturity} persisted=${result.persistedPublicationId ?? 'none'}`,
    );
  }
}
