import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryAssessmentRecomputePayload } from '../battery-v2-job.types';
import { BatteryAssessmentService } from '../../battery-assessment.service';

@Injectable()
export class BatteryAssessmentRecomputeHandler
  implements BatteryV2JobHandler<'BATTERY_ASSESSMENT_RECOMPUTE'>
{
  readonly jobType = 'BATTERY_ASSESSMENT_RECOMPUTE' as const;
  private readonly logger = new Logger(BatteryAssessmentRecomputeHandler.name);

  constructor(private readonly assessmentService: BatteryAssessmentService) {}

  async handle(payload: BatteryAssessmentRecomputePayload): Promise<void> {
    const result = await this.assessmentService.recomputeLvEstimatedHealth({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      shadowMode: payload.assessmentType === 'SHADOW',
    });

    if (!result.ok) {
      this.logger.debug(
        `LV assessment skipped vehicle=${payload.vehicleId} unsupported=${result.unsupportedProfile} reasons=${result.reasons.map((r) => r.code).join(',')}`,
      );
      return;
    }

    this.logger.log(
      `LV assessment recomputed vehicle=${payload.vehicleId} persisted=${result.persistedAssessmentIds.length}`,
    );
  }
}
