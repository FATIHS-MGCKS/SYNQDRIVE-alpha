import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import {
  type AnalysisStageName,
  type AnalysisStageState,
  type AnalysisStagesJson,
  type TripAnalysisStatus,
  areAnalysisStagesComplete,
  emptyAnalysisStages,
  hasAnalysisStageFailure,
  isAnalysisPartiallyReady,
  mapAnalysisStatusToLegacySummaryStatus,
  parseAnalysisStagesJson,
} from './trip-analysis-status';

@Injectable()
export class TripAnalysisCoordinatorService {
  private readonly logger = new Logger(TripAnalysisCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async onAnalysisEnqueued(tripId: string): Promise<void> {
    const now = new Date();
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripAnalysisStatus: 'IN_PROGRESS',
        analysisQueuedAt: now,
        analysisStartedAt: null,
        analysisPartialAt: null,
        analysisCompletedAt: null,
        analysisFailedAt: null,
        analysisFailedReason: null,
        analysisLatencyMs: null,
        analysisStagesJson: emptyAnalysisStages() as Prisma.InputJsonValue,
        behaviorSummaryStatus: 'PENDING',
        drivingImpactStatus: 'PENDING',
      },
    });
    this.logger.debug(`Trip analysis enqueued: trip=${tripId}`);
  }

  async onAnalysisStarted(tripId: string): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { analysisStartedAt: true },
    });
    if (trip?.analysisStartedAt) return;

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripAnalysisStatus: 'IN_PROGRESS',
        analysisStartedAt: new Date(),
      },
    });
  }

  async onAnalysisSkipped(tripId: string, reason: string): Promise<void> {
    const now = new Date();
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { analysisQueuedAt: true, analysisStagesJson: true },
    });
    const stages = parseAnalysisStagesJson(trip?.analysisStagesJson);
    stages.behavior = 'skipped';
    stages.route = 'skipped';
    stages.misuse = 'skipped';
    stages.drivingImpact = 'skipped';

    const latencyMs = trip?.analysisQueuedAt
      ? now.getTime() - trip.analysisQueuedAt.getTime()
      : null;

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripAnalysisStatus: 'SKIPPED',
        analysisCompletedAt: now,
        analysisLatencyMs: latencyMs,
        analysisFailedReason: reason.slice(0, 500),
        analysisStagesJson: stages as Prisma.InputJsonValue,
        behaviorSummaryStatus: 'SKIPPED',
        drivingImpactStatus: 'SKIPPED',
      },
    });
    this.logger.log(`Trip analysis SKIPPED: trip=${tripId} reason=${reason}`);
  }

  async onAnalysisFailed(tripId: string, reason: string, stage?: AnalysisStageName): Promise<void> {
    const now = new Date();
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { analysisQueuedAt: true, analysisStagesJson: true },
    });
    const stages = parseAnalysisStagesJson(trip?.analysisStagesJson);
    if (stage) {
      stages[stage] = 'failed';
    }

    const latencyMs = trip?.analysisQueuedAt
      ? now.getTime() - trip.analysisQueuedAt.getTime()
      : null;

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripAnalysisStatus: 'FAILED',
        analysisFailedAt: now,
        analysisFailedReason: reason.slice(0, 500),
        analysisLatencyMs: latencyMs,
        analysisStagesJson: stages as Prisma.InputJsonValue,
        behaviorSummaryStatus: 'FAILED',
      },
    });
    this.tripMetrics?.enrichmentFailed.inc({ stage: stage ?? 'analysis_pipeline' });
    this.logger.warn(`Trip analysis FAILED: trip=${tripId} stage=${stage ?? 'unknown'} reason=${reason}`);
  }

  async markStage(
    tripId: string,
    stage: AnalysisStageName,
    state: AnalysisStageState,
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        tripAnalysisStatus: true,
        analysisQueuedAt: true,
        analysisPartialAt: true,
        analysisStagesJson: true,
      },
    });
    if (!trip) return;

    const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
    stages[stage] = state;

    const now = new Date();
    const data: Record<string, unknown> = {
      analysisStagesJson: stages as Prisma.InputJsonValue,
    };

    if (stage === 'drivingImpact' && (state === 'done' || state === 'skipped')) {
      data.drivingImpactStatus = state === 'done' ? 'READY' : 'SKIPPED';
    }

    if (stages.behavior === 'skipped') {
      await this.onAnalysisSkipped(tripId, 'behavior_skipped');
      return;
    }

    if (stages.behavior === 'failed') {
      await this.onAnalysisFailed(tripId, `${stage}_failed`, stage);
      return;
    }

    if (hasAnalysisStageFailure(stages)) {
      await this.onAnalysisFailed(tripId, `${stage}_failed`, stage);
      return;
    }

    let nextStatus: TripAnalysisStatus = (trip.tripAnalysisStatus as TripAnalysisStatus) ?? 'IN_PROGRESS';

    if (areAnalysisStagesComplete(stages)) {
      nextStatus = 'COMPLETED';
      const latencyMs = trip.analysisQueuedAt
        ? now.getTime() - trip.analysisQueuedAt.getTime()
        : null;
      Object.assign(data, {
        tripAnalysisStatus: 'COMPLETED',
        analysisCompletedAt: now,
        analysisLatencyMs: latencyMs,
        analysisFailedAt: null,
        analysisFailedReason: null,
        behaviorSummaryStatus: 'READY',
      });
      if (latencyMs != null) {
        this.tripMetrics?.tripFinalizeLatency.observe({ profile: 'analysis' }, latencyMs / 1000);
      }
      this.logger.log(
        `Trip analysis COMPLETED: trip=${tripId} latencyMs=${latencyMs ?? 'n/a'}`,
      );
    } else if (isAnalysisPartiallyReady(stages)) {
      nextStatus = 'PARTIAL';
      Object.assign(data, {
        tripAnalysisStatus: 'PARTIAL',
        analysisPartialAt: trip.analysisPartialAt ?? now,
        behaviorSummaryStatus: 'PENDING',
      });
      this.logger.debug(`Trip analysis PARTIAL: trip=${tripId} stages=${JSON.stringify(stages)}`);
    } else {
      Object.assign(data, { tripAnalysisStatus: nextStatus });
    }

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: data as any,
    });
  }
}
