import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import {
  type AnalysisAssessabilityContext,
  type AnalysisStageName,
  type AnalysisStageState,
  type AnalysisStagesJson,
  type TripAnalysisStatus,
  emptyAnalysisStages,
  mergeAssessabilityIntoSummary,
  parseAnalysisStagesJson,
  parseBehaviorSummaryJson,
  resolveTripAnalysisStatusFromStages,
} from './trip-analysis-status';
import type { DrivingImpactOutcome } from '../driving-impact/driving-impact-outcome.types';

export interface AnalysisDiagnosticSnapshot {
  tripId: string;
  vehicleId: string;
  hardwareType: string | null;
  tripAnalysisStatus: string | null;
  behaviorEnrichmentStatus: string | null;
  behaviorSummaryStatus: string | null;
  drivingImpactStatus: string | null;
  analysisAssessability: string;
  analysisLimitReason: string | null;
  hfPointsTotal: number | null;
  hfPointsCleaned: number | null;
  hfInsufficientForAbuse: boolean;
  nativeBehaviorEventsAvailable: boolean;
  nativeEventCount: number | null;
}

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

  /**
   * Persist assessability after successful behavior enrichment and mark behavior done.
   * Does not finalize trip analysis — downstream stages may still run.
   */
  async onBehaviorCompleted(
    tripId: string,
    assessability: AnalysisAssessabilityContext,
  ): Promise<void> {
    await this.persistAssessability(tripId, assessability);
    await this.markStage(tripId, 'behavior', 'done', assessability);
  }

  /**
   * Stage-specific behavior skip with assessability-aware terminal status.
   * Downstream stages are skipped only when no assessable source exists.
   */
  async onBehaviorSkipped(
    tripId: string,
    reason: string,
    assessability: AnalysisAssessabilityContext,
  ): Promise<void> {
    await this.persistAssessability(tripId, assessability);

    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { analysisQueuedAt: true, analysisStagesJson: true },
    });
    if (!trip) return;

    const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
    stages.behavior = 'skipped';
    stages.nativeEvents = 'skipped';
    stages.route = 'skipped';
    stages.eventContext = 'skipped';
    stages.misuse = 'skipped';
    stages.drivingImpact = 'skipped';
    stages.attribution = 'skipped';

    const now = new Date();
    const latencyMs = trip.analysisQueuedAt
      ? now.getTime() - trip.analysisQueuedAt.getTime()
      : null;

    const resolved = resolveTripAnalysisStatusFromStages(stages, {
      assessability,
      analysisQueued: true,
    });
    const terminalStatus = resolved.legacyTripAnalysisStatus as TripAnalysisStatus;

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripAnalysisStatus: terminalStatus,
        analysisCompletedAt: now,
        analysisLatencyMs: latencyMs,
        analysisFailedReason: reason.slice(0, 500),
        analysisStagesJson: stages as Prisma.InputJsonValue,
        behaviorSummaryStatus: 'SKIPPED',
        drivingImpactStatus: 'SKIPPED',
      },
    });

    await this.logAnalysisDiagnostics(tripId, assessability);
    this.logger.log(
      `Trip analysis behavior SKIPPED: trip=${tripId} status=${terminalStatus} reason=${reason} ` +
        `assessability=${assessability.analysisAssessability}`,
    );
  }

  async onAnalysisFailed(tripId: string, reason: string, stage?: AnalysisStageName): Promise<void> {
    const now = new Date();
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { analysisQueuedAt: true, analysisStagesJson: true, vehicleId: true },
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
    if (trip?.vehicleId) {
      await this.logAnalysisDiagnostics(tripId);
    }
  }

  /**
   * Apply driving-impact terminal outcome with optional transaction client.
   * Used by DrivingImpactStatusSyncService for atomic impact-row + status writes.
   */
  async applyDrivingImpactOutcome(
    tripId: string,
    outcome: DrivingImpactOutcome,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const trip = await db.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        tripAnalysisStatus: true,
        analysisQueuedAt: true,
        analysisPartialAt: true,
        analysisStagesJson: true,
        behaviorSummaryStatus: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryJson: true,
      },
    });
    if (!trip) return;

    const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
    stages.drivingImpact = outcome.stageState;

    const now = outcome.calculatedAt ?? new Date();
    const assess = this.assessabilityFromTrip(
      trip.behaviorSummaryJson,
      trip.behaviorEnrichmentStatus,
    );

    const resolved = resolveTripAnalysisStatusFromStages(stages, {
      assessability: assess,
      analysisQueued: trip.analysisQueuedAt != null,
    });

    const data: Record<string, unknown> = {
      analysisStagesJson: stages as Prisma.InputJsonValue,
      tripAnalysisStatus: resolved.legacyTripAnalysisStatus,
      drivingImpactStatus: outcome.drivingImpactStatus,
    };

    if (outcome.calculatedAt) {
      data.drivingImpactComputedAt = outcome.calculatedAt;
    }

    if (outcome.drivingImpactStatus === 'FAILED') {
      data.analysisFailedAt = now;
      data.analysisFailedReason = outcome.failureReason ?? 'driving_impact_failed';
      this.tripMetrics?.enrichmentFailed.inc({ stage: 'drivingImpact' });
    }

    if (
      resolved.status === 'COMPLETED' ||
      resolved.status === 'SKIPPED' ||
      resolved.status === 'NOT_ASSESSABLE'
    ) {
      const latencyMs = trip.analysisQueuedAt
        ? now.getTime() - trip.analysisQueuedAt.getTime()
        : null;

      Object.assign(data, {
        analysisCompletedAt: now,
        analysisLatencyMs: latencyMs,
        analysisFailedAt: outcome.drivingImpactStatus === 'FAILED' ? now : null,
        analysisFailedReason:
          outcome.drivingImpactStatus === 'FAILED' ? outcome.failureReason ?? null : null,
        behaviorSummaryStatus: this.resolveBehaviorSummaryStatus(
          stages,
          trip.behaviorEnrichmentStatus,
        ),
      });
      if (latencyMs != null && outcome.drivingImpactStatus !== 'FAILED') {
        this.tripMetrics?.tripFinalizeLatency.observe({ profile: 'analysis' }, latencyMs / 1000);
      }
    } else if (resolved.status === 'PARTIAL') {
      Object.assign(data, {
        analysisPartialAt: trip.analysisPartialAt ?? now,
        behaviorSummaryStatus: 'READY',
      });
    } else if (resolved.status === 'IN_PROGRESS') {
      Object.assign(data, {
        behaviorSummaryStatus:
          stages.behavior === 'done'
            ? 'READY'
            : stages.behavior === 'skipped'
              ? 'SKIPPED'
              : trip.behaviorSummaryStatus ?? 'PENDING',
      });
    }

    await db.vehicleTrip.update({
      where: { id: tripId },
      data: data as any,
    });

    if (!tx) {
      await this.logAnalysisDiagnostics(tripId, assess);
    }
  }

  async markStage(
    tripId: string,
    stage: AnalysisStageName,
    state: AnalysisStageState,
    assessability?: AnalysisAssessabilityContext,
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        tripAnalysisStatus: true,
        analysisQueuedAt: true,
        analysisPartialAt: true,
        analysisStagesJson: true,
        behaviorSummaryStatus: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryJson: true,
      },
    });
    if (!trip) return;

    const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
    stages[stage] = state;

    const now = new Date();
    const assess =
      assessability ??
      this.assessabilityFromTrip(trip.behaviorSummaryJson, trip.behaviorEnrichmentStatus);

    const resolved = resolveTripAnalysisStatusFromStages(stages, {
      assessability: assess,
      analysisQueued: trip.analysisQueuedAt != null,
    });

    if (resolved.status === 'FAILED') {
      await this.onAnalysisFailed(tripId, `${stage}_failed`, stage);
      return;
    }

    const data: Record<string, unknown> = {
      analysisStagesJson: stages as Prisma.InputJsonValue,
      tripAnalysisStatus: resolved.legacyTripAnalysisStatus,
    };

    if (stage === 'drivingImpact') {
      if (state === 'done') {
        data.drivingImpactStatus = 'READY';
      } else if (state === 'skipped') {
        data.drivingImpactStatus = 'SKIPPED';
      } else if (state === 'failed') {
        data.drivingImpactStatus = 'FAILED';
      }
    }

    if (
      resolved.status === 'COMPLETED' ||
      resolved.status === 'SKIPPED' ||
      resolved.status === 'NOT_ASSESSABLE'
    ) {
      const latencyMs = trip.analysisQueuedAt
        ? now.getTime() - trip.analysisQueuedAt.getTime()
        : null;

      Object.assign(data, {
        analysisCompletedAt: now,
        analysisLatencyMs: latencyMs,
        analysisFailedAt: null,
        analysisFailedReason: null,
        behaviorSummaryStatus: this.resolveBehaviorSummaryStatus(
          stages,
          trip.behaviorEnrichmentStatus,
        ),
        drivingImpactStatus:
          stages.drivingImpact === 'done'
            ? 'READY'
            : stages.drivingImpact === 'skipped'
              ? 'SKIPPED'
              : stages.drivingImpact === 'failed'
                ? 'FAILED'
                : undefined,
      });
      if (latencyMs != null) {
        this.tripMetrics?.tripFinalizeLatency.observe({ profile: 'analysis' }, latencyMs / 1000);
      }
      this.logger.log(
        `Trip analysis ${resolved.legacyTripAnalysisStatus}: trip=${tripId} latencyMs=${latencyMs ?? 'n/a'}`,
      );
      await this.logAnalysisDiagnostics(tripId, assess);
    } else if (resolved.status === 'PARTIAL') {
      Object.assign(data, {
        analysisPartialAt: trip.analysisPartialAt ?? now,
        behaviorSummaryStatus: 'READY',
      });
      this.logger.debug(`Trip analysis PARTIAL: trip=${tripId} stages=${JSON.stringify(stages)}`);
      await this.logAnalysisDiagnostics(tripId, assessability);
    } else if (resolved.status === 'IN_PROGRESS') {
      Object.assign(data, {
        behaviorSummaryStatus:
          stages.behavior === 'done'
            ? 'READY'
            : stages.behavior === 'skipped'
              ? 'SKIPPED'
              : trip.behaviorSummaryStatus ?? 'PENDING',
      });
    }

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: data as any,
    });
  }

  /**
   * Recover trips stuck in PARTIAL with misuse stage still pending after a process restart.
   * Returns trip IDs that need misuse re-evaluation.
   */
  async findStuckMisuseTrips(limit = 50, staleMinutes = 10): Promise<string[]> {
    const cutoff = new Date(Date.now() - staleMinutes * 60_000);
    const candidates = await this.prisma.vehicleTrip.findMany({
      where: {
        tripAnalysisStatus: 'PARTIAL',
        analysisPartialAt: { lt: cutoff },
        behaviorEnrichmentStatus: 'COMPLETED',
      },
      select: { id: true, analysisStagesJson: true },
      take: limit,
      orderBy: { analysisPartialAt: 'asc' },
    });

    return candidates
      .filter((t) => {
        const stages = parseAnalysisStagesJson(t.analysisStagesJson);
        return stages.behavior === 'done' && stages.misuse === 'pending';
      })
      .map((t) => t.id);
  }

  async logAnalysisDiagnostics(
    tripId: string,
    assessabilityOverride?: AnalysisAssessabilityContext,
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        tripAnalysisStatus: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryStatus: true,
        drivingImpactStatus: true,
        behaviorSummaryJson: true,
        vehicle: { select: { hardwareType: true } },
      },
    });
    if (!trip) return;

    const summary = parseBehaviorSummaryJson(trip.behaviorSummaryJson);
    const assess =
      assessabilityOverride ??
      ({
        analysisAssessability: String(summary.analysisAssessability ?? 'NOT_ASSESSABLE'),
        analysisLimitReason: (summary.analysisLimitReason as string | null) ?? null,
        hfInsufficientForAbuse: summary.hfInsufficientForAbuse === true,
        nativeBehaviorEventsAvailable: summary.nativeBehaviorEventsAvailable === true,
        nativeEventCount: typeof summary.nativeEventCount === 'number' ? summary.nativeEventCount : null,
        hfPointsTotal: typeof summary.hfPointsTotal === 'number' ? summary.hfPointsTotal : null,
        hfPointsCleaned: typeof summary.hfPointsCleaned === 'number' ? summary.hfPointsCleaned : null,
      } as AnalysisAssessabilityContext);

    const snapshot: AnalysisDiagnosticSnapshot = {
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      hardwareType: trip.vehicle?.hardwareType ?? null,
      tripAnalysisStatus: trip.tripAnalysisStatus,
      behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
      behaviorSummaryStatus: trip.behaviorSummaryStatus,
      drivingImpactStatus: trip.drivingImpactStatus,
      analysisAssessability: assess.analysisAssessability,
      analysisLimitReason: assess.analysisLimitReason,
      hfPointsTotal: assess.hfPointsTotal ?? null,
      hfPointsCleaned: assess.hfPointsCleaned ?? null,
      hfInsufficientForAbuse: assess.hfInsufficientForAbuse,
      nativeBehaviorEventsAvailable: assess.nativeBehaviorEventsAvailable,
      nativeEventCount: assess.nativeEventCount ?? null,
    };

    this.logger.log(`Trip analysis diagnostics: ${JSON.stringify(snapshot)}`);
  }

  private async persistAssessability(
    tripId: string,
    assessability: AnalysisAssessabilityContext,
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { behaviorSummaryJson: true },
    });
    const existing = parseBehaviorSummaryJson(trip?.behaviorSummaryJson);
    const merged = mergeAssessabilityIntoSummary(existing, assessability);

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: { behaviorSummaryJson: merged as Prisma.InputJsonValue },
    });
  }

  private resolveBehaviorSummaryStatus(
    stages: AnalysisStagesJson,
    behaviorEnrichmentStatus: string | null | undefined,
  ): string {
    if (stages.behavior === 'done' || behaviorEnrichmentStatus === 'COMPLETED') return 'READY';
    if (stages.behavior === 'skipped' || behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA') {
      return 'SKIPPED';
    }
    return 'PENDING';
  }

  private assessabilityFromTrip(
    behaviorSummaryJson: unknown,
    behaviorEnrichmentStatus: string | null | undefined,
  ): AnalysisAssessabilityContext {
    const summary = parseBehaviorSummaryJson(behaviorSummaryJson);
    return {
      analysisAssessability:
        (summary.analysisAssessability as AnalysisAssessabilityContext['analysisAssessability']) ??
        (behaviorEnrichmentStatus === 'COMPLETED' ? 'FULL' : 'NOT_ASSESSABLE'),
      analysisLimitReason: (summary.analysisLimitReason as AnalysisAssessabilityContext['analysisLimitReason']) ?? null,
      shortTermMisuseAssessable: summary.shortTermMisuseAssessable === true,
      nativeBehaviorEventsAvailable: summary.nativeBehaviorEventsAvailable === true,
      hfInsufficientForAbuse: summary.hfInsufficientForAbuse === true,
      nativeEventCount: typeof summary.nativeEventCount === 'number' ? summary.nativeEventCount : undefined,
      hfPointsTotal: typeof summary.hfPointsTotal === 'number' ? summary.hfPointsTotal : undefined,
      hfPointsCleaned: typeof summary.hfPointsCleaned === 'number' ? summary.hfPointsCleaned : undefined,
    };
  }
}
