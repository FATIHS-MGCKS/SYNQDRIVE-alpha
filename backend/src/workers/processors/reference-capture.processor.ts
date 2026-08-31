import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';
import {
  classifyAcquisitionError,
  computeTransientBackoffMs,
} from '../../modules/vehicle-intelligence/reference-capture/reference-capture-acquisition-failure.util';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureAcquisitionService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-acquisition.service';
import { ReferenceCaptureObservationWriterService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-observation-writer.service';
import { ReferenceCapturePersistenceError } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-observation-writer.service';
import { ReferenceCaptureRunnerService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-runner.service';
import type { ReferenceCaptureJobData } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-runner.types';
import {
  parseAcquisitionState,
  ReferenceCaptureSessionRepository,
} from '../../modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import type { ReferenceCapturePreflightResult } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.types';

@Processor(QUEUE_NAMES.REFERENCE_CAPTURE, { concurrency: 1 })
@Injectable()
export class ReferenceCaptureProcessor extends WorkerHost {
  private readonly logger = new Logger(ReferenceCaptureProcessor.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly sessionRepository: ReferenceCaptureSessionRepository,
    private readonly acquisitionService: ReferenceCaptureAcquisitionService,
    private readonly runnerService: ReferenceCaptureRunnerService,
    private readonly observationWriter: ReferenceCaptureObservationWriterService,
  ) {
    super();
  }

  async process(job: Job<ReferenceCaptureJobData>): Promise<void> {
    if (!this.config.isEnabled()) {
      this.logger.debug(`Reference capture disabled — skipping job ${job.id}`);
      return;
    }

    return runWithDimoRequestContext({ category: 'REFERENCE_CAPTURE', priority: 'BACKGROUND' }, () =>
      this.processCycle(job),
    );
  }

  private async processCycle(job: Job<ReferenceCaptureJobData>): Promise<void> {
    const { organizationId, vehicleId, sessionId, manifestVersion, powertrainProfile } = job.data;
    const cycleJobId = job.id ?? this.runnerService.cycleJobId(
      sessionId,
      job.data.cycleNumber,
      job.data.cycleUuid,
    );

    const session = await this.sessionRepository.findById(organizationId, sessionId);
    if (!session || session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      this.logger.debug(`Skip cycle — session ${sessionId} not RECORDING (${session?.status ?? 'missing'})`);
      await this.runnerService.cancelPendingCycleJob(organizationId, sessionId);
      return;
    }

    const shouldContinue = await this.runnerService.shouldContinueRecording(
      organizationId,
      sessionId,
      session.startedAt,
    );
    if (!shouldContinue) {
      await this.failSession(organizationId, sessionId, 'max_recording_duration_exceeded');
      return;
    }

    const preflight = session.preflightJson as ReferenceCapturePreflightResult | null;
    if (!preflight) {
      await this.failSession(organizationId, sessionId, 'preflight_missing_at_runner');
      return;
    }

    try {
      const result = await this.acquisitionService.executeAcquisitionCycle({
        organizationId,
        vehicleId,
        sessionId,
        cycleJobId,
        preflight,
        manifestVersion,
        powertrainProfile,
        cycleIntervalMs: this.config.getCycleIntervalMs(),
        slowCycleEvery: this.config.getSlowCycleEvery(),
      });

      if (result.skippedConcurrentCycle) {
        this.logger.debug(`Skipped concurrent cycle session=${sessionId} job=${cycleJobId}`);
        return;
      }

      const refreshed = await this.sessionRepository.findById(organizationId, sessionId);
      if (!refreshed || refreshed.status !== ReferenceCaptureSessionStatus.RECORDING) {
        await this.runnerService.cancelPendingCycleJob(organizationId, sessionId);
        return;
      }

      const state = parseAcquisitionState(refreshed.acquisitionStateJson);
      await this.runnerService.scheduleNextCycle({
        ...job.data,
        cycleNumber: result.cycleNumber,
        transientRetryCount: 0,
      });
      this.logger.debug(
        `Cycle complete session=${sessionId} cycle=${result.cycleNumber} next=${state.cycleCount}`,
      );
    } catch (error) {
      const assessment = classifyAcquisitionError(error);

      if (assessment.failureClass === 'PERSISTENCE_FAILURE' || !assessment.retryable) {
        await this.failSession(
          organizationId,
          sessionId,
          `${assessment.failureClass}:${assessment.message}`,
        );
        throw error;
      }

      const state = parseAcquisitionState(session.acquisitionStateJson);
      const retryCount = (job.data.transientRetryCount ?? 0) + 1;
      const maxRetries = this.config.getMaxTransientRetries();

      await this.recordTransientFailureObservation(
        organizationId,
        sessionId,
        vehicleId,
        preflight,
        assessment.failureClass,
        assessment.message,
        retryCount,
      );

      if (retryCount >= maxRetries) {
        await this.failSession(
          organizationId,
          sessionId,
          `transient_retry_exhausted:${assessment.failureClass}`,
        );
        return;
      }

      const refreshed = await this.sessionRepository.findById(organizationId, sessionId);
      if (!refreshed || refreshed.status !== ReferenceCaptureSessionStatus.RECORDING) {
        return;
      }

      const delayMs = computeTransientBackoffMs(retryCount, this.config.getTransientRetryBaseDelayMs());
      await this.runnerService.scheduleNextCycle(
        { ...job.data, cycleNumber: Math.max(job.data.cycleNumber, state.cycleCount) },
        { delayMs, transientRetryCount: retryCount },
      );
    }
  }

  private async failSession(
    organizationId: string,
    sessionId: string,
    failureReason: string,
  ): Promise<void> {
    this.logger.error(`Reference capture session failed session=${sessionId}: ${failureReason}`);
    await this.sessionRepository.updateStatus(
      organizationId,
      sessionId,
      ReferenceCaptureSessionStatus.FAILED,
      {
        failureReason,
        stoppedAt: new Date(),
        completedAt: new Date(),
        pendingCycleJobId: null,
        runnerJobId: null,
      },
    );
    await this.runnerService.stopRunner(organizationId, sessionId);
    this.observationWriter.clearSession(sessionId);
  }

  private async recordTransientFailureObservation(
    organizationId: string,
    sessionId: string,
    vehicleId: string,
    preflight: ReferenceCapturePreflightResult,
    failureClass: string,
    message: string,
    retryCount: number,
  ): Promise<void> {
    const now = new Date();
    await this.observationWriter.enqueueAndMaybeFlush(sessionId, organizationId, vehicleId, {
      envelopeVersion: '1.0.0',
      observationKind: ReferenceCaptureObservationKind.PROBE_RESULT,
      provider: 'SYNQDRIVE',
      connectionProfile: preflight.connectionProfile,
      powertrainProfile: preflight.powertrainProfile,
      providerField: null,
      canonicalKey: null,
      rawIdentity: `SYNQDRIVE::acquisition_failure::${failureClass}`,
      acquisitionSurface: 'VALIDATION_FLIGHT_RECORDER',
      acquisitionTier: 'T7',
      temporalClass: 'SESSION_METADATA',
      rawValue: { failureClass, message, retryCount },
      synqReceivedAt: now,
      requestStartedAt: now,
      requestCompletedAt: now,
      provenance: {
        captureSessionId: sessionId,
        transientFailure: true,
        failureClass,
        retryCount,
      },
    });
    await this.observationWriter.flush(sessionId);
  }
}
