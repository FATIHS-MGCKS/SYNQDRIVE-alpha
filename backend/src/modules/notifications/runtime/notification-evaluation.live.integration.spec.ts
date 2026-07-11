import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { NOTIFICATION_EVALUATION_JOB_NAME, buildNotificationEvaluationJobId } from '@modules/notifications/runtime/notification-evaluation-queue.util';

const LIVE = process.env.NOTIFICATION_EVALUATION_LIVE_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('Notification evaluation — BullMQ live integration', () => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };

  it('roundtrips a delayed evaluation job with deterministic jobId', async () => {
    const orgId = `org-live-${randomUUID().slice(0, 8)}`;
    const jobId = buildNotificationEvaluationJobId(orgId, 'debounced');
    const queue = new Queue(QUEUE_NAMES.NOTIFICATION_EVALUATION, { connection });

    const processed: string[] = [];
    const worker = new Worker(
      QUEUE_NAMES.NOTIFICATION_EVALUATION,
      async (job) => {
        processed.push(job.id!);
      },
      { connection, concurrency: 1 },
    );

    try {
      const existing = await queue.getJob(jobId);
      if (existing) await existing.remove();

      await queue.add(
        NOTIFICATION_EVALUATION_JOB_NAME,
        {
          organizationId: orgId,
          triggerType: 'debounced_event',
          triggerClass: 'debounced',
          scheduledAt: new Date().toISOString(),
          runId: randomUUID(),
        },
        { jobId, delay: 50, removeOnComplete: true },
      );

      await new Promise((r) => setTimeout(r, 500));
      expect(processed).toContain(jobId);
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 15_000);
});
