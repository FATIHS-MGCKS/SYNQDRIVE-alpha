import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

export type DeviceConnectionWebhookJobData = {
  inboxId: string;
  replay?: boolean;
};

export const DEVICE_CONNECTION_WEBHOOK_JOB_NAME = 'process';

@Injectable()
export class DeviceConnectionWebhookQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS)
    private readonly queue: Queue<DeviceConnectionWebhookJobData>,
  ) {}

  buildJobId(inboxId: string, replay = false): string {
    return replay
      ? `connectivity-webhook-replay:${inboxId}:${Date.now()}`
      : `connectivity-webhook:${inboxId}`;
  }

  async enqueue(inboxId: string, replay = false): Promise<void> {
    const jobId = this.buildJobId(inboxId, replay);
    if (!replay) {
      const existing = await this.queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'active' || state === 'waiting' || state === 'delayed') return;
        if (state === 'completed' || state === 'failed') {
          await existing.remove();
        }
      }
    }

    await this.queue.add(
      replay ? 'replay' : DEVICE_CONNECTION_WEBHOOK_JOB_NAME,
      { inboxId, replay },
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 2000, age: 24 * 3600 },
        removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
      },
    );
  }

  async scheduleInboxIds(inboxIds: string[]): Promise<void> {
    await Promise.all(inboxIds.map((inboxId) => this.enqueue(inboxId)));
  }
}
