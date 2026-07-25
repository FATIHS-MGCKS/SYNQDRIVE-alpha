import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { DocumentExtractionHealthService } from '@modules/document-extraction/document-extraction-health.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { OperatorObservabilityService } from './operator-observability.service';

export interface OperatorHealthSnapshot {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    documentQueue: { status: 'ok' | 'degraded' | 'error'; waitingJobs?: number; activeJobs?: number };
    storage: { status: 'ok' | 'error'; available: boolean };
    outbox: { status: 'ok' | 'degraded' | 'error'; pending?: number };
    workers: { status: 'ok' | 'error'; enabled: boolean };
  };
  timestamp: string;
}

@Injectable()
export class OperatorHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperatorHealthService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly operatorObservability: OperatorObservabilityService,
    @Optional() private readonly documentHealth?: DocumentExtractionHealthService,
  ) {}

  onModuleInit(): void {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) return;
    this.queue = new Queue(QUEUE_NAMES.DOCUMENT_EXTRACTION, {
      connection: {
        host: this.config.get<string>('redis.host') ?? 'localhost',
        port: this.config.get<number>('redis.port') ?? 6379,
        password: this.config.get<string>('redis.password') || undefined,
        db: this.config.get<number>('redis.db') ?? 0,
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
    this.queue = null;
  }

  async getHealth(): Promise<OperatorHealthSnapshot> {
    const workersEnabled = RuntimeStatusRegistry.getWorkersEnabled();
    const docHealth = this.documentHealth
      ? await this.documentHealth.getHealth().catch(() => null)
      : null;

    let waitingJobs = docHealth?.waitingJobs ?? 0;
    let activeJobs = docHealth?.activeJobs ?? 0;
    if (this.queue) {
      try {
        const counts = await this.queue.getJobCounts('waiting', 'active');
        waitingJobs = counts.waiting ?? waitingJobs;
        activeJobs = counts.active ?? activeJobs;
      } catch {
        // keep docHealth fallback
      }
    }

    const storageAvailable = docHealth?.storageAvailable ?? true;
    let outboxPending = 0;
    try {
      outboxPending = await this.prisma.taskAutomationOutbox.count({
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Operator outbox backlog probe failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.operatorObservability.setUploadQueueBacklog(waitingJobs);
    this.operatorObservability.setOutboxBacklog(outboxPending);
    this.operatorObservability.setStorageHealth(storageAvailable);

    const queueStatus =
      waitingJobs > 200 ? 'error' : waitingJobs > 50 ? 'degraded' : 'ok';
    const outboxStatus =
      outboxPending > 500 ? 'error' : outboxPending > 100 ? 'degraded' : 'ok';

    const checks = {
      documentQueue: {
        status: queueStatus,
        waitingJobs,
        activeJobs,
      },
      storage: {
        status: storageAvailable ? ('ok' as const) : ('error' as const),
        available: storageAvailable,
      },
      outbox: {
        status: outboxStatus,
        pending: outboxPending,
      },
      workers: {
        status: workersEnabled ? ('ok' as const) : ('error' as const),
        enabled: workersEnabled,
      },
    };

    const hardFailures = [
      checks.storage.status === 'error',
      checks.workers.status === 'error',
      checks.documentQueue.status === 'error',
    ];
    const softFailures = [
      checks.documentQueue.status === 'degraded',
      checks.outbox.status === 'degraded' || checks.outbox.status === 'error',
    ];

    const status = hardFailures.some(Boolean)
      ? 'error'
      : softFailures.some(Boolean)
        ? 'degraded'
        : 'ok';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  @Cron('*/60 * * * * *')
  async refreshGauges(): Promise<void> {
    try {
      await this.getHealth();
    } catch (err: unknown) {
      this.logger.debug(
        `Operator gauge refresh skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
