import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  buildSettlementShadowJobId,
  REFERENCE_CAPTURE_SETTLEMENT_SHADOW_JOB_NAME,
} from './reference-capture-settlement-shadow.constants';
import type { SettlementShadowJobData } from './reference-capture-settlement-shadow.types';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';

@Injectable()
export class ReferenceCaptureSettlementShadowRunnerService {
  private readonly logger = new Logger(ReferenceCaptureSettlementShadowRunnerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.REFERENCE_CAPTURE_SETTLEMENT_SHADOW)
    private readonly queue: Queue<SettlementShadowJobData>,
    private readonly repository: ReferenceCaptureSettlementShadowRepository,
  ) {}

  async enqueueSchedule(schedule: {
    id: string;
    experimentId: string;
    sessionId: string;
    organizationId: string;
    scheduledAt: Date;
  }): Promise<string | null> {
    const delayMs = Math.max(0, schedule.scheduledAt.getTime() - Date.now());
    const jobId = buildSettlementShadowJobId(schedule.id);
    const data: SettlementShadowJobData = {
      scheduleId: schedule.id,
      experimentId: schedule.experimentId,
      sessionId: schedule.sessionId,
      organizationId: schedule.organizationId,
    };

    try {
      await this.queue.add(REFERENCE_CAPTURE_SETTLEMENT_SHADOW_JOB_NAME, data, {
        jobId,
        delay: delayMs,
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      await this.repository.updateBullJobId(schedule.id, jobId);
      return jobId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Job') && message.includes('exists')) {
        this.logger.debug(`Shadow job already queued schedule=${schedule.id}`);
        return jobId;
      }
      await this.repository.resetExecutingToPending(schedule.id);
      throw error;
    }
  }

  async removeJobIfQueued(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting' || state === 'active') {
      await job.remove();
      return true;
    }
    return false;
  }

  async cancelQueuedJobsForSession(
    bullJobIds: string[],
  ): Promise<{ removed: number; attempted: number }> {
    let removed = 0;
    for (const jobId of bullJobIds) {
      if (!jobId) continue;
      if (await this.removeJobIfQueued(jobId)) {
        removed += 1;
      }
    }
    return { removed, attempted: bullJobIds.length };
  }

  async recoverDueSchedules(now = new Date()): Promise<number> {
    const due = await this.repository.findRecoverableSchedules(now);
    let recovered = 0;
    for (const row of due) {
      if (row.status === 'COMPLETED' || row.status === 'SKIPPED' || row.status === 'FAILED') {
        continue;
      }
      if (row.bullJobId) {
        const existing = await this.queue.getJob(row.bullJobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'delayed' || state === 'waiting' || state === 'active') {
            continue;
          }
        }
      }
      await this.repository.resetExecutingToPending(row.id);
      await this.enqueueSchedule({
        id: row.id,
        experimentId: row.experimentId,
        sessionId: row.sessionId,
        organizationId: row.organizationId,
        scheduledAt: row.scheduledAt,
      });
      recovered += 1;
    }
    return recovered;
  }
}
