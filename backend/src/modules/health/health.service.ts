import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { ClickHouseAnalyticsService } from '@modules/clickhouse/clickhouse-analytics.service';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { DocumentExtractionHealthService } from '@modules/document-extraction/document-extraction-health.service';

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
    @Optional() private readonly documentExtractionHealth?: DocumentExtractionHealthService,
  ) {}

  async checkReadiness(): Promise<{
    status: 'ok' | 'degraded';
    checks: Record<string, DependencyStatus>;
  }> {
    const [postgres, redis, clickhouse, workers, documentExtraction] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkClickHouse(),
      this.checkWorkerRuntime(),
      this.checkDocumentExtraction(),
    ]);

    const checks = { postgres, redis, clickhouse, workers, documentExtraction };

    const hardChecks = [postgres, redis, workers, documentExtraction];
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

  private async checkDocumentExtraction(): Promise<DependencyStatus> {
    const start = Date.now();
    if (!this.documentExtractionHealth) {
      return {
        status: 'ok',
        responseMs: Date.now() - start,
        details: { skipped: true },
      };
    }
    try {
      const health = await this.documentExtractionHealth.getHealth();
      const depStatus: 'ok' | 'error' = health.status === 'error' ? 'error' : 'ok';
      return {
        status: depStatus,
        responseMs: Date.now() - start,
        ...(depStatus === 'error'
          ? { error: 'document_extraction_unavailable' }
          : {}),
        details: {
          queueEnabled: health.queueEnabled,
          workersEnabled: health.workersEnabled,
          queueReachable: health.queueReachable,
          mistralOcrConfigured: health.mistralOcrConfigured,
          aiExtractionConfigured: health.aiExtractionConfigured,
          storageAvailable: health.storageAvailable,
          waitingJobs: health.waitingJobs,
          activeJobs: health.activeJobs,
        },
      };
    } catch (err: any) {
      this.logger.warn(`Readiness check — document extraction failed: ${err?.message}`);
      return {
        status: 'error',
        responseMs: Date.now() - start,
        error: err?.message,
      };
    }
  }
}
