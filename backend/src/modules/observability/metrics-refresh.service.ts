import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { VoiceProviderWebhookProcessingStatus } from '@prisma/client';
import { ClickHouseAnalyticsService } from '@modules/clickhouse/clickhouse-analytics.service';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { VoiceMetricsService } from './voice-metrics.service';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { RuntimeStatusRegistry } from './runtime-status.registry';
import { TripMetricsService } from './trip-metrics.service';
import { setBatteryV2VehiclesWithoutPublication } from '../vehicle-intelligence/battery-health/observability/battery-v2-prometheus.metrics';
import { ALL_WORKER_QUEUES } from '@modules/worker-observability/worker-queue-catalog';
import { WorkerObservabilityMetrics } from '@modules/worker-observability/worker-observability.metrics';

const BATTERY_POSTGRES_TABLES = [
  'battery_measurement',
  'battery_measurement_session',
  'battery_assessment',
  'battery_publication',
  'hv_capacity_observation',
  'hv_charge_session',
  'battery_v2_job_dead_letter',
  'vehicle_battery_capability',
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
    private readonly redis: RedisService,
    @Optional() private readonly chAnalytics?: ClickHouseAnalyticsService,
    @Optional() private readonly clickHouse?: ClickHouseService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly voiceMetrics?: VoiceMetricsService,
    @Optional() private readonly workerMetrics?: WorkerObservabilityMetrics,
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

    this.queues = ALL_WORKER_QUEUES.map(
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

  @Cron('*/30 * * * * *')
  async refreshDependencyUpGauges(): Promise<void> {
    if (this.prisma) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        this.metrics.dependencyUp.set({ dependency: 'postgres' }, 1);
      } catch {
        this.metrics.dependencyUp.set({ dependency: 'postgres' }, 0);
      }
    }

    try {
      const pong = await this.redis.ping();
      this.metrics.dependencyUp.set({ dependency: 'redis' }, pong === 'PONG' ? 1 : 0);
    } catch {
      this.metrics.dependencyUp.set({ dependency: 'redis' }, 0);
    }

    if (this.clickHouse) {
      const status = this.clickHouse.getStatus();
      const depOk =
        status.status === 'available' || status.status === 'disabled' ? 1 : 0;
      this.metrics.dependencyUp.set({ dependency: 'clickhouse' }, depOk);
    }
  }

  @Cron('*/60 * * * * *')
  async refreshQueueFailedGauges(): Promise<void> {
    if (this.queues.length === 0) return;

    await Promise.all(
      this.queues.map(async (queue) => {
        try {
          const counts = await queue.getJobCounts(
            'failed',
            'active',
            'waiting',
            'delayed',
          );
          this.metrics.queueFailedJobs.set(
            { queue: queue.name },
            counts.failed ?? 0,
          );

          if (this.workerMetrics) {
            const h = this.workerMetrics.handles;
            h.queueWaitingJobs.set({ queue: queue.name }, counts.waiting ?? 0);
            h.queueActiveJobs.set({ queue: queue.name }, counts.active ?? 0);
            h.queueDelayedJobs.set({ queue: queue.name }, counts.delayed ?? 0);
          }

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

  @Cron('*/60 * * * * *')
  async refreshVoiceWebhookGauges(): Promise<void> {
    if (!this.prisma || !this.voiceMetrics) return;

    try {
      const counts = await this.prisma.voiceProviderWebhookEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
      });
      for (const row of counts) {
        this.voiceMetrics.webhookBacklog.set({ status: row.status }, row._count._all);
      }

      const dlq24h = await this.prisma.voiceProviderWebhookEvent.count({
        where: {
          status: VoiceProviderWebhookProcessingStatus.FAILED,
          receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      this.voiceMetrics.webhookDlqGauge.set(dlq24h);
    } catch (err: unknown) {
      this.logger.debug(
        `Voice webhook gauge refresh skipped: ${(err as Error).message}`,
      );
    }
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

  @Cron('*/5 * * * *')
  async refreshBatteryPostgresTableRows(): Promise<void> {
    if (!this.prisma) return;

    await Promise.all(
      BATTERY_POSTGRES_TABLES.map(async (table) => {
        try {
          const count = await this.countBatteryPostgresTable(table);
          this.metrics.batteryPostgresTableRows.set({ table }, count);
        } catch (err: unknown) {
          this.logger.debug(
            `Battery postgres row gauge refresh skipped for ${table}: ${
              (err as Error).message
            }`,
          );
        }
      }),
    );

    await this.refreshBatteryV2PublicationCoverageGauges();
  }

  private async refreshBatteryV2PublicationCoverageGauges(): Promise<void> {
    if (!this.prisma) return;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT vbc.vehicle_id)::bigint AS count
        FROM vehicle_battery_capabilities vbc
        WHERE vbc.signal_key = 'lv.voltage'
          AND vbc.status IN ('AVAILABLE', 'AVAILABLE_STALE', 'AVAILABLE_NULL')
          AND NOT EXISTS (
            SELECT 1
            FROM battery_publications bp
            WHERE bp.vehicle_id = vbc.vehicle_id
              AND bp.scope = 'LV'
          )
      `;
      const missing = Number(rows[0]?.count ?? 0);
      setBatteryV2VehiclesWithoutPublication(this.metrics, { scope: 'lv', count: missing });
    } catch (err: unknown) {
      this.logger.debug(
        `Battery V2 publication coverage gauge refresh skipped: ${(err as Error).message}`,
      );
    }
  }

  private async countBatteryPostgresTable(table: (typeof BATTERY_POSTGRES_TABLES)[number]): Promise<number> {
    switch (table) {
      case 'battery_measurement':
        return this.prisma!.batteryMeasurement.count();
      case 'battery_measurement_session':
        return this.prisma!.batteryMeasurementSession.count();
      case 'battery_assessment':
        return this.prisma!.batteryAssessment.count();
      case 'battery_publication':
        return this.prisma!.batteryPublication.count();
      case 'hv_capacity_observation':
        return this.prisma!.hvCapacityObservation.count();
      case 'hv_charge_session':
        return this.prisma!.hvChargeSession.count();
      case 'battery_v2_job_dead_letter':
        return this.prisma!.batteryV2JobDeadLetter.count();
      case 'vehicle_battery_capability':
        return this.prisma!.vehicleBatteryCapability.count();
      default:
        return 0;
    }
  }
}
