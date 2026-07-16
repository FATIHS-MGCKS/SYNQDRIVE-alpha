import { Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJob } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingAnalysisStageRepository } from '../driving-analysis-stage/driving-analysis-stage.repository';
import { DimoTripSegmentValidationService } from './dimo-trip-segment-validation.service';

@Injectable()
export class DimoTripSegmentValidateJobHandler {
  private readonly logger = new Logger(DimoTripSegmentValidateJobHandler.name);

  constructor(
    private readonly validation: DimoTripSegmentValidationService,
    private readonly stageRepository: DrivingAnalysisStageRepository,
    private readonly prisma: PrismaService,
  ) {}

  async handle(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`Segment validate job ${job.id} missing tripId — skipping`);
      return;
    }

    if (!this.validation.isEnabled()) {
      await this.stageRepository.markSkipped(
        job.organizationId,
        job.analysisRunId,
        'SEGMENT_VALIDATE',
        'DIMO_SEGMENT_VALIDATION_DISABLED',
      );
      this.logger.debug(
        `Segment validation skipped (flag off) trip=${job.tripId} run=${job.analysisRunId}`,
      );
      return;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: {
        id: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    const result = await this.validation.validateCompletedTrip({
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      tripId: job.tripId,
      analysisRunId: job.analysisRunId,
      dimoTokenId: vehicle?.dimoVehicle?.tokenId ?? null,
    });

    this.logger.log(
      `Segment validate job completed trip=${job.tripId} ` +
        `status=${result.overallStatus ?? 'skipped'} skipped=${result.skipped}`,
    );
  }
}
