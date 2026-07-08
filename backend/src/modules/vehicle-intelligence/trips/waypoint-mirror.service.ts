import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseWaypointsService } from '@modules/clickhouse/clickhouse-waypoints.service';
import type { TelemetryWaypointRow } from '@modules/clickhouse/clickhouse-waypoints.types';
import { downsampleWaypoints } from './waypoint-downsample';

const DOWNSAMPLE_INTERVAL_MS = 30_000;

/**
 * WaypointMirrorService
 *
 * Post-trip mirror of PostgreSQL `vehicle_trip_waypoints` into ClickHouse
 * `telemetry_waypoints` for route replay / reconciliation evidence.
 *
 * SAFETY:
 *   - Disabled by default (`WAYPOINT_MIRROR_ENABLED=true` to activate).
 *   - Only mirrors finalized trip waypoints from PG — never live-map floods.
 *   - 30s downsample when PG holds denser route points.
 *   - Idempotent per trip (skips when CH already has rows for trip_id).
 *   - Never throws into callers.
 */
@Injectable()
export class WaypointMirrorService {
  private readonly logger = new Logger(WaypointMirrorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickHouseWaypoints: ClickHouseWaypointsService,
  ) {}

  get isEnabled(): boolean {
    return process.env.WAYPOINT_MIRROR_ENABLED === 'true';
  }

  async mirrorTripWaypoints(params: {
    orgId: string | null | undefined;
    vehicleId: string;
    tokenId: number;
    tripId: string;
    bookingId?: string | null;
    source?: string;
    provider?: string;
  }): Promise<{
    mirrored: boolean;
    pointsInserted: number;
    reason?: string;
  }> {
    const noop = (reason: string) => ({
      mirrored: false,
      pointsInserted: 0,
      reason,
    });

    try {
      if (!this.isEnabled) return noop('disabled');
      if (!params.orgId) return noop('no_org');

      const pgWaypoints = await this.prisma.vehicleTripWaypoint.findMany({
        where: { tripId: params.tripId },
        orderBy: { recordedAt: 'asc' },
        select: {
          latitude: true,
          longitude: true,
          speedKmh: true,
          recordedAt: true,
        },
      });

      if (pgWaypoints.length === 0) return noop('no_waypoints');

      const alreadyMirrored = await this.clickHouseWaypoints.hasTripWaypoints(
        params.vehicleId,
        params.tripId,
      );
      if (alreadyMirrored) return noop('already_mirrored');

      const downsampled = downsampleWaypoints(pgWaypoints, DOWNSAMPLE_INTERVAL_MS);
      const quality =
        downsampled.length < pgWaypoints.length ? 'downsampled' : 'normalized';

      const source = params.source ?? 'dimo';
      const provider = params.provider ?? 'dimo';
      const rows: TelemetryWaypointRow[] = downsampled.map((w) => ({
        orgId: params.orgId!,
        vehicleId: params.vehicleId,
        tokenId: params.tokenId,
        source,
        provider,
        tripId: params.tripId,
        bookingId: params.bookingId ?? null,
        recordedAt: w.recordedAt,
        latitude: w.latitude,
        longitude: w.longitude,
        speedKmh: w.speedKmh,
        quality,
      }));

      await this.clickHouseWaypoints.insertWaypoints(rows);
      return { mirrored: true, pointsInserted: rows.length };
    } catch (err: unknown) {
      this.logger.warn(
        `mirrorTripWaypoints failed for trip ${params.tripId}: ${(err as Error).message}`,
      );
      return noop('error');
    }
  }
}
