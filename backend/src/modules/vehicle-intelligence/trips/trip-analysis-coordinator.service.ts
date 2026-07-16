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
  areAnalysisStagesComplete,
  emptyAnalysisStages,
  hasAnalysisStageFailure,
  isAnalysisPartiallyReady,
  isBehaviorStageTerminal,
  mergeAssessabilityIntoSummary,
  parseAnalysisStagesJson,
  parseBehaviorSummaryJson,
  shouldFullySkipAnalysis,
} from './trip-analysis-status';
import { TireTripUsageService } from '../tires/tire-trip-usage.service';

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
    @Optional() private readonly tireTripUsageService?: TireTripUsageService,
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
    stages.route = 'skipped';
    stages.misuse = 'skipped';
    stages.drivingImpact = 'skipped';

    const now = new Date();
    const latencyMs = trip.analysisQueuedAt
      ? now.getTime() - trip.analysisQueuedAt.getTime()
      : null;

    const terminalStatus: TripAnalysisStatus = shouldFullySkipAnalysis(assessability)
      ? 'SKIPPED'
      : 'COMPLETED';

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
    await this.attributeTireUsageOnCanonicalFinalization(tripId, terminalStatus);
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
    const data: Record<string, unknown> = {
      analysisStagesJson: stages as Prisma.InputJsonValue,
    };

    if (stage === 'drivingImpact' && (state === 'done' || state === 'skipped')) {
      data.drivingImpactStatus = state === 'done' ? 'READY' : 'SKIPPED';
    }

    if (stages.behavior === 'failed') {
      await this.onAnalysisFailed(tripId, `${stage}_failed`, stage);
      return;
    }

    if (hasAnalysisStageFailure(stages) && state === 'failed') {
      await this.onAnalysisFailed(tripId, `${stage}_failed`, stage);
      return;
    }

    if (areAnalysisStagesComplete(stages)) {
      const latencyMs = trip.analysisQueuedAt
        ? now.getTime() - trip.analysisQueuedAt.getTime()
        : null;
      const assess =
        assessability ??
        this.assessabilityFromTrip(trip.behaviorSummaryJson, trip.behaviorEnrichmentStatus);

      const terminalStatus: TripAnalysisStatus =
        stages.behavior === 'skipped' && shouldFullySkipAnalysis(assess)
          ? 'SKIPPED'
          : 'COMPLETED';

      Object.assign(data, {
        tripAnalysisStatus: terminalStatus,
        analysisCompletedAt: now,
        analysisLatencyMs: latencyMs,
        analysisFailedAt: null,
        analysisFailedReason: null,
        behaviorSummaryStatus: this.resolveBehaviorSummaryStatus(stages, trip.behaviorEnrichmentStatus),
        drivingImpactStatus:
          stages.drivingImpact === 'done'
            ? 'READY'
            : stages.drivingImpact === 'skipped'
              ? 'SKIPPED'
              : undefined,
      });
      if (latencyMs != null) {
        this.tripMetrics?.tripFinalizeLatency.observe({ profile: 'analysis' }, latencyMs / 1000);
      }
      this.logger.log(
        `Trip analysis ${terminalStatus}: trip=${tripId} latencyMs=${latencyMs ?? 'n/a'}`,
      );
      await this.logAnalysisDiagnostics(tripId, assess);

      await this.prisma.vehicleTrip.update({
        where: { id: tripId },
        data: data as any,
      });

      await this.attributeTireUsageOnCanonicalFinalization(tripId, terminalStatus);
      return;
    } else if (isAnalysisPartiallyReady(stages)) {
      Object.assign(data, {
        tripAnalysisStatus: 'PARTIAL',
        analysisPartialAt: trip.analysisPartialAt ?? now,
        behaviorSummaryStatus: 'READY',
      });
      this.logger.debug(`Trip analysis PARTIAL: trip=${tripId} stages=${JSON.stringify(stages)}`);
      await this.logAnalysisDiagnostics(tripId, assessability);
    } else if (isBehaviorStageTerminal(stages) && !areAnalysisStagesComplete(stages)) {
      Object.assign(data, {
        tripAnalysisStatus: 'IN_PROGRESS',
        behaviorSummaryStatus: stages.behavior === 'done' ? 'READY' : 'SKIPPED',
      });
    } else {
      Object.assign(data, { tripAnalysisStatus: trip.tripAnalysisStatus ?? 'IN_PROGRESS' });
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

  /**
   * Canonical tire usage hook — runs once analysis pipeline is terminal (COMPLETED|SKIPPED).
   * Idempotent via TireTripUsageService + ledger fingerprint.
   */
  private async attributeTireUsageOnCanonicalFinalization(
    tripId: string,
    terminalStatus: TripAnalysisStatus,
  ): Promise<void> {
    if (!this.tireTripUsageService) return;
    if (terminalStatus !== 'COMPLETED' && terminalStatus !== 'SKIPPED') return;
    try {
      await this.tireTripUsageService.processCanonicalTripFinalization(tripId, {
        trigger: 'trip_analysis_terminal',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tire trip usage attribution failed for trip ${tripId}: ${message}`);
    }
  }
}
