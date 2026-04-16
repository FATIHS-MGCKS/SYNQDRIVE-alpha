import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import type { IgnitionSegmentFinding } from '../vehicle-intelligence/trips/detectors/ignition-segment.detector';
import type { MotionSegmentFinding } from '../vehicle-intelligence/trips/detectors/motion-segment.detector';
import { TripMetricsService } from '../observability/trip-metrics.service';

const MIN_SEGMENT_DURATION_MS = 2 * 60_000; // 2 min minimum trip candidate

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
          minDurationMs: MIN_SEGMENT_DURATION_MS,
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
          minDurationMs: MIN_SEGMENT_DURATION_MS,
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
}
