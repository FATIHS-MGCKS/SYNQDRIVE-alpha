import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { TripMetricsService } from '../observability/trip-metrics.service';
import type { TelemetryWaypointRow } from './clickhouse-waypoints.types';

const WAYPOINTS_TABLE = 'telemetry_waypoints';

/**
 * ClickHouseWaypointsService
 *
 * Best-effort ingestion for the post-trip route waypoint mirror
 * (`telemetry_waypoints`). Never throws to callers.
 */
@Injectable()
export class ClickHouseWaypointsService {
  private readonly logger = new Logger(ClickHouseWaypointsService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async hasTripWaypoints(vehicleId: string, tripId: string): Promise<boolean> {
    if (!this.ch.isAvailable) return false;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${WAYPOINTS_TABLE}
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
      this.logger.warn(`hasTripWaypoints failed: ${(err as Error).message}`);
      return false;
    }
  }

  async insertWaypoints(points: TelemetryWaypointRow[]): Promise<void> {
    if (!points || points.length === 0) return;

    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: WAYPOINTS_TABLE,
        result: 'skipped_unavailable',
      });
      return;
    }

    const rows = points.map((p) => ({
      org_id: p.orgId,
      vehicle_id: p.vehicleId,
      token_id: p.tokenId,
      source: p.source,
      provider: p.provider,
      trip_id: p.tripId,
      booking_id: p.bookingId ?? null,
      recorded_at: p.recordedAt.getTime(),
      latitude: p.latitude,
      longitude: p.longitude,
      speed_kmh: p.speedKmh ?? null,
      odometer_km: p.odometerKm ?? null,
      quality: p.quality,
    }));

    try {
      await this.ch.getClient().insert({
        table: WAYPOINTS_TABLE,
        values: rows,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: WAYPOINTS_TABLE,
        result: 'success',
      });
      const latestMs = Math.max(...points.map((p) => p.recordedAt.getTime()));
      if (Number.isFinite(latestMs)) {
        this.metrics?.clickHouseLastMirrorUnixSeconds.set(
          { table: WAYPOINTS_TABLE },
          latestMs / 1000,
        );
      }
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: WAYPOINTS_TABLE,
        result: 'error',
      });
      this.logger.warn(`insertWaypoints failed: ${(err as Error).message}`);
    }
  }
}
