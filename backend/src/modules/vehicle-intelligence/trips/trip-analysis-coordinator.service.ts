import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import {
  type AnalysisAssessabilityContext,
  type AnalysisStageName,
  type AnalysisStageState,
  type AnalysisStagesDocument,
  type TripAnalysisStatus,
  emptyAnalysisStagesDocument,
  mergeAssessabilityIntoSummary,
  parseAnalysisStagesDocument,
  parseBehaviorSummaryJson,
  resolveTripAnalysisStatusFromStages,
  updateStageRecord,
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

export interface MarkStageOptions {
  errorCode?: string | null;
  completedAt?: Date;
  /** Defaults to true — increments attempt counter for the stage transition. */
  incrementAttempt?: boolean;
}

interface CommitStagesContext {
  assessability?: AnalysisAssessabilityContext;
  analysisQueuedAt?: Date | null;
  analysisPartialAt?: Date | null;
  behaviorEnrichmentStatus?: string | null;
  behaviorSummaryStatus?: string | null;
  behaviorSummaryJson?: unknown;
  drivingImpactStatus?: string | null;
  globalFailure?: boolean;
  globalFailureReason?: string;
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
        analysisStagesJson: emptyAnalysisStagesDocument() as Prisma.InputJsonValue,
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

  async onBehaviorCompleted(
    tripId: string,
    assessability: AnalysisAssessabilityContext,
  ): Promise<void> {
    await this.persistAssessability(tripId, assessability);
    await this.markStage(tripId, 'behavior', 'done', assessability);
  }

  /**
   * Behavior unavailable — does not cascade-skip independent stages (route, native events).
   */
  async onBehaviorSkipped(
    tripId: string,
    reason: string,
    assessability: AnalysisAssessabilityContext,
  ): Promise<void> {
    await this.persistAssessability(tripId, assessability);

    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        analysisQueuedAt: true,
        analysisPartialAt: true,
        analysisStagesJson: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryStatus: true,
        behaviorSummaryJson: true,
      },
    });
    if (!trip) return;

    const stagesDoc = updateStageRecord(parseAnalysisStagesDocument(trip.analysisStagesJson), 'behavior', {
      state: 'skipped',
      errorCode: reason.slice(0, 120),
      completedAt: new Date(),
    });

    await this.commitStages(tripId, stagesDoc, {
      assessability,
      analysisQueuedAt: trip.analysisQueuedAt,
      analysisPartialAt: trip.analysisPartialAt,
      behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
      behaviorSummaryStatus: 'SKIPPED',
      behaviorSummaryJson: trip.behaviorSummaryJson,
    });

    await this.logAnalysisDiagnostics(tripId, assessability);
    this.logger.log(
      `Trip analysis behavior SKIPPED: trip=${tripId} reason=${reason} ` +
        `assessability=${assessability.analysisAssessability}`,
    );
  }

  /**
   * Global analysis failure — only for behavior critical failure or orchestration disruption.
   * Preserves terminal records of other stages.
   */
  async onAnalysisFailed(tripId: string, reason: string, stage?: AnalysisStageName): Promise<void> {
    if (stage && stage !== 'behavior') {
      await this.markStageFailed(tripId, stage, reason);
      return;
    }

    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        analysisQueuedAt: true,
        analysisPartialAt: true,
        analysisStagesJson: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryStatus: true,
        behaviorSummaryJson: true,
        vehicleId: true,
      },
    });

    const stagesDoc = stage
      ? updateStageRecord(parseAnalysisStagesDocument(trip?.analysisStagesJson), stage, {
          state: 'failed',
          errorCode: reason.slice(0, 120),
          completedAt: new Date(),
        })
      : parseAnalysisStagesDocument(trip?.analysisStagesJson);

    await this.commitStages(tripId, stagesDoc, {
      analysisQueuedAt: trip?.analysisQueuedAt,
      analysisPartialAt: trip?.analysisPartialAt,
      behaviorEnrichmentStatus: trip?.behaviorEnrichmentStatus,
      behaviorSummaryStatus: 'FAILED',
      behaviorSummaryJson: trip?.behaviorSummaryJson,
      globalFailure: true,
      globalFailureReason: reason,
    });

    this.tripMetrics?.enrichmentFailed.inc({ stage: stage ?? 'analysis_pipeline' });
    this.logger.warn(`Trip analysis FAILED: trip=${tripId} stage=${stage ?? 'orchestration'} reason=${reason}`);
    if (trip?.vehicleId) {
      await this.logAnalysisDiagnostics(tripId);
    }
  }

  /** Stage-local failure — preserves completed stages; overall status via resolver (typically PARTIAL). */
  async markStageFailed(
    tripId: string,
    stage: AnalysisStageName,
    errorCode: string,
  ): Promise<void> {
    await this.markStage(tripId, stage, 'failed', undefined, {
      errorCode: errorCode.slice(0, 120),
      completedAt: new Date(),
    });
    this.tripMetrics?.enrichmentFailed.inc({ stage });
    this.logger.warn(`Trip analysis stage FAILED: trip=${tripId} stage=${stage} error=${errorCode}`);
  }

  /** Misuse without assessable basis — capability gap, not a technical failure. */
  async markStageNotAssessable(
    tripId: string,
    stage: AnalysisStageName,
    errorCode = 'NOT_ASSESSABLE',
  ): Promise<void> {
    await this.markStage(tripId, stage, 'not_assessable', undefined, {
      errorCode,
      completedAt: new Date(),
    });
  }

  async applyDrivingImpactOutcome(
    tripId: string,
    outcome: DrivingImpactOutcome,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const trip = await db.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        analysisQueuedAt: true,
        analysisPartialAt: true,
        analysisStagesJson: true,
        behaviorSummaryStatus: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryJson: true,
      },
    });
    if (!trip) return;

    const stageState: AnalysisStageState =
      outcome.drivingImpactStatus === 'FAILED'
        ? 'failed'
        : outcome.drivingImpactStatus === 'SKIPPED'
          ? 'skipped'
          : 'done';

    const stagesDoc = updateStageRecord(parseAnalysisStagesDocument(trip.analysisStagesJson), 'drivingImpact', {
      state: stageState,
      errorCode:
        outcome.drivingImpactStatus === 'FAILED'
          ? outcome.failureReason ?? 'DRIVING_IMPACT_FAILED'
          : outcome.drivingImpactStatus === 'PARTIAL'
            ? 'PARTIAL_COMPUTATION'
            : null,
      completedAt: outcome.calculatedAt ?? new Date(),
    });

    await this.commitStages(
      tripId,
      stagesDoc,
      {
        analysisQueuedAt: trip.analysisQueuedAt,
        analysisPartialAt: trip.analysisPartialAt,
        behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
        behaviorSummaryStatus: trip.behaviorSummaryStatus,
        behaviorSummaryJson: trip.behaviorSummaryJson,
        drivingImpactStatus: outcome.drivingImpactStatus,
        globalFailure: outcome.drivingImpactStatus === 'FAILED',
        globalFailureReason: outcome.failureReason,
      },
      db,
    );

    if (!tx) {
      const assess = this.assessabilityFromTrip(trip.behaviorSummaryJson, trip.behaviorEnrichmentStatus);
      await this.logAnalysisDiagnostics(tripId, assess);
    }
  }

  async markStage(
    tripId: string,
    stage: AnalysisStageName,
    state: AnalysisStageState,
    assessability?: AnalysisAssessabilityContext,
    options?: MarkStageOptions,
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        analysisQueuedAt: true,
        analysisPartialAt: true,
        analysisStagesJson: true,
        behaviorSummaryStatus: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryJson: true,
        drivingImpactStatus: true,
      },
    });
    if (!trip) return;

    const stagesDoc = updateStageRecord(parseAnalysisStagesDocument(trip.analysisStagesJson), stage, {
      state,
      errorCode: options?.errorCode,
      completedAt: options?.completedAt ?? (state === 'pending' ? null : new Date()),
      incrementAttempt: options?.incrementAttempt,
    });

    const drivingImpactStatus =
      stage === 'drivingImpact'
        ? state === 'done'
          ? 'READY'
          : state === 'not_assessable' || state === 'skipped'
            ? 'SKIPPED'
            : state === 'failed'
              ? 'FAILED'
              : trip.drivingImpactStatus
        : undefined;

    await this.commitStages(tripId, stagesDoc, {
      assessability,
      analysisQueuedAt: trip.analysisQueuedAt,
      analysisPartialAt: trip.analysisPartialAt,
      behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
      behaviorSummaryStatus: trip.behaviorSummaryStatus,
      behaviorSummaryJson: trip.behaviorSummaryJson,
      drivingImpactStatus: drivingImpactStatus ?? undefined,
    });

    const assess =
      assessability ??
      this.assessabilityFromTrip(trip.behaviorSummaryJson, trip.behaviorEnrichmentStatus);
    await this.logAnalysisDiagnostics(tripId, assess);
  }

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
        const doc = parseAnalysisStagesDocument(t.analysisStagesJson);
        return doc.behavior?.state === 'done' && doc.misuse?.state === 'pending';
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

  private async commitStages(
    tripId: string,
    stagesDoc: AnalysisStagesDocument,
    context: CommitStagesContext,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const assess =
      context.assessability ??
      this.assessabilityFromTrip(context.behaviorSummaryJson, context.behaviorEnrichmentStatus);

    const resolved = resolveTripAnalysisStatusFromStages(stagesDoc, {
      assessability: assess,
      analysisQueued: context.analysisQueuedAt != null,
    });

    const now = new Date();
    const legacyStatus = context.globalFailure
      ? ('FAILED' as TripAnalysisStatus)
      : (resolved.legacyTripAnalysisStatus as TripAnalysisStatus);

    const data: Record<string, unknown> = {
      analysisStagesJson: stagesDoc as Prisma.InputJsonValue,
      tripAnalysisStatus: legacyStatus,
    };

    if (context.drivingImpactStatus) {
      data.drivingImpactStatus = context.drivingImpactStatus;
    }

    if (context.globalFailure) {
      const latencyMs = context.analysisQueuedAt
        ? now.getTime() - context.analysisQueuedAt.getTime()
        : null;
      Object.assign(data, {
        analysisFailedAt: now,
        analysisFailedReason: context.globalFailureReason?.slice(0, 500) ?? null,
        analysisLatencyMs: latencyMs,
        behaviorSummaryStatus: context.behaviorSummaryStatus ?? 'FAILED',
      });
      await db.vehicleTrip.update({ where: { id: tripId }, data: data as any });
      return;
    }

    if (
      resolved.status === 'COMPLETED' ||
      resolved.status === 'SKIPPED' ||
      resolved.status === 'NOT_ASSESSABLE'
    ) {
      const latencyMs = context.analysisQueuedAt
        ? now.getTime() - context.analysisQueuedAt.getTime()
        : null;
      Object.assign(data, {
        analysisCompletedAt: now,
        analysisLatencyMs: latencyMs,
        analysisFailedAt: null,
        analysisFailedReason: null,
        behaviorSummaryStatus: this.resolveBehaviorSummaryStatus(stagesDoc, context.behaviorEnrichmentStatus),
      });
      if (latencyMs != null) {
        this.tripMetrics?.tripFinalizeLatency.observe({ profile: 'analysis' }, latencyMs / 1000);
      }
      this.logger.log(`Trip analysis ${legacyStatus}: trip=${tripId} latencyMs=${latencyMs ?? 'n/a'}`);
    } else if (resolved.status === 'PARTIAL') {
      Object.assign(data, {
        analysisPartialAt: context.analysisPartialAt ?? now,
        analysisFailedAt: null,
        analysisFailedReason: null,
        behaviorSummaryStatus: this.resolveBehaviorSummaryStatus(stagesDoc, context.behaviorEnrichmentStatus),
      });
      this.logger.debug(`Trip analysis PARTIAL: trip=${tripId} stages=${JSON.stringify(stagesDoc)}`);
    } else if (resolved.status === 'IN_PROGRESS') {
      Object.assign(data, {
        behaviorSummaryStatus: this.resolveBehaviorSummaryStatus(stagesDoc, context.behaviorEnrichmentStatus),
      });
    }

    await db.vehicleTrip.update({ where: { id: tripId }, data: data as any });
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
    stagesDoc: AnalysisStagesDocument,
    behaviorEnrichmentStatus: string | null | undefined,
  ): string {
    const behavior = stagesDoc.behavior?.state;
    if (behavior === 'done' || behaviorEnrichmentStatus === 'COMPLETED') return 'READY';
    if (behavior === 'skipped' || behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA') return 'SKIPPED';
    if (behavior === 'failed') return 'FAILED';
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
