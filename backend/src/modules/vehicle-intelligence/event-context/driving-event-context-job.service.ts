import { Injectable, Logger, Optional } from '@nestjs/common';
import { DrivingEventSource, type DrivingIntelligenceJob } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingAnalysisStageOrchestratorService } from '../driving-analysis-stage/driving-analysis-stage.orchestrator.service';
import { DrivingAnalysisStageRepository } from '../driving-analysis-stage/driving-analysis-stage.repository';
import { DrivingIntelligenceJobDispatcherService } from '../driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { shouldRunIceEventContextEnrichment } from './engine-context.guards';
import {
  buildPerEventContextJobIdempotencyKey,
  isPerEventContextJobIdempotencyKey,
  isTripContextCoordinatorJobIdempotencyKey,
  parsePerEventContextJobIdempotencyKey,
} from './driving-event-context-job.contract';
import {
  EVENT_CONTEXT_FANOUT_CONCURRENCY,
  EVENT_CONTEXT_HISTORICAL_WINDOW_DAYS,
  EVENT_CONTEXT_MODEL_VERSION,
} from './event-context.config';
import {
  isTerminalEventContextStatus,
  normalizeEventContextStatus,
} from './event-context-status';

export type ScheduleContextJobsInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisRunId: string;
  modelVersion: string;
  correlationId: string;
  requestedAt: Date;
};

export type ScheduleContextJobsResult = {
  eligibleEvents: number;
  enqueued: number;
  skipped: number;
};

@Injectable()
export class DrivingEventContextJobService {
  private readonly logger = new Logger(DrivingEventContextJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobDispatcher: DrivingIntelligenceJobDispatcherService,
    @Optional() private readonly stageRepository?: DrivingAnalysisStageRepository,
    @Optional() private readonly stageOrchestrator?: DrivingAnalysisStageOrchestratorService,
  ) {}

  /**
   * Fan-out: one durable job per native event × context model version.
   * Rate-limited parallel enqueue — does not block on enrichment completion.
   */
  async scheduleContextEnrichmentForTrip(
    input: ScheduleContextJobsInput,
  ): Promise<ScheduleContextJobsResult> {
    const cutoff = new Date(Date.now() - EVENT_CONTEXT_HISTORICAL_WINDOW_DAYS * 86_400_000);
    const events = await this.prisma.drivingEvent.findMany({
      where: {
        tripId: input.tripId,
        source: DrivingEventSource.TELEMETRY_EVENTS,
        recordedAt: { gte: cutoff },
      },
      select: {
        id: true,
        recordedAt: true,
        vehicle: { select: { hardwareType: true, fuelType: true } },
        metadataJson: true,
      },
      orderBy: { recordedAt: 'asc' },
    });

    const eligible = events.filter((e) =>
      shouldRunIceEventContextEnrichment({
        hardwareType: e.vehicle?.hardwareType ?? null,
        fuelType: e.vehicle?.fuelType ?? null,
      }),
    );

    let enqueued = 0;
    let skipped = 0;

    await this.mapWithConcurrency(eligible, EVENT_CONTEXT_FANOUT_CONCURRENCY, async (event) => {
      const existing = this.readStoredAssessment(event.metadataJson);
      if (
        existing?.contextModelVersion === EVENT_CONTEXT_MODEL_VERSION &&
        isTerminalEventContextStatus(existing.status)
      ) {
        skipped += 1;
        return;
      }

      const result = await this.jobDispatcher.enqueue({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        analysisRunId: input.analysisRunId,
        jobType: 'DRIVING_EVENT_CONTEXT_ENRICH',
        modelVersion: input.modelVersion,
        idempotencyKey: buildPerEventContextJobIdempotencyKey(event.id),
        correlationId: input.correlationId,
        requestedAt: input.requestedAt,
      });
      if (result.enqueued || result.deduplicated) enqueued += 1;
      else skipped += 1;
    });

    if (eligible.length === 0) {
      await this.tryCompleteEventContextStage(input.organizationId, input.analysisRunId, input.tripId);
    }

    this.logger.log(
      `Context job fan-out trip=${input.tripId}: eligible=${eligible.length} enqueued=${enqueued} skipped=${skipped}`,
    );

    return { eligibleEvents: eligible.length, enqueued, skipped };
  }

