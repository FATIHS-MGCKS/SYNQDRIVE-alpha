import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { REFERENCE_CAPTURE_JOB_NAME } from './reference-capture.constants';
import { ReferenceCaptureConfig } from './reference-capture.config';
import {
  buildReferenceCaptureCycleJobId,
  buildReferenceCaptureSessionRunnerKey,
  createReferenceCaptureCycleUuid,
} from './reference-capture-queue.util';
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

  sessionRunnerKey(sessionId: string): string {
    return buildReferenceCaptureSessionRunnerKey(sessionId);
  }

  buildCycleJobData(
    input: Omit<ReferenceCaptureJobData, 'cycleNumber' | 'cycleUuid' | 'transientRetryCount'>,
    cycleNumber: number,
    cycleUuid: string = createReferenceCaptureCycleUuid(),
    transientRetryCount = 0,
  ): ReferenceCaptureJobData {
    return {
      ...input,
      cycleNumber,
      cycleUuid,
      transientRetryCount,
    };
  }

  cycleJobId(sessionId: string, cycleNumber: number, cycleUuid: string): string {
    return buildReferenceCaptureCycleJobId(sessionId, cycleNumber, cycleUuid);
  }

  async enqueueCycleJob(
    data: ReferenceCaptureJobData,
    options?: { delayMs?: number },
  ): Promise<string> {
    const jobId = this.cycleJobId(data.sessionId, data.cycleNumber, data.cycleUuid);
    await this.queue.add(REFERENCE_CAPTURE_JOB_NAME, data, {
      jobId,
      delay: options?.delayMs ?? 0,
      removeOnComplete: true,
      removeOnFail: 50,
    });
    await this.sessionRepository.updatePendingCycleJobId(
      data.organizationId,
      data.sessionId,
      jobId,
    );
    return jobId;
  }

  async startRunner(input: Omit<ReferenceCaptureJobData, 'cycleNumber' | 'cycleUuid'>): Promise<string> {
    const runnerKey = this.sessionRunnerKey(input.sessionId);
    const firstCycle = this.buildCycleJobData(input, 1);
    const jobId = await this.enqueueCycleJob(firstCycle, { delayMs: 0 });
    await this.sessionRepository.updateRunnerJobId(input.organizationId, input.sessionId, runnerKey);
    this.logger.log(
      `Started reference capture runner session=${input.sessionId} runnerKey=${runnerKey} firstCycleJobId=${jobId}`,
    );
    return jobId;
  }

  async scheduleNextCycle(
    current: ReferenceCaptureJobData,
    options?: { delayMs?: number; transientRetryCount?: number },
  ): Promise<string | null> {
    const session = await this.sessionRepository.findById(
      current.organizationId,
      current.sessionId,
    );
    if (!session || session.status !== ReferenceCaptureSessionStatus.RECORDING) {
      return null;
    }

    const next = this.buildCycleJobData(
      current,
      current.cycleNumber + 1,
      createReferenceCaptureCycleUuid(),
      options?.transientRetryCount ?? 0,
    );
    const delayMs = options?.delayMs ?? this.config.getCycleIntervalMs();
    return this.enqueueCycleJob(next, { delayMs });
  }

  async cancelPendingCycleJob(
    organizationId: string,
    sessionId: string,
  ): Promise<{ cancelled: boolean; jobId: string | null }> {
    const session = await this.sessionRepository.findById(organizationId, sessionId);
    const pendingJobId = session?.pendingCycleJobId ?? null;
    if (!pendingJobId) {
      return { cancelled: false, jobId: null };
    }

    const job = await this.queue.getJob(pendingJobId);
    if (job) {
      const state = await job.getState();
      if (state === 'delayed' || state === 'waiting') {
        await job.remove();
        this.logger.debug(`Cancelled pending cycle job ${pendingJobId} session=${sessionId}`);
      }
    }

    await this.sessionRepository.updatePendingCycleJobId(organizationId, sessionId, null);
    return { cancelled: true, jobId: pendingJobId };
  }

  async stopRunner(organizationId: string, sessionId: string): Promise<void> {
    await this.cancelPendingCycleJob(organizationId, sessionId);
    await this.sessionRepository.updateRunnerJobId(organizationId, sessionId, null);
  }

  async isQueueReachable(): Promise<boolean> {
    if (!this.config.isEnabled()) return false;
    try {
      await this.queue.getJobCounts('waiting', 'delayed', 'active');
      return true;
    } catch {
      return false;
    }
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
