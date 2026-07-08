import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import type { IgnitionSegmentFinding } from '../vehicle-intelligence/trips/detectors/ignition-segment.detector';
import type { MotionSegmentFinding } from '../vehicle-intelligence/trips/detectors/motion-segment.detector';
import { TripMetricsService } from '../observability/trip-metrics.service';

// Minimum segment duration per signal type.
// Ignition segments: 60s — short ICE on/off cycles (e.g. starting for pickup) are real trips.
// Motion segments:   30s — short EV hops (e.g. parking reposition, courier deliveries) are real trips.
// Lowering these from the old 2-minute global filter unblocks Tesla + micro-trip detection
// which previously failed the 2-minute floor entirely.
const MIN_IGNITION_SEGMENT_DURATION_MS = 60_000;
const MIN_MOTION_SEGMENT_DURATION_MS = 30_000;

function toClickHouseDateTime64Param(value: Date): string {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}

function parseClickHouseUtcDateTime(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  return new Date(value.replace(' ', 'T') + 'Z');
}

/**
 * Normalizes a ClickHouse min_time/max_time value into an ISO string, mapping
 * the epoch/zero sentinel (empty parts or non-time partitions) to null.
 */
function normalizeStorageTimestamp(value: string | null | undefined): string | null {
  const parsed = parseClickHouseUtcDateTime(value);
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.getTime() <= 0) {
    return null;
  }
  return parsed.toISOString();
}

export interface ClickHouseTableStorageStat {
  table: string;
  rowCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  oldestRecordAt: string | null;
  newestRecordAt: string | null;
}

export interface ClickHouseStorageStats {
  tableCount: number;
  totalRows: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
  tables: ClickHouseTableStorageStat[];
}

/**
 * ClickHouseAnalyticsService
 *
 * Query layer for analytical detectors. Returns structured domain objects,
 * not raw ClickHouse rows. All methods degrade gracefully when unavailable.
 */
@Injectable()
export class ClickHouseAnalyticsService {
  private readonly logger = new Logger(ClickHouseAnalyticsService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  /**
   * Finds ignition ON→OFF segments within a time window.
   * Used by IgnitionSegmentDetector to identify trip candidates for repair.
   */
  async findIgnitionSegments(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<IgnitionSegmentFinding[]> {
    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'find_ignition_segments',
        result: 'skipped_unavailable',
      });
      throw new Error('ClickHouse is not available');
    }
    const client = this.ch.getClient();

    const sql = `
      SELECT
        on_time,
        off_time,
        dateDiff('millisecond', on_time, off_time) AS duration_ms
      FROM (
        SELECT
          changed_at                                                 AS on_time,
          leadInFrame(changed_at) OVER (
            PARTITION BY vehicle_id ORDER BY changed_at
            ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
          )                                                          AS off_time,
          new_value
        FROM telemetry_state_changes
        WHERE vehicle_id = {vehicleId: String}
          AND signal_name = 'ignition'
          AND changed_at >= parseDateTime64BestEffort({from: String})
          AND changed_at <= parseDateTime64BestEffort({to: String})
      )
      WHERE new_value = 1
        AND off_time IS NOT NULL
        AND dateDiff('millisecond', on_time, off_time) >= {minDurationMs: Int64}
      ORDER BY on_time
    `;