  /**
   * Trip-level coordinator job: fan-out only — stage completes when per-event jobs finish.
   */
  async handleCoordinatorJob(job: DrivingIntelligenceJob): Promise<void> {
    if (!job.tripId) {
      this.logger.warn(`Context coordinator job ${job.id} missing tripId — skipping fan-out`);
      return;
    }
    await this.scheduleContextEnrichmentForTrip({
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      tripId: job.tripId,
      analysisRunId: job.analysisRunId,
      modelVersion: job.modelVersion,
      correlationId: job.correlationId,
      requestedAt: job.requestedAt,
    });
  }

  async tryCompleteEventContextStage(
    organizationId: string,
    analysisRunId: string,
    tripId: string,
  ): Promise<boolean> {
    const ready = await this.isTripContextStageReady(tripId);
    if (!ready) return false;

    if (!this.stageRepository || !this.stageOrchestrator) {
      this.logger.warn('Stage services unavailable — cannot mark EVENT_CONTEXT complete');
      return false;
    }

    const run = await this.prisma.drivingAnalysisRun.findFirst({
      where: { id: analysisRunId, organizationId },
      select: { vehicleId: true, modelVersion: true },
    });
    if (!run) return false;

    await this.stageRepository.markCompleted(organizationId, analysisRunId, 'EVENT_CONTEXT');
    await this.stageOrchestrator.syncRunStatusFromStages(organizationId, analysisRunId);
    await this.stageOrchestrator.enqueueReadyStages({
      organizationId,
      vehicleId: run.vehicleId,
      tripId,
      analysisRunId,
      modelVersion: run.modelVersion,
      correlationId: `context-stage:${analysisRunId}`,
      requestedAt: new Date(),
    });

    this.logger.log(`Event context stage completed for trip=${tripId} run=${analysisRunId}`);
    return true;
  }

  async isTripContextStageReady(tripId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - EVENT_CONTEXT_HISTORICAL_WINDOW_DAYS * 86_400_000);
    const events = await this.prisma.drivingEvent.findMany({
      where: {
        tripId,
        source: DrivingEventSource.TELEMETRY_EVENTS,
        recordedAt: { gte: cutoff },
      },
      select: {
        id: true,
        metadataJson: true,
        vehicle: { select: { hardwareType: true, fuelType: true } },
      },
    });

    const eligible = events.filter((e) =>
      shouldRunIceEventContextEnrichment({
        hardwareType: e.vehicle?.hardwareType ?? null,
        fuelType: e.vehicle?.fuelType ?? null,
      }),
    );

    if (eligible.length === 0) return true;

    const pendingJobs = await this.prisma.drivingIntelligenceJob.count({
      where: {
        tripId,
        jobType: 'DRIVING_EVENT_CONTEXT_ENRICH',
        status: { in: ['PENDING', 'ENQUEUED', 'IN_PROGRESS'] },
        idempotencyKey: { startsWith: 'ctx-enrich:' },
      },
    });
    if (pendingJobs > 0) return false;

    return eligible.every((event) => {
      const assessment = this.readStoredAssessment(event.metadataJson);
      if (!assessment) return false;
      if (assessment.contextModelVersion !== EVENT_CONTEXT_MODEL_VERSION) return false;
      const status = normalizeEventContextStatus(assessment.status) ?? assessment.status;
      return isTerminalEventContextStatus(status);
    });
  }

  shouldAdvanceStageOnJobComplete(job: DrivingIntelligenceJob): boolean {
    return isPerEventContextJobIdempotencyKey(job.idempotencyKey);
  }

  isCoordinatorJob(job: DrivingIntelligenceJob): boolean {
    return isTripContextCoordinatorJobIdempotencyKey(job.idempotencyKey);
  }

  parsePerEventJob(job: DrivingIntelligenceJob) {
    return parsePerEventContextJobIdempotencyKey(job.idempotencyKey);
  }

  private readStoredAssessment(metadataJson: unknown): {
    status?: string;
    contextModelVersion?: string;
  } | null {
    const meta = (metadataJson as Record<string, unknown> | null) ?? {};
    const raw = meta.contextAssessment;
    if (!raw || typeof raw !== 'object') return null;
    return raw as { status?: string; contextModelVersion?: string };
  }

  private async mapWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) return;
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        await fn(items[i]);
      }
    });
    await Promise.all(workers);
  }
}
