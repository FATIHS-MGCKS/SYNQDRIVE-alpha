import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureAcquisitionService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-acquisition.service';
import {
  ReferenceCapturePersistenceError,
} from '../../modules/vehicle-intelligence/reference-capture/reference-capture-observation-writer.service';
import { ReferenceCaptureRunnerService } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-runner.service';
import type { ReferenceCaptureJobData } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-runner.types';
import { ReferenceCaptureSessionRepository } from '../../modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import type { ReferenceCapturePreflightResult } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.types';

@Processor(QUEUE_NAMES.REFERENCE_CAPTURE, { concurrency: 2 })
@Injectable()
export class ReferenceCaptureProcessor extends WorkerHost {
  private readonly logger = new Logger(ReferenceCaptureProcessor.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly sessionRepository: ReferenceCaptureSessionRepository,
    private readonly acquisitionService: ReferenceCaptureAcquisitionService,
    private readonly runnerService: ReferenceCaptureRunnerService,
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
    const session = await this.sessionRepository.findById(organizationId, sessionId);

    if (!session || session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      this.logger.debug(`Skip cycle — session ${sessionId} not RECORDING (${session?.status ?? 'missing'})`);
      return;
    }

    const shouldContinue = await this.runnerService.shouldContinueRecording(
      organizationId,
      sessionId,
      session.startedAt,
    );
    if (!shouldContinue) {
      this.logger.warn(`Reference capture safety timeout session=${sessionId}`);
      await this.sessionRepository.updateStatus(organizationId, sessionId, ReferenceCaptureSessionStatus.FAILED, {
        failureReason: 'max_recording_duration_exceeded',
        stoppedAt: new Date(),
        completedAt: new Date(),
      });
      await this.runnerService.stopRunner(organizationId, sessionId);
      return;
    }

    const preflight = session.preflightJson as ReferenceCapturePreflightResult | null;
    if (!preflight) {
      await this.sessionRepository.updateStatus(organizationId, sessionId, ReferenceCaptureSessionStatus.FAILED, {
        failureReason: 'preflight_missing_at_runner',
      });
      await this.runnerService.stopRunner(organizationId, sessionId);
      return;
    }

    try {
      await this.acquisitionService.executeAcquisitionCycle({
        organizationId,
        vehicleId,
        sessionId,
        preflight,
        manifestVersion,
        powertrainProfile,
        cycleIntervalMs: this.config.getCycleIntervalMs(),
        slowCycleEvery: this.config.getSlowCycleEvery(),
      });

      await this.runnerService.scheduleNextCycle(job.data);
    } catch (error) {
      if (error instanceof ReferenceCapturePersistenceError) {
        this.logger.error(`Persistence failure session=${sessionId}: ${error.message}`);
        await this.sessionRepository.updateStatus(organizationId, sessionId, ReferenceCaptureSessionStatus.FAILED, {
          failureReason: error.message,
          stoppedAt: new Date(),
          completedAt: new Date(),
        });
        await this.runnerService.stopRunner(organizationId, sessionId);
        throw error;
      }
      this.logger.error(`Acquisition cycle failed session=${sessionId}: ${(error as Error).message}`);
      throw error;
    }
  }
}