    try {
      const result = await client.query({
        query: sql,
        query_params: {
          vehicleId,
          from: toClickHouseDateTime64Param(from),
          to: toClickHouseDateTime64Param(to),
          minDurationMs: MIN_IGNITION_SEGMENT_DURATION_MS,
        },
        format: 'JSONEachRow',
      });

      const rows = await result.json<{
        on_time: string;
        off_time: string;
        duration_ms: number;
      }>();
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'find_ignition_segments',
        result: 'success',
      });

      return rows.map((r) => {
        const durationMs = r.duration_ms;
        return {
          segmentStart: parseClickHouseUtcDateTime(r.on_time)!,
          segmentEnd: parseClickHouseUtcDateTime(r.off_time)!,
          durationMs,
          confidence:
            durationMs >= 15 * 60_000
              ? 'HIGH'
              : durationMs >= 5 * 60_000
                ? 'MEDIUM'
                : 'LOW',
        } satisfies IgnitionSegmentFinding;
      });
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'find_ignition_segments',
        result: 'error',
      });
      throw err;
    }
  }

  /**
   * Finds motion start→stop segments within a time window.
   * The EV-friendly counterpart to findIgnitionSegments: uses speed-based
   * motion transitions (signal_name = 'motion') which are recorded even
   * when isIgnitionOn is always null (e.g. Tesla via DIMO).
   */
  async findMotionSegments(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<MotionSegmentFinding[]> {
    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'find_motion_segments',
        result: 'skipped_unavailable',
      });
      throw new Error('ClickHouse is not available');
    }
    const client = this.ch.getClient();

    const sql = `
      SELECT
        on_time,
        off_time,
        dateDiff('millisecond', on_time, off_time) AS duration_ms
      FROM (
        SELECT
          changed_at                                                 AS on_time,
          leadInFrame(changed_at) OVER (
            PARTITION BY vehicle_id ORDER BY changed_at
            ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
          )                                                          AS off_time,
          new_value
        FROM telemetry_state_changes
        WHERE vehicle_id = {vehicleId: String}
          AND signal_name = 'motion'
          AND changed_at >= parseDateTime64BestEffort({from: String})
          AND changed_at <= parseDateTime64BestEffort({to: String})
      )
      WHERE new_value = 1
        AND off_time IS NOT NULL
        AND dateDiff('millisecond', on_time, off_time) >= {minDurationMs: Int64}
      ORDER BY on_time
    `;

    try {
      const result = await client.query({
        query: sql,
        query_params: {
          vehicleId,
          from: toClickHouseDateTime64Param(from),
          to: toClickHouseDateTime64Param(to),
          minDurationMs: MIN_MOTION_SEGMENT_DURATION_MS,
        },
        format: 'JSONEachRow',
      });

      const rows = await result.json<{
        on_time: string;
        off_time: string;
        duration_ms: number;
      }>();
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'find_motion_segments',
        result: 'success',
      });

      return rows.map((r) => {
        const durationMs = r.duration_ms;
        return {
          segmentStart: parseClickHouseUtcDateTime(r.on_time)!,
          segmentEnd: parseClickHouseUtcDateTime(r.off_time)!,
          durationMs,
          confidence:
            durationMs >= 15 * 60_000
              ? 'HIGH'
              : durationMs >= 5 * 60_000
                ? 'MEDIUM'
                : 'LOW',
        } satisfies MotionSegmentFinding;
      });
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'find_motion_segments',
        result: 'error',
      });
      throw err;
    }
  }

  /**
   * Fetches snapshot samples in a time window for activity-window derivation.
   * Best-effort — returns [] when ClickHouse is unavailable or the query fails.
   */
  async fetchSnapshotsInWindow(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      recordedAt: Date;
      speedKmh: number | null;
      isIgnitionOn: boolean | null;
      odometerKm: number | null;
    }>
  > {
    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'fetch_snapshots_in_window',
        result: 'skipped_unavailable',
      });
      return [];
    }

    const client = this.ch.getClient();
    const sql = `
      SELECT
        recorded_at,
        speed_kmh,
        is_ignition_on,
        odometer_km
      FROM telemetry_snapshots
      WHERE vehicle_id = {vehicleId: String}
        AND recorded_at >= parseDateTime64BestEffort({from: String})
        AND recorded_at <= parseDateTime64BestEffort({to: String})
      ORDER BY recorded_at
    `;

    try {
      const result = await client.query({
        query: sql,
        query_params: {
          vehicleId,
          from: toClickHouseDateTime64Param(from),
          to: toClickHouseDateTime64Param(to),
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 15 },
      });

      const rows = await result.json<{
        recorded_at: string;
        speed_kmh: number | null;
        is_ignition_on: number | null;
        odometer_km: number | null;
      }>();
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'fetch_snapshots_in_window',
        result: 'success',
      });

      return rows.map((r) => ({
        recordedAt: parseClickHouseUtcDateTime(r.recorded_at)!,
        speedKmh: r.speed_kmh,
        isIgnitionOn:
          r.is_ignition_on == null ? null : r.is_ignition_on === 1,
        odometerKm: r.odometer_km,
      }));
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'fetch_snapshots_in_window',
        result: 'error',
      });
      this.logger.warn(
        `fetchSnapshotsInWindow failed: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Summarizes activity (speed/odometer) in a time window.
   * Used by ActivityWindowDetector.
   */
  async summarizeActivityWindow(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<{ pointCount: number; maxSpeedKmh: number; odometerDeltaKm: number }> {
    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'summarize_activity_window',
        result: 'skipped_unavailable',
      });
      throw new Error('ClickHouse is not available');
    }
    const client = this.ch.getClient();

    const sql = `
      SELECT
        count()                                    AS point_count,
        max(speed_kmh)                             AS max_speed_kmh,
        max(odometer_km) - min(odometer_km)        AS odometer_delta_km
      FROM telemetry_snapshots
      WHERE vehicle_id = {vehicleId: String}
        AND recorded_at >= parseDateTime64BestEffort({from: String})
        AND recorded_at <= parseDateTime64BestEffort({to: String})
    `;

    try {
      const result = await client.query({
        query: sql,
        query_params: {
          vehicleId,
          from: toClickHouseDateTime64Param(from),
          to: toClickHouseDateTime64Param(to),
        },
        format: 'JSONEachRow',
      });

      const rows = await result.json<{
        point_count: number;
        max_speed_kmh: number | null;
        odometer_delta_km: number | null;
      }>();
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'summarize_activity_window',
        result: 'success',
      });

      const row = rows[0];
      return {
        pointCount: row?.point_count ?? 0,
        maxSpeedKmh: row?.max_speed_kmh ?? 0,
        odometerDeltaKm: row?.odometer_delta_km ?? 0,
      };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'summarize_activity_window',
        result: 'error',
      });
      throw err;
    }
  }

  async summarizeRecentIngestion(
    since: Date,
  ): Promise<{
    snapshotCount: number;
    stateChangeCount: number;
    latestSnapshotAt: Date | null;
    latestStateChangeAt: Date | null;
  }> {
    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'summarize_recent_ingestion',
        result: 'skipped_unavailable',
      });
      throw new Error('ClickHouse is not available');
    }

    const client = this.ch.getClient();

    try {
      const [snapshotResult, stateChangeResult] = await Promise.all([
        client.query({
          query: `
            SELECT
              count() AS snapshot_count,
              max(recorded_at) AS latest_snapshot_at
            FROM telemetry_snapshots
            WHERE recorded_at >= parseDateTime64BestEffort({since: String})
          `,
          query_params: { since: toClickHouseDateTime64Param(since) },
          format: 'JSONEachRow',
        }),
        client.query({
          query: `
            SELECT
              count() AS state_change_count,
              max(changed_at) AS latest_state_change_at
            FROM telemetry_state_changes
            WHERE changed_at >= parseDateTime64BestEffort({since: String})
          `,
          query_params: { since: toClickHouseDateTime64Param(since) },
          format: 'JSONEachRow',
        }),
      ]);

      const [snapshotRow] = await snapshotResult.json<{
        snapshot_count: number;
        latest_snapshot_at: string | null;
      }>();
      const [stateChangeRow] = await stateChangeResult.json<{
        state_change_count: number;
        latest_state_change_at: string | null;
      }>();

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'summarize_recent_ingestion',
        result: 'success',
      });

      return {
        snapshotCount: snapshotRow?.snapshot_count ?? 0,
        stateChangeCount: stateChangeRow?.state_change_count ?? 0,
        latestSnapshotAt: parseClickHouseUtcDateTime(snapshotRow?.latest_snapshot_at),
        latestStateChangeAt: parseClickHouseUtcDateTime(stateChangeRow?.latest_state_change_at),
      };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'summarize_recent_ingestion',
        result: 'error',
      });
      throw err;
    }
  }

  /**
   * Best-effort storage statistics for the analytics mirror, read entirely from
   * `system.parts` (metadata only — no scan of the data tables, so this stays
   * cheap even on large tables). Row counts and oldest/newest timestamps come
   * from per-part metadata; for the monthly time-partitioned mirror tables
   * `min_time`/`max_time` track the event-time range.
   *
   * Returns null when ClickHouse is unavailable or the query fails — callers
   * (health/readiness, data-analyse) must treat this as optional and never let
   * it slow down or break a request. A short server-side execution cap guards
   * against pathological cases.
   */
  async getStorageStats(): Promise<ClickHouseStorageStats | null> {
    if (!this.ch.isAvailable) {
      return null;
    }

    const client = this.ch.getClient();

    try {
      const result = await client.query({
        query: `
          SELECT
            table                            AS table,
            sum(rows)                        AS row_count,
            sum(data_compressed_bytes)       AS compressed_bytes,
            sum(data_uncompressed_bytes)     AS uncompressed_bytes,
            min(min_time)                    AS oldest_record_at,
            max(max_time)                    AS newest_record_at
          FROM system.parts
          WHERE database = {db: String} AND active
          GROUP BY table
          ORDER BY table
        `,
        query_params: { db: this.ch.databaseName },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 5 },
      });

      const rows = await result.json<{
        table: string;
        row_count: number;
        compressed_bytes: number;
        uncompressed_bytes: number;
        oldest_record_at: string | null;
        newest_record_at: string | null;
      }>();

      const tables: ClickHouseTableStorageStat[] = rows.map((r) => ({
        table: r.table,
        rowCount: Number(r.row_count ?? 0),
        compressedBytes: Number(r.compressed_bytes ?? 0),
        uncompressedBytes: Number(r.uncompressed_bytes ?? 0),
        oldestRecordAt: normalizeStorageTimestamp(r.oldest_record_at),
        newestRecordAt: normalizeStorageTimestamp(r.newest_record_at),
      }));

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'storage_stats',
        result: 'success',
      });

      return {
        tableCount: tables.length,
        totalRows: tables.reduce((acc, t) => acc + t.rowCount, 0),
        totalCompressedBytes: tables.reduce(
          (acc, t) => acc + t.compressedBytes,
          0,
        ),
        totalUncompressedBytes: tables.reduce(
          (acc, t) => acc + t.uncompressedBytes,
          0,
        ),
        tables,
      };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'storage_stats',
        result: 'error',
      });
      this.logger.warn(
        `ClickHouse storage stats query failed (best-effort): ${(err as Error).message}`,
      );
      return null;
    }
  }
}
