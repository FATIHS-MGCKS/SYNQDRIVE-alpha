import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { TripMetricsService } from '../observability/trip-metrics.service';
import type { TripActivityWindowRow } from './clickhouse-activity-windows.types';

const ACTIVITY_WINDOWS_TABLE = 'trip_activity_windows';

/**
 * ClickHouseActivityWindowsService
 *
 * Best-effort ingestion for analytical trip activity evidence windows.
 * ReplacingMergeTree keyed by (vehicle_id, window_start, window_end) — safe to
 * re-insert on re-finalize.
 */
@Injectable()
export class ClickHouseActivityWindowsService {
  private readonly logger = new Logger(ClickHouseActivityWindowsService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async hasTripActivityWindows(vehicleId: string, tripId: string): Promise<boolean> {
    if (!this.ch.isAvailable) return false;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${ACTIVITY_WINDOWS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
          LIMIT 1
        `,
        query_params: { vehicleId, tripId },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });
      const [row] = await result.json<{ cnt: string | number }>();
      return Number(row?.cnt ?? 0) > 0;
    } catch (err: unknown) {
      this.logger.warn(`hasTripActivityWindows failed: ${(err as Error).message}`);
      return false;
    }
  }

  async insertActivityWindows(windows: TripActivityWindowRow[]): Promise<void> {
    if (!windows || windows.length === 0) return;

    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: ACTIVITY_WINDOWS_TABLE,
        result: 'skipped_unavailable',
      });
      return;
    }

    const rows = windows.map((w) => ({
      org_id: w.orgId,
      vehicle_id: w.vehicleId,
      trip_id: w.tripId,
      booking_id: w.bookingId ?? null,
      activity_type: w.activityType,
      window_start: w.windowStart.getTime(),
      window_end: w.windowEnd.getTime(),
      point_count: w.pointCount,
      max_speed_kmh: w.maxSpeedKmh ?? null,
      odometer_delta_km: w.odometerDeltaKm ?? null,
      has_activity: w.hasActivity ? 1 : 0,
      confidence: w.confidence,
      evidence_source: w.evidenceSource,
      computed_at: Date.now(),
    }));

    try {
      await this.ch.getClient().insert({
        table: ACTIVITY_WINDOWS_TABLE,
        values: rows,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: ACTIVITY_WINDOWS_TABLE,
        result: 'success',
      });
      const latestMs = Math.max(...windows.map((w) => w.windowEnd.getTime()));
      if (Number.isFinite(latestMs)) {
        this.metrics?.clickHouseLastMirrorUnixSeconds.set(
          { table: ACTIVITY_WINDOWS_TABLE },
          latestMs / 1000,
        );
      }
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: ACTIVITY_WINDOWS_TABLE,
        result: 'error',
      });
      this.logger.warn(`insertActivityWindows failed: ${(err as Error).message}`);
    }
  }
}
