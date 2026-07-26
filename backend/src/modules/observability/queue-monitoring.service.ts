import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { RuntimeStatusRegistry } from './runtime-status.registry';

export interface QueueJobCounts {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
  status: 'healthy' | 'warning' | 'critical' | 'idle';
}

@Injectable()
export class QueueMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMonitoringService.name);
  private queues: Queue[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return;
    }

    const connection = {
      host: this.config.get<string>('redis.host') ?? 'localhost',
      port: this.config.get<number>('redis.port') ?? 6379,
      password: this.config.get<string>('redis.password') || undefined,
      db: this.config.get<number>('redis.db') ?? 0,
    };

    this.queues = Object.values(QUEUE_NAMES).map((name) => new Queue(name, { connection }));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queues.map((q) => q.close().catch(() => undefined)));
    this.queues = [];
  }

  async getAllQueueCounts(): Promise<QueueJobCounts[]> {
    if (this.queues.length === 0) {
      return Object.values(QUEUE_NAMES).map((queue) => ({
        queue,
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 0,
        paused: 0,
        status: 'idle' as const,
      }));
    }

    return Promise.all(
      this.queues.map(async (queue) => {
        try {
          const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
            'completed',
            'paused',
          );
          const waiting = counts.waiting ?? 0;
          const active = counts.active ?? 0;
          const delayed = counts.delayed ?? 0;
          const failed = counts.failed ?? 0;
          const completed = counts.completed ?? 0;
          const paused = counts.paused ?? 0;

          let status: QueueJobCounts['status'] = 'healthy';
          if (failed > 10 || delayed > 50) status = 'critical';
          else if (failed > 0 || delayed > 10 || waiting > 100) status = 'warning';
          else if (waiting + active + delayed + failed === 0) status = 'idle';

          return {
            queue: queue.name,
            waiting,
            active,
            delayed,
            failed,
            completed,
            paused,
            status,
          };
        } catch (err: unknown) {
          this.logger.debug(
            `Queue counts skipped for ${queue.name}: ${(err as Error).message}`,
          );
          return {
            queue: queue.name,
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
            paused: 0,
            status: 'idle' as const,
          };
        }
      }),
    );
  }

  /**
   * Fast BullMQ broker probe — verifies Redis-backed queue metadata is readable.
   */
  async probeBrokerReachable(timeoutMs = 2_500): Promise<{
    ok: boolean;
    responseMs: number;
    error?: string;
    queue?: string;
  }> {
    const start = Date.now();
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: 'workers_disabled_at_bootstrap',
      };
    }

    const probeQueue =
      this.queues.find((q) => q.name === QUEUE_NAMES.NOTIFICATION_EVALUATION) ??
      this.queues[0];
    if (!probeQueue) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: 'no_queue_clients_initialized',
      };
    }

    try {
      await Promise.race([
        probeQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue_probe_timeout')), timeoutMs),
        ),
      ]);
      return {
        ok: true,
        responseMs: Date.now() - start,
        queue: probeQueue.name,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: (err as Error).message,
        queue: probeQueue.name,
      };
    }
  }

  async probeNamedQueues(
    queueNames: string[],
    timeoutMs = 2_500,
  ): Promise<{
    ok: boolean;
    responseMs: number;
    error?: string;
    counts: Record<string, Record<string, number>>;
  }> {
    const start = Date.now();
    const targets = this.queues.filter((q) => queueNames.includes(q.name));
    if (targets.length !== queueNames.length) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: 'queue_clients_missing',
        counts: {},
      };
    }

    try {
      const entries = await Promise.race([
        Promise.all(
          targets.map(async (queue) => {
            const counts = await queue.getJobCounts(
              'waiting',
              'active',
              'failed',
              'delayed',
            );
            return [queue.name, counts] as const;
          }),
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue_probe_timeout')), timeoutMs),
        ),
      ]);

      const counts = Object.fromEntries(entries);
      return {
        ok: true,
        responseMs: Date.now() - start,
        counts,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        responseMs: Date.now() - start,
        error: (err as Error).message,
        counts: {},
      };
    }
  }
}
