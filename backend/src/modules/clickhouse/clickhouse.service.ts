import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import { TripMetricsService } from '../observability/trip-metrics.service';
import { clickHouseSchemaStatusCode } from '../observability/clickhouse-metrics.helper';
import {
  ClickHouseCircuitBreaker,
  type ClickHouseCircuitSnapshot,
} from './clickhouse-circuit-breaker';
import {
  ClickHouseCircuitOpenError,
  ClickHouseQueryTimeoutError,
  withQueryTimeout,
} from './clickhouse-query-guard';

/** Periodic health ping interval (ms). Keeps `isAvailable` accurate after runtime outages. */
const HEALTH_PING_INTERVAL_MS = 60_000;
const DEFAULT_ANALYSIS_QUERY_TIMEOUT_MS = 5_000;

/**
 * ClickHouseService
 *
 * Manages the ClickHouse connection lifecycle. All other ClickHouse services
 * inject this to get the shared client. Gracefully degrades when ClickHouse
 * is not configured (CLICKHOUSE_URL missing).
 */
export type ClickHouseOverallStatus =
  | 'disabled'
  | 'available'
  | 'degraded'
  | 'schema_error';

export interface ClickHouseStatus {
  configured: boolean;
  available: boolean;
  status: ClickHouseOverallStatus;
  database: string | null;
  lastPingAt: string | null;
  lastSchemaInitAt: string | null;
  lastSchemaError: string | null;
  appliedMigrationCount: number | null;
  pendingMigrationCount: number | null;
  /** Backwards-compatible last connection error (ping/init), if any. */
  lastError: string | null;
  circuitState: ClickHouseCircuitSnapshot['state'];
  consecutiveFailures: number;
  circuitOpenedAt: string | null;
}

export interface ClickHouseSchemaStatusUpdate {
  lastSchemaInitAt?: Date | null;
  lastSchemaError?: string | null;
  appliedMigrationCount?: number | null;
  pendingMigrationCount?: number | null;
}

