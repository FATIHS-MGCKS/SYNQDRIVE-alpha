import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { REFERENCE_CAPTURE_JOB_NAME } from './reference-capture.constants';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { ReferenceCaptureSessionRepository } from './reference-capture-session.repository';
import type { ReferenceCaptureJobData } from './reference-capture-runner.types';

@Injectable()
export class ReferenceCaptureRunnerService {
  private readonly logger = new Logger(ReferenceCaptureRunnerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.REFERENCE_CAPTURE)
    private readonly queue: Queue<ReferenceCaptureJobData>,
    private readonly config: ReferenceCaptureConfig,
    private readonly sessionRepository: ReferenceCaptureSessionRepository,
  ) {}

  jobIdForSession(sessionId: string): string {
    return `reference-capture:${sessionId}`;
  }

  async startRunner(input: ReferenceCaptureJobData): Promise<void> {
    const jobId = this.jobIdForSession(input.sessionId);
    await this.queue.add(REFERENCE_CAPTURE_JOB_NAME, input, {
      jobId,
      delay: 0,
      removeOnComplete: true,
      removeOnFail: 20,
    });
    await this.sessionRepository.updateRunnerJobId(
      input.organizationId,
      input.sessionId,
      jobId,
    );
    this.logger.log(`Started reference capture runner session=${input.sessionId} jobId=${jobId}`);
  }

  async scheduleNextCycle(input: ReferenceCaptureJobData): Promise<void> {
    const jobId = this.jobIdForSession(input.sessionId);
    const delayMs = this.config.getCycleIntervalMs();
    try {
      await this.queue.add(REFERENCE_CAPTURE_JOB_NAME, input, {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: 20,
      });
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message.toLowerCase().includes('already exists')) {
        this.logger.debug(`Runner cycle already queued session=${input.sessionId}`);
        return;
      }
      throw error;
    }
  }

  async stopRunner(organizationId: string, sessionId: string): Promise<void> {
    const jobId = this.jobIdForSession(sessionId);
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
    await this.sessionRepository.updateRunnerJobId(organizationId, sessionId, null);
  }

  isRunnerOperational(): boolean {
    return this.config.isEnabled();
  }

  async shouldContinueRecording(
    organizationId: string,
    sessionId: string,
    startedAt: Date | null,
  ): Promise<boolean> {
    const session = await this.sessionRepository.findById(organizationId, sessionId);
    if (!session || session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      return false;
    }
    if (!startedAt) return true;
    const elapsed = Date.now() - startedAt.getTime();
    return elapsed < this.config.getMaxRecordingDurationMs();
  }
}
