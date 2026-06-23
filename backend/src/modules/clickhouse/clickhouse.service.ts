import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import { TripMetricsService } from '../observability/trip-metrics.service';

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

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('CLICKHOUSE_URL');
    if (!url) {
      this.configured = false;
      this.available = false;
      this.lastError = 'CLICKHOUSE_URL not configured';
      this.metrics?.clickHouseConfigured.set(0);
      this.metrics?.clickHouseAvailable.set(0);
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
        this.available = true;
        this.lastError = null;
        this.lastPingAt = new Date();
        this.metrics?.clickHouseAvailable.set(1);
        this.logger.log('ClickHouse connected successfully.');
      } else {
        this.available = false;
        this.lastError = 'ClickHouse ping failed';
        this.metrics?.clickHouseAvailable.set(0);
        this.logger.warn(`ClickHouse ping failed — analytics layer disabled.`);
      }
    } catch (err: unknown) {
      this.available = false;
      this.lastError = (err as Error).message;
      this.metrics?.clickHouseAvailable.set(0);
      this.logger.warn(
        `ClickHouse init failed: ${(err as Error).message} — analytics layer disabled.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.logger.log('ClickHouse client closed.');
    }
    this.available = false;
    this.metrics?.clickHouseAvailable.set(0);
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
