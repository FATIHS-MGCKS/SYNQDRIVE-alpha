import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryAssessmentRecomputePayload } from '../battery-v2-job.types';
import { BatteryAssessmentService } from '../../battery-assessment.service';
import {
  LvRestAssessmentHandoffService,
  mapAssessmentRecomputeOutcome,
} from '../../lv-rest-window/lv-rest-assessment-handoff.service';
import {
  LvPublicationHandoffService,
} from '../../lv-assessment/lv-publication-handoff.service';

@Injectable()
export class BatteryAssessmentRecomputeHandler
  implements BatteryV2JobHandler<'BATTERY_ASSESSMENT_RECOMPUTE'>
{
  readonly jobType = 'BATTERY_ASSESSMENT_RECOMPUTE' as const;
  private readonly logger = new Logger(BatteryAssessmentRecomputeHandler.name);

  constructor(
    private readonly assessmentService: BatteryAssessmentService,
    private readonly assessmentHandoff: LvRestAssessmentHandoffService,
    private readonly publicationHandoff: LvPublicationHandoffService,
  ) {}

  async handle(payload: BatteryAssessmentRecomputePayload): Promise<void> {
    const result = await this.assessmentService.recomputeLvEstimatedHealth({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      shadowMode: payload.assessmentType === 'SHADOW',
    });

    if (payload.sourceEntityId) {
      await this.assessmentHandoff.acknowledgeExecuted({
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        measurementId: payload.sourceEntityId,
        outcome: mapAssessmentRecomputeOutcome(result),
      });
    }

    if (!result.ok) {
      this.logger.debug(
        `LV assessment skipped vehicle=${payload.vehicleId} unsupported=${result.unsupportedProfile} reasons=${result.reasons.map((r) => r.code).join(',')}`,
      );
      return;
    }

    this.logger.log(
      `LV assessment recomputed vehicle=${payload.vehicleId} persisted=${result.persistedAssessmentIds.length}`,
    );

    if (result.persistedEpochAssessments.length > 0) {
      const handoffResult = await this.publicationHandoff.ensurePublicationHandoff({
        organizationId: payload.organizationId,
        vehicleId: payload.vehicleId,
        epochCandidates: result.persistedEpochAssessments.map((row) => ({
          assessmentId: row.assessmentId,
          assessmentTrack: row.assessmentTrack,
          assessmentMode: row.assessmentMode,
        })),
        correlationPrefix: 'lv-assess-pub-handoff',
      });

      this.logger.log(
        `LV publication handoff vehicle=${payload.vehicleId} enqueued=${handoffResult.enqueued} selected=${handoffResult.selectedAssessmentId ?? 'none'} track=${handoffResult.selectedAssessmentTrack ?? 'none'}`,
      );
    }
  }
}