@Injectable()
export class ClickHouseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickHouseService.name);
  private client: ClickHouseClient | null = null;
  private configured = false;
  private available = false;
  private lastError: string | null = null;
  private lastPingAt: Date | null = null;

  // Schema/migration status — reported by ClickHouseSchemaService after the
  // migration runner executes. Kept here so other modules can read a single,
  // consistent status without re-deriving it.
  private lastSchemaInitAt: Date | null = null;
  private lastSchemaError: string | null = null;
  private appliedMigrationCount: number | null = null;
  private pendingMigrationCount: number | null = null;
  private healthPingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly circuitBreaker: ClickHouseCircuitBreaker;
  private readonly analysisQueryTimeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {
    const failureThreshold = Number(
      this.config.get<string>('CLICKHOUSE_CIRCUIT_FAILURE_THRESHOLD') ?? 3,
    );
    const cooldownMs = Number(
      this.config.get<string>('CLICKHOUSE_CIRCUIT_COOLDOWN_MS') ?? 30_000,
    );
    this.circuitBreaker = new ClickHouseCircuitBreaker({
      failureThreshold:
        Number.isFinite(failureThreshold) && failureThreshold > 0
          ? failureThreshold
          : 3,
      cooldownMs:
        Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : 30_000,
    });
    const timeoutMs = Number(
      this.config.get<string>('CLICKHOUSE_ANALYSIS_QUERY_TIMEOUT_MS') ??
        DEFAULT_ANALYSIS_QUERY_TIMEOUT_MS,
    );
    this.analysisQueryTimeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_ANALYSIS_QUERY_TIMEOUT_MS;
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('CLICKHOUSE_URL');
    if (!url) {
      this.configured = false;
      this.available = false;
      this.lastError = 'CLICKHOUSE_URL not configured';
      this.metrics?.clickHouseConfigured.set(0);
      this.metrics?.clickHouseAvailable.set(0);
      this.metrics?.clickHouseSchemaStatus.set(
        clickHouseSchemaStatusCode('disabled'),
      );
      this.logger.warn(
        'CLICKHOUSE_URL not configured — ClickHouse analytics layer is disabled.',
      );
      return;
    }

    this.configured = true;
    this.metrics?.clickHouseConfigured.set(1);
    try {
      this.client = createClient({
        url,
        username: this.config.get<string>('CLICKHOUSE_USER') ?? 'default',
        password: this.config.get<string>('CLICKHOUSE_PASSWORD') ?? '',
        database: this.config.get<string>('CLICKHOUSE_DATABASE') ?? 'synqdrive',
        request_timeout: 30_000,
      });

      // Ping to verify connectivity
      const ping = await this.client.ping();
      if (ping.success) {
        this.setAvailable(true);
        this.logger.log('ClickHouse connected successfully.');
      } else {
        this.setAvailable(false, 'ClickHouse ping failed');
        this.logger.warn(`ClickHouse ping failed — analytics layer disabled.`);
      }
    } catch (err: unknown) {
      this.setAvailable(false, (err as Error).message);
      this.logger.warn(
        `ClickHouse init failed: ${(err as Error).message} — analytics layer disabled.`,
      );
    }

    if (this.configured && this.client) {
      this.healthPingTimer = setInterval(() => {
        void this.refreshAvailability();
      }, HEALTH_PING_INTERVAL_MS);
      this.healthPingTimer.unref?.();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.healthPingTimer) {
      clearInterval(this.healthPingTimer);
      this.healthPingTimer = null;
    }
    if (this.client) {
      await this.client.close();
      this.logger.log('ClickHouse client closed.');
    }
    this.setAvailable(false);
  }

  /**
   * Marks ClickHouse unavailable after a runtime write/query failure.
   * Next periodic ping may restore availability without process restart.
   */
  markUnavailable(reason: string, scope = 'runtime'): void {
    this.circuitBreaker.recordFailure();
    this.recordAnalysisGuardMetric('error', scope);
    if (!this.configured || !this.available) return;
    this.setAvailable(false, reason);
    this.logger.warn(`ClickHouse marked unavailable: ${reason}`);
  }

  getCircuitSnapshot(now = Date.now()): ClickHouseCircuitSnapshot {
    return this.circuitBreaker.getSnapshot(now);
  }

  /**
   * Guarded analysis read — timeout + circuit breaker + structured metric.
   * Returns null on degradation instead of throwing to callers.
   */
  async runGuardedAnalysisQuery<T>(
    scope: string,
    operation: () => Promise<T>,
    options?: { timeoutMs?: number },
  ): Promise<T | null> {
    if (!this.configured) {
      this.recordAnalysisGuardMetric('disabled', scope);
      return null;
    }

    if (!this.circuitBreaker.canExecute()) {
      this.recordAnalysisGuardMetric('circuit_open', scope);
      return null;
    }

    if (!this.client || !this.available) {
      this.recordAnalysisGuardMetric('error', scope);
      return null;
    }

    const timeoutMs = options?.timeoutMs ?? this.analysisQueryTimeoutMs;
    try {
      const result = await withQueryTimeout(operation, timeoutMs);
      this.circuitBreaker.recordSuccess();
      this.recordAnalysisGuardMetric('reachable', scope);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof ClickHouseQueryTimeoutError) {
        this.circuitBreaker.recordFailure();
        this.recordAnalysisGuardMetric('timeout', scope);
        this.setAvailable(false, message);
        return null;
      }
      if (err instanceof ClickHouseCircuitOpenError) {
        this.recordAnalysisGuardMetric('circuit_open', scope);
        return null;
      }
      this.recordAnalysisGuardMetric('error', scope);
      this.markUnavailable(message, scope);
      return null;
    }
  }

  private recordAnalysisGuardMetric(
    outcome: 'reachable' | 'timeout' | 'error' | 'circuit_open' | 'disabled' | 'recovered',
    scope: string,
  ): void {
    this.metrics?.clickHouseAnalysisGuard.inc({ outcome, scope });
  }

  recordAnalysisRecovery(scope: string): void {
    this.recordAnalysisGuardMetric('recovered', scope);
  }

  private setAvailable(available: boolean, error: string | null = null): void {
    const wasUnavailable = !this.available;
    this.available = available;
    this.lastError = available ? null : error;
    if (available) {
      this.lastPingAt = new Date();
      this.circuitBreaker.recordSuccess();
      if (wasUnavailable && this.configured) {
        this.recordAnalysisGuardMetric('recovered', 'health_ping');
      }
    }
    this.metrics?.clickHouseAvailable.set(available ? 1 : 0);
    this.syncSchemaStatusGauge();
  }

  private async refreshAvailability(): Promise<void> {
    if (!this.client || !this.configured) return;
    try {
      const ping = await this.client.ping();
      if (ping.success) {
        if (!this.available) {
          this.setAvailable(true);
          this.logger.log('ClickHouse connectivity restored.');
        } else {
          this.lastPingAt = new Date();
        }
      } else if (this.available) {
        this.setAvailable(false, 'ClickHouse ping failed');
      }
    } catch (err: unknown) {
      if (this.available) {
        this.setAvailable(false, (err as Error).message);
      }
    }
  }

  private syncSchemaStatusGauge(): void {
    this.metrics?.clickHouseSchemaStatus.set(
      clickHouseSchemaStatusCode(this.deriveStatus()),
    );
  }

  get isAvailable(): boolean {
    return this.available;
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  /** Resolved target database name (CLICKHOUSE_DATABASE, default 'synqdrive'). */
  get databaseName(): string {
    return this.config.get<string>('CLICKHOUSE_DATABASE') ?? 'synqdrive';
  }

  /**
   * Lets ClickHouseSchemaService report the outcome of the migration runner so
   * that the consolidated status (exposed via getStatus / health readiness)
   * reflects schema state without other modules having to guess.
   */
  reportSchemaStatus(update: ClickHouseSchemaStatusUpdate): void {
    if (update.lastSchemaInitAt !== undefined) {
      this.lastSchemaInitAt = update.lastSchemaInitAt;
    }
    if (update.lastSchemaError !== undefined) {
      this.lastSchemaError = update.lastSchemaError;
    }
    if (update.appliedMigrationCount !== undefined) {
      this.appliedMigrationCount = update.appliedMigrationCount;
    }
    if (update.pendingMigrationCount !== undefined) {
      this.pendingMigrationCount = update.pendingMigrationCount;
    }
    this.syncSchemaStatusGauge();
  }

  /**
   * Derives the coarse operational status:
   *  - disabled     : CLICKHOUSE_URL not configured
   *  - degraded     : configured but not reachable
   *  - schema_error : reachable but migration/schema init failed
   *  - available    : reachable and schema healthy
   */
  private deriveStatus(): ClickHouseOverallStatus {
    if (!this.configured) return 'disabled';
    if (!this.available) return 'degraded';
    if (this.lastSchemaError) return 'schema_error';
    return 'available';
  }

  getStatus(): ClickHouseStatus {
    const circuit = this.circuitBreaker.getSnapshot();
    return {
      configured: this.configured,
      available: this.available,
      status: this.deriveStatus(),
      database: this.configured
        ? this.config.get<string>('CLICKHOUSE_DATABASE') ?? 'synqdrive'
        : null,
      lastPingAt: this.lastPingAt?.toISOString() ?? null,
      lastSchemaInitAt: this.lastSchemaInitAt?.toISOString() ?? null,
      lastSchemaError: this.lastSchemaError,
      appliedMigrationCount: this.appliedMigrationCount,
      pendingMigrationCount: this.pendingMigrationCount,
      lastError: this.lastError,
      circuitState: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      circuitOpenedAt: circuit.openedAt,
    };
  }

  /** Returns the shared client scoped to CLICKHOUSE_DATABASE. */
  getClient(): ClickHouseClient {
    if (!this.client || !this.available) {
      throw new Error('ClickHouse is not available');
    }
    return this.client;
  }

  /**
   * Returns a short-lived client connected to the `default` database.
   * Used exclusively by ClickHouseSchemaService for DDL (CREATE DATABASE /
   * CREATE TABLE IF NOT EXISTS synqdrive.*) so that commands succeed even
   * before the target database exists.
   * Caller is responsible for closing the returned client.
   */
  createAdminClient(): ClickHouseClient {
    const url = this.config.get<string>('CLICKHOUSE_URL')!;
    return createClient({
      url,
      username: this.config.get<string>('CLICKHOUSE_USER') ?? 'default',
      password: this.config.get<string>('CLICKHOUSE_PASSWORD') ?? '',
      database: 'default',
      request_timeout: 30_000,
    });
  }
}
