import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { ClickHouseAnalyticsService } from '@modules/clickhouse/clickhouse-analytics.service';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

export interface DependencyStatus {
  status: 'ok' | 'error';
  responseMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clickHouse: ClickHouseService,
    private readonly clickHouseAnalytics: ClickHouseAnalyticsService,
  ) {}

  async checkReadiness(): Promise<{
    status: 'ok' | 'degraded';
    checks: Record<string, DependencyStatus>;
  }> {
    const [postgres, redis, clickhouse, workers] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkClickHouse(),
      this.checkWorkerRuntime(),
    ]);

    const checks = { postgres, redis, clickhouse, workers };
    const allHealthy = Object.values(checks).every((c) => c.status === 'ok');
    const status = allHealthy ? 'ok' : 'degraded';

    return { status, checks };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', responseMs: Date.now() - start };
    } catch (err: any) {
      this.logger.warn(`Readiness check — Postgres failed: ${err?.message}`);
      return { status: 'error', responseMs: Date.now() - start, error: err?.message };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      // RedisService extends ioredis Redis directly, so ping() is available
      const result = await this.redis.ping();
      if (result !== 'PONG') throw new Error(`Unexpected PING response: ${result}`);
      return { status: 'ok', responseMs: Date.now() - start };
    } catch (err: any) {
      this.logger.warn(`Readiness check — Redis failed: ${err?.message}`);
      return { status: 'error', responseMs: Date.now() - start, error: err?.message };
    }
  }

  private async checkClickHouse(): Promise<DependencyStatus> {
    const start = Date.now();
    const status = this.clickHouse.getStatus();

    if (!status.configured) {
      return {
        status: 'error',
        responseMs: Date.now() - start,
        error: status.lastError ?? 'clickhouse_not_configured',
        details: {
          configured: status.configured,
          available: status.available,
          database: status.database,
        },
      };
    }

    if (!status.available) {
      return {
        status: 'error',
        responseMs: Date.now() - start,
        error: status.lastError ?? 'clickhouse_unavailable',
        details: {
          configured: status.configured,
          available: status.available,
          database: status.database,
        },
      };
    }

    try {
      const ingestion = await this.clickHouseAnalytics.summarizeRecentIngestion(
        new Date(Date.now() - 15 * 60_000),
      );
      return {
        status: 'ok',
        responseMs: Date.now() - start,
        details: {
          configured: status.configured,
          available: status.available,
          database: status.database,
          recentSnapshotCount: ingestion.snapshotCount,
          recentStateChangeCount: ingestion.stateChangeCount,
          latestSnapshotAt: ingestion.latestSnapshotAt?.toISOString() ?? null,
          latestStateChangeAt:
            ingestion.latestStateChangeAt?.toISOString() ?? null,
        },
      };
    } catch (err: any) {
      this.logger.warn(`Readiness check — ClickHouse failed: ${err?.message}`);
      return {
        status: 'error',
        responseMs: Date.now() - start,
        error: err?.message,
        details: {
          configured: status.configured,
          available: status.available,
          database: status.database,
        },
      };
    }
  }

  private async checkWorkerRuntime(): Promise<DependencyStatus> {
    const start = Date.now();
    const workersEnabled = RuntimeStatusRegistry.getWorkersEnabled();

    if (!workersEnabled) {
      return {
        status: 'error',
        responseMs: Date.now() - start,
        error: 'workers_disabled_at_bootstrap',
        details: {
          workersEnabled,
        },
      };
    }

    try {
      const info = await this.redis.info('server');
      const match = info.match(/redis_version:(\d+)\.(\d+)/);
      const major = match ? parseInt(match[1], 10) : null;

      return {
        status: major != null && major >= 5 ? 'ok' : 'error',
        responseMs: Date.now() - start,
        ...(major != null && major >= 5
          ? {}
          : { error: 'redis_version_incompatible_for_workers' }),
        details: {
          workersEnabled,
          redisMajorVersion: major,
        },
      };
    } catch (err: any) {
      this.logger.warn(`Readiness check — Worker runtime failed: ${err?.message}`);
      return {
        status: 'error',
        responseMs: Date.now() - start,
        error: err?.message,
        details: {
          workersEnabled,
        },
      };
    }
  }
}
