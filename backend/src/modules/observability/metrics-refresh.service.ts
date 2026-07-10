import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { ClickHouseAnalyticsService } from '@modules/clickhouse/clickhouse-analytics.service';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { RuntimeStatusRegistry } from './runtime-status.registry';
import { TripMetricsService } from './trip-metrics.service';

const MONITORED_QUEUES = [
  QUEUE_NAMES.DIMO_SNAPSHOT,
  QUEUE_NAMES.TRIP_TRACKING,
  QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT,
  QUEUE_NAMES.DOCUMENT_EXTRACTION,
] as const;

/**
 * Periodically refreshes low-cardinality gauges that cannot be updated inline
 * (queue failed counts, ClickHouse table row totals).
 */
@Injectable()
export class MetricsRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsRefreshService.name);
  private queues: Queue[] = [];

  constructor(
    private readonly metrics: TripMetricsService,
    private readonly config: ConfigService,
    @Optional() private readonly chAnalytics?: ClickHouseAnalyticsService,
  ) {}

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

    this.queues = MONITORED_QUEUES.map(
      (name) =>
        new Queue(name, {
          connection,
        }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queues.map((q) => q.close().catch(() => undefined)));
    this.queues = [];
  }

  @Cron('*/60 * * * * *')
  async refreshQueueFailedGauges(): Promise<void> {
    if (this.queues.length === 0) return;

    await Promise.all(
      this.queues.map(async (queue) => {
        try {
          const counts = await queue.getJobCounts('failed', 'active', 'waiting');
          this.metrics.queueFailedJobs.set(
            { queue: queue.name },
            counts.failed ?? 0,
          );

          if (queue.name === QUEUE_NAMES.DOCUMENT_EXTRACTION) {
            this.metrics.documentExtractionActiveJobs.set(counts.active ?? 0);
            const waitingJobs = await queue.getJobs(['waiting'], 0, 0, true);
            const oldest = waitingJobs[0];
            if (oldest?.timestamp) {
              const ageSeconds = Math.max(0, (Date.now() - oldest.timestamp) / 1000);
              this.metrics.documentExtractionQueueAge.set(ageSeconds);
            } else {
              this.metrics.documentExtractionQueueAge.set(0);
            }
          }
        } catch (err: unknown) {
          this.logger.debug(
            `Queue failed gauge refresh skipped for ${queue.name}: ${
              (err as Error).message
            }`,
          );
        }
      }),
    );
  }

  @Cron('*/5 * * * *')
  async refreshClickHouseTableRows(): Promise<void> {
    if (!this.chAnalytics) return;

    try {
      const stats = await this.chAnalytics.getStorageStats();
      if (!stats) return;

      for (const table of stats.tables) {
        this.metrics.clickHouseTableRows.set(
          { table: table.table, status: 'active' },
          table.rowCount,
        );
      }
    } catch (err: unknown) {
      this.logger.debug(
        `ClickHouse table row gauge refresh skipped: ${(err as Error).message}`,
      );
    }
  }
}
