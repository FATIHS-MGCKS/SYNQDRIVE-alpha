import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';

/**
 * ClickHouseSchemaService
 *
 * Applies the initial DDL schema after all modules have initialised.
 * All statements are idempotent (CREATE IF NOT EXISTS) — safe to run on every
 * application start, including restarts and rolling deployments.
 *
 * Uses OnApplicationBootstrap (not OnModuleInit) so that ClickHouseService
 * has already completed its async ping/connect before this runs.
 *
 * SQL is inlined to avoid file-path issues between src/ and dist/ in watch mode.
 */

const INITIAL_SCHEMA_DDL = `
CREATE DATABASE IF NOT EXISTS synqdrive;

CREATE TABLE IF NOT EXISTS synqdrive.telemetry_snapshots (
    vehicle_id        String,
    token_id          UInt32,
    recorded_at       DateTime64(3, 'UTC'),
    is_ignition_on    Nullable(UInt8),
    speed_kmh         Nullable(Float32),
    odometer_km       Nullable(Float64),
    latitude          Nullable(Float64),
    longitude         Nullable(Float64),
    engine_load       Nullable(Float32),
    fuel_absolute     Nullable(Float32),
    ev_soc            Nullable(Float32),
    traction_kw       Nullable(Float32)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(recorded_at)
ORDER BY (vehicle_id, recorded_at)
TTL recorded_at + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS synqdrive.telemetry_state_changes (
    vehicle_id    String,
    changed_at    DateTime64(3, 'UTC'),
    signal_name   LowCardinality(String),
    old_value     Nullable(Int8),
    new_value     Nullable(Int8)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(changed_at)
ORDER BY (vehicle_id, signal_name, changed_at)
TTL changed_at + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS synqdrive.telemetry_waypoints (
    vehicle_id    String,
    recorded_at   DateTime64(3, 'UTC'),
    latitude      Float64,
    longitude     Float64,
    speed_kmh     Nullable(Float32),
    odometer_km   Nullable(Float64),
    trip_id       Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(recorded_at)
ORDER BY (vehicle_id, recorded_at)
TTL recorded_at + INTERVAL 6 MONTH
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS synqdrive.trip_activity_windows (
    vehicle_id          String,
    window_start        DateTime64(3, 'UTC'),
    window_end          DateTime64(3, 'UTC'),
    point_count         UInt32,
    max_speed_kmh       Nullable(Float32),
    odometer_delta_km   Nullable(Float64),
    has_activity        UInt8,
    computed_at         DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(window_start)
ORDER BY (vehicle_id, window_start, window_end)
TTL window_start + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS synqdrive.trip_segment_candidates (
    vehicle_id      String,
    segment_start   DateTime64(3, 'UTC'),
    segment_end     DateTime64(3, 'UTC'),
    duration_ms     UInt32,
    confidence      LowCardinality(String),
    repair_tier     LowCardinality(String),
    trip_id         Nullable(String),
    computed_at     DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(segment_start)
ORDER BY (vehicle_id, segment_start)
TTL segment_start + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;
`;

@Injectable()
export class ClickHouseSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClickHouseSchemaService.name);

  constructor(private readonly ch: ClickHouseService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.ch.isAvailable) {
      this.logger.debug('ClickHouse not available — skipping schema init.');
      return;
    }

    try {
      await this.applyDdl();
    } catch (err: unknown) {
      this.logger.warn(
        `ClickHouse schema init failed: ${(err as Error).message}. Analytics layer may be degraded.`,
      );
    }
  }

  private async applyDdl(): Promise<void> {
    const statements = INITIAL_SCHEMA_DDL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    // Use an admin client on the `default` database so that CREATE DATABASE
    // and CREATE TABLE IF NOT EXISTS synqdrive.* succeed even before the
    // `synqdrive` database exists on the server.
    const adminClient = this.ch.createAdminClient();
    let applied = 0;

    try {
      for (const statement of statements) {
        try {
          await adminClient.command({ query: statement });
          applied++;
        } catch (err: unknown) {
          const msg = (err as Error).message ?? '';
          if (!msg.toLowerCase().includes('already exists')) {
            this.logger.warn(`DDL failed: ${msg.slice(0, 200)}`);
          }
        }
      }
    } finally {
      await adminClient.close();
    }

    this.logger.log(`ClickHouse schema initialised (${applied} statements applied).`);
  }
}
