import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { ALL_WORKER_QUEUES } from './worker-queue-catalog';
import { WorkerObservabilityMetrics } from './worker-observability.metrics';

@Injectable()
export class WorkerQueueEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerQueueEventsService.name);
  private readonly queueEvents: QueueEvents[] = [];
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly workerMetrics?: WorkerObservabilityMetrics,
  ) {}

  onModuleInit(): void {
    if (!RuntimeStatusRegistry.getWorkersEnabled() || !this.workerMetrics) {
      return;
    }

    const connection = {
      host: this.config.get<string>('redis.host') ?? 'localhost',
      port: this.config.get<number>('redis.port') ?? 6379,
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db') ?? 0,
    };

    for (const queueName of ALL_WORKER_QUEUES) {
      const queue = new Queue(queueName, { connection });
      const events = new QueueEvents(queueName, { connection });
      this.queues.set(queueName, queue);
      this.queueEvents.push(events);
      this.bindQueueEvents(queueName, queue, events);
    }

    this.logger.log(`Worker QueueEvents listening on ${ALL_WORKER_QUEUES.length} queues`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queueEvents.map((e) => e.close().catch(() => undefined)));
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
    this.queueEvents.length = 0;
    this.queues.clear();
  }

  private bindQueueEvents(queueName: string, queue: Queue, events: QueueEvents): void {
    const m = this.workerMetrics!.handles;

    events.on('completed', async ({ jobId }) => {
      try {
        const job = await queue.getJob(jobId);
        if (!job?.processedOn || !job.finishedOn) return;
        const durationSec = Math.max(0, (job.finishedOn - job.processedOn) / 1000);
        m.queueJobDurationSeconds.observe({ queue: queueName, result: 'success' }, durationSec);
        m.queueJobsProcessedTotal.inc({ queue: queueName, result: 'success' });
      } catch (err: unknown) {
        this.logger.debug(
          `completed metrics skipped for ${queueName}/${jobId}: ${(err as Error).message}`,
        );
      }
    });

    events.on('failed', async ({ jobId }) => {
      try {
        const job = await queue.getJob(jobId);
        const attempts = job?.attemptsMade ?? 0;
        const maxAttempts = job?.opts?.attempts ?? 1;
        const willRetry = attempts < maxAttempts;
        if (willRetry) {
          m.queueJobRetriesTotal.inc({ queue: queueName });
        }
        if (job?.processedOn && job.finishedOn) {
          const durationSec = Math.max(0, (job.finishedOn - job.processedOn) / 1000);
          m.queueJobDurationSeconds.observe(
            { queue: queueName, result: willRetry ? 'retry' : 'failure' },
            durationSec,
          );
        }
        if (!willRetry) {
          m.queueJobsProcessedTotal.inc({ queue: queueName, result: 'failure' });
        }
      } catch (err: unknown) {
        this.logger.debug(
          `failed metrics skipped for ${queueName}/${jobId}: ${(err as Error).message}`,
        );
      }
    });

    events.on('stalled', () => {
      m.queueJobsStalledTotal.inc({ queue: queueName });
    });

    events.on('deduplicated', () => {
      m.queueEnqueueDuplicateTotal.inc({ queue: queueName, reason: 'deduplicated' });
    });

    events.on('error', (err: Error) => {
      this.logger.debug(`QueueEvents error on ${queueName}: ${err.message}`);
    });
  }
}
