import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { DrivingIntelligenceJobType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingAnalysisRunService } from '../driving-analysis-run/driving-analysis-run.service';
import { DrivingIntelligenceJobDispatcherService } from '../driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { DrivingIntelligenceJobRepository } from '../driving-intelligence-jobs/driving-intelligence-jobs.repository';
import {
  buildInitCorrelationId,
  buildInitJobIdempotencyKey,
  DRIVING_INTELLIGENCE_INIT_CAPABILITY_VERSION,
  DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
  DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
  type InitializeTripAnalysisInput,
  type TripAnalysisInitJobResult,
  type TripAnalysisInitResult,
} from './driving-analysis-init.types';

@Injectable()
export class DrivingAnalysisInitService {
  private readonly logger = new Logger(DrivingAnalysisInitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisRunService: DrivingAnalysisRunService,
    private readonly jobDispatcher: DrivingIntelligenceJobDispatcherService,
    private readonly jobRepository: DrivingIntelligenceJobRepository,
  ) {}

  /**
   * Initialize durable V2 analysis for a persisted COMPLETED trip.
   * Idempotent per trip×modelVersion via DrivingAnalysisRun fingerprint + job idempotency keys.
   */
  async initializeForCompletedTrip(
    input: InitializeTripAnalysisInput,
  ): Promise<TripAnalysisInitResult> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: input.tripId,
        vehicle: { organizationId: input.organizationId },
      },
      select: {
        id: true,
        vehicleId: true,
        tripStatus: true,
        endTime: true,
        behaviorEnrichmentStatus: true,
      },
    });

    if (!trip) {
      throw new BadRequestException('Trip not found for organization');
    }
    if (trip.tripStatus !== 'COMPLETED') {
      throw new BadRequestException(
        'Trip is not COMPLETED — analysis init refused until persisted finalize',
      );
    }
    if (trip.vehicleId !== input.vehicleId) {
      throw new BadRequestException('Trip vehicle mismatch for organization');
    }

    const waypointCount = await this.prisma.vehicleTripWaypoint.count({
      where: { tripId: input.tripId },
    });

    const runResult = await this.analysisRunService.resolveOrBeginRun({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      analysisType: 'TRIP_ENRICHMENT',
      modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      capabilityVersion: DRIVING_INTELLIGENCE_INIT_CAPABILITY_VERSION,
      inputIdentity: {
        organizationId: input.organizationId,
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        analysisType: 'TRIP_ENRICHMENT',
        tripEndTimeIso: trip.endTime?.toISOString() ?? null,
        behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
        routeEnrichmentStatus: null,
        waypointCount,
        capabilityVersion: DRIVING_INTELLIGENCE_INIT_CAPABILITY_VERSION,
        inputTags: [`source:${input.source}`],
      },
      maturity: 'SHADOW',
      recomputeReason: input.source === 'REPAIR_FINALIZE' ? 'REPAIR_FINALIZE' : null,
    });

    const queueErrors: string[] = [];
    const jobs: TripAnalysisInitJobResult[] = [];

    const shouldEnqueuePipelineStart =
      runResult.created ||
      (runResult.run.status !== 'COMPLETED' && runResult.run.status !== 'SUPERSEDED');

    if (shouldEnqueuePipelineStart) {
      const jobResult = await this.enqueuePipelineStartJob({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        analysisRunId: runResult.run.id,
        source: input.source,
        requestedAt: trip.endTime ?? new Date(),
      });
      jobs.push(jobResult);
      if (jobResult.queueError) {
        queueErrors.push(jobResult.queueError);
      }
    }

    if (queueErrors.length > 0) {
      this.logger.warn(
        `Trip analysis init queue issues trip=${input.tripId} source=${input.source}: ${queueErrors.join('; ')}`,
      );
    } else {
      this.logger.log(
        `Trip analysis init trip=${input.tripId} run=${runResult.run.id} ` +
          `created=${runResult.created} jobs=${jobs.length}`,
      );
    }

    return {
      runId: runResult.run.id,
      runCreated: runResult.created,
      runDeduplicated: runResult.deduplicated,
      jobs,
      queueErrors,
    };
  }

  /**
   * Retry BullMQ enqueue for PENDING durable jobs — leaves rows retryable after queue outages.
   */
  async retryPendingJobsForTrip(
    organizationId: string,
    tripId: string,
  ): Promise<TripAnalysisInitJobResult[]> {
    const pending = await this.prisma.drivingIntelligenceJob.findMany({
      where: { organizationId, tripId, status: 'PENDING' },
      orderBy: { requestedAt: 'asc' },
    });

    const results: TripAnalysisInitJobResult[] = [];
    for (const row of pending) {
      results.push(
        await this.dispatchExistingJob({
          organizationId,
          vehicleId: row.vehicleId,
          tripId: row.tripId,
          bookingId: row.bookingId,
          analysisRunId: row.analysisRunId,
          jobType: row.jobType,
          modelVersion: row.modelVersion,
          idempotencyKey: row.idempotencyKey,
          correlationId: row.correlationId,
          requestedAt: row.requestedAt,
        }),
      );
    }
    return results;
  }

  private async enqueuePipelineStartJob(params: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    analysisRunId: string;
    source: InitializeTripAnalysisInput['source'];
    requestedAt: Date;
  }): Promise<TripAnalysisInitJobResult> {
    const idempotencyKey = buildInitJobIdempotencyKey(
      params.tripId,
      DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
    );

    return this.dispatchExistingJob({
      organizationId: params.organizationId,
      vehicleId: params.vehicleId,
      tripId: params.tripId,
      bookingId: null,
      analysisRunId: params.analysisRunId,
      jobType: DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
      modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      idempotencyKey,
      correlationId: buildInitCorrelationId(params.tripId),
      requestedAt: params.requestedAt,
    });
  }

  private async dispatchExistingJob(params: {
    organizationId: string;
    vehicleId: string;
    tripId: string | null;
    bookingId: string | null;
    analysisRunId: string;
    jobType: DrivingIntelligenceJobType;
    modelVersion: string;
    idempotencyKey: string;
    correlationId: string;
    requestedAt: Date;
  }): Promise<TripAnalysisInitJobResult> {
    try {
      const result = await this.jobDispatcher.enqueue({
        organizationId: params.organizationId,
        vehicleId: params.vehicleId,
        tripId: params.tripId,
        bookingId: params.bookingId,
        analysisRunId: params.analysisRunId,
        jobType: params.jobType,
        modelVersion: params.modelVersion,
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
        requestedAt: params.requestedAt,
      });

      let queueError: string | undefined;
      if (!result.enqueued && !result.deduplicated) {
        queueError = `Job ${params.jobType} persisted as PENDING but not enqueued (queue unavailable)`;
      }

      return {
        jobType: params.jobType,
        jobId: result.job.id,
        created: result.created,
        enqueued: result.enqueued,
        deduplicated: result.deduplicated,
        queueError,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const persisted = await this.jobRepository.findByIdempotencyKey(
        params.organizationId,
        params.idempotencyKey,
      );
      return {
        jobType: params.jobType,
        jobId: persisted?.id ?? 'unknown',
        created: Boolean(persisted),
        enqueued: false,
        deduplicated: false,
        queueError: message,
      };
    }
  }
}
