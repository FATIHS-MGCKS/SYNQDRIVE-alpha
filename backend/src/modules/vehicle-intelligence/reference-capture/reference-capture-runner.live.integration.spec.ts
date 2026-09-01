import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { REFERENCE_CAPTURE_JOB_NAME } from './reference-capture.constants';
import {
  buildReferenceCaptureCycleJobId,
  createReferenceCaptureCycleUuid,
} from './reference-capture-queue.util';

const LIVE = process.env.REFERENCE_CAPTURE_REDIS_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('Reference capture BullMQ live integration (TEST H)', () => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };

  it('executes >=3 autonomous cycles with unique job IDs and stops cleanly', async () => {
    const sessionId = `sess-live-${randomUUID().slice(0, 8)}`;
    const queueName = `${QUEUE_NAMES.REFERENCE_CAPTURE}-live-${randomUUID().slice(0, 6)}`;
    const queue = new Queue(queueName, { connection });

    let recording = true;
    let cycleCount = 0;
    const processedJobIds: string[] = [];
    const acquisitionState = { cycleCount: 0 };

    const worker = new Worker(
      queueName,
      async (job) => {
        if (!recording) return;
        processedJobIds.push(job.id!);
        cycleCount += 1;
        acquisitionState.cycleCount = cycleCount;

        if (!recording) return;

        const current = job.data as { cycleNumber: number };
        if (recording && current.cycleNumber < 100) {
          const nextNumber = current.cycleNumber + 1;
          const nextUuid = createReferenceCaptureCycleUuid();
          const nextJobId = buildReferenceCaptureCycleJobId(sessionId, nextNumber, nextUuid);
          await queue.add(
            REFERENCE_CAPTURE_JOB_NAME,
            { sessionId, cycleNumber: nextNumber, cycleUuid: nextUuid },
            { jobId: nextJobId, delay: 80, removeOnComplete: true },
          );
        }
      },
      { connection, concurrency: 1 },
    );

    try {
      const firstUuid = createReferenceCaptureCycleUuid();
      const firstJobId = buildReferenceCaptureCycleJobId(sessionId, 1, firstUuid);
      await queue.add(
        REFERENCE_CAPTURE_JOB_NAME,
        { sessionId, cycleNumber: 1, cycleUuid: firstUuid },
        { jobId: firstJobId, delay: 0, removeOnComplete: true },
      );

      await new Promise((r) => setTimeout(r, 600));
      expect(processedJobIds.length).toBeGreaterThanOrEqual(3);
      expect(new Set(processedJobIds).size).toBe(processedJobIds.length);
      expect(acquisitionState.cycleCount).toBeGreaterThanOrEqual(3);

      recording = false;
      const pendingJobId = buildReferenceCaptureCycleJobId(
        sessionId,
        acquisitionState.cycleCount + 1,
        createReferenceCaptureCycleUuid(),
      );
      const pending = await queue.getJob(pendingJobId);
      if (pending) {
        const state = await pending.getState();
        if (state === 'delayed' || state === 'waiting') {
          await pending.remove();
        }
      }

      const beforeStopCount = processedJobIds.length;
      await new Promise((r) => setTimeout(r, 300));
      expect(processedJobIds.length).toBe(beforeStopCount);
    } finally {
      recording = false;
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 20_000);
});
