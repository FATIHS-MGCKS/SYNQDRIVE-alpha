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

    // ClickHouse is an OPTIONAL analytics/telemetry mirror. It must never drag
    // the overall operational readiness into 'degraded'. Only the hard
    // dependencies (PostgreSQL, Redis, workers runtime) determine the status.
    const hardChecks = [postgres, redis, workers];
    const allHealthy = hardChecks.every((c) => c.status === 'ok');
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
    const ch = this.clickHouse.getStatus();

    // Map the granular ClickHouse status onto the binary dependency status.
    // 'disabled' (intentionally off) and 'available' are NOT faults; only
    // 'degraded' (configured but unreachable) and 'schema_error' are.
    const depStatus: 'ok' | 'error' =
      ch.status === 'available' || ch.status === 'disabled' ? 'ok' : 'error';

    const details: Record<string, unknown> = {
      status: ch.status,
      configured: ch.configured,
      available: ch.available,
      database: ch.database,
      lastPingAt: ch.lastPingAt,
      lastSchemaInitAt: ch.lastSchemaInitAt,
      lastSchemaError: ch.lastSchemaError,
      appliedMigrationCount: ch.appliedMigrationCount,
      pendingMigrationCount: ch.pendingMigrationCount,
    };

    // Only probe ingestion when fully available; failures here are informational
    // and must not turn the optional mirror into a hard failure.
    if (ch.status === 'available') {
      try {
        const ingestion =
          await this.clickHouseAnalytics.summarizeRecentIngestion(
            new Date(Date.now() - 15 * 60_000),
          );
        details.recentSnapshotCount = ingestion.snapshotCount;
        details.recentStateChangeCount = ingestion.stateChangeCount;
        details.latestSnapshotAt =
          ingestion.latestSnapshotAt?.toISOString() ?? null;
        details.latestStateChangeAt =
          ingestion.latestStateChangeAt?.toISOString() ?? null;
      } catch (err: any) {
        this.logger.warn(
          `Readiness check — ClickHouse ingestion probe failed: ${err?.message}`,
        );
        details.ingestionError = err?.message;
      }

      // Best-effort storage stats (metadata-only, capped) — never blocks or
      // fails the readiness response.
      try {
        const storage = await this.clickHouseAnalytics.getStorageStats();
        if (storage) {
          details.storage = storage;
        }
      } catch (err: any) {
        this.logger.warn(
          `Readiness check — ClickHouse storage stats failed: ${err?.message}`,
        );
      }
    }

    return {
      status: depStatus,
      responseMs: Date.now() - start,
      ...(depStatus === 'error'
        ? { error: ch.lastSchemaError ?? ch.lastError ?? ch.status }
        : {}),
      details,
    };
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
