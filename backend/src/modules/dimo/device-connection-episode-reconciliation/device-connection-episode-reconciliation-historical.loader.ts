import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoPollJobType } from '@prisma/client';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import type { ReconciliationVehicleHistoricalSources } from './device-connection-episode-reconciliation-historical.types';

const SNAPSHOTS_TABLE = 'telemetry_snapshots';

@Injectable()
export class DeviceConnectionEpisodeReconciliationHistoricalLoader {
  private readonly logger = new Logger(DeviceConnectionEpisodeReconciliationHistoricalLoader.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clickHouse?: ClickHouseService,
  ) {}

  async loadVehicleSources(input: {
    organizationId: string;
    vehicleId: string;
    windowStart: Date;
    windowEnd: Date;
    episodeIds?: string[];
  }): Promise<ReconciliationVehicleHistoricalSources> {
    const [pollLogs, telemetryObservations, resolutionAudits, latestState, clickhouseSnapshots] =
      await Promise.all([
        this.prisma.dimoPollLog.findMany({
          where: {
            vehicleId: input.vehicleId,
            jobType: DimoPollJobType.SNAPSHOT,
            startedAt: { gte: input.windowStart, lte: input.windowEnd },
          },
          select: {
            id: true,
            startedAt: true,
            finishedAt: true,
            status: true,
          },
          orderBy: { startedAt: 'asc' },
        }),
        input.episodeIds && input.episodeIds.length > 0
          ? this.prisma.deviceConnectionTelemetryRecoveryObservation.findMany({
              where: {
                vehicleId: input.vehicleId,
                organizationId: input.organizationId,
                episodeId: { in: input.episodeIds },
                providerObservedAt: { gte: input.windowStart, lte: input.windowEnd },
              },
              select: {
                providerObservedAt: true,
                receivedAt: true,
                hasOperationalSignal: true,
                connectionStatusActive: true,
                providerBindingId: true,
                snapshotReferenceId: true,
              },
              orderBy: { providerObservedAt: 'asc' },
            })
          : Promise.resolve([]),
        input.episodeIds && input.episodeIds.length > 0
          ? this.prisma.deviceConnectionEpisodeResolutionAudit.findMany({
              where: {
                vehicleId: input.vehicleId,
                organizationId: input.organizationId,
                episodeId: { in: input.episodeIds },
                providerObservedAt: { gte: input.windowStart, lte: input.windowEnd },
              },
              select: {
                providerObservedAt: true,
                receivedAt: true,
                resolutionSnapshotId: true,
                resolutionMethod: true,
                metadata: true,
              },
              orderBy: { providerObservedAt: 'asc' },
            })
          : Promise.resolve([]),
        this.prisma.vehicleLatestState.findUnique({
          where: { vehicleId: input.vehicleId },
          select: {
            lastSeenAt: true,
            sourceTimestamp: true,
            providerFetchedAt: true,
            providerBindingId: true,
            rawPayloadJson: true,
            dimoTokenId: true,
            updatedAt: true,
          },
        }),
        this.loadClickHouseSnapshots(input.vehicleId, input.windowStart, input.windowEnd),
      ]);

    const raw = latestState?.rawPayloadJson as Record<string, unknown> | null | undefined;
    const conn = extractConnectivitySnapshot(raw ?? undefined);
    const link = latestState?.providerBindingId
      ? await this.prisma.vehicleDataSourceLink.findUnique({
          where: { id: latestState.providerBindingId },
          select: { sourceSubtype: true },
        })
      : null;

    return {
      pollLogs,
      telemetryObservations,
      resolutionAudits,
      clickhouseSnapshots,
      latestStateFallback: latestState
        ? {
            providerObservedAt: latestState.lastSeenAt,
            receivedAt: latestState.providerFetchedAt,
            processedAt: latestState.updatedAt,
            sourceTimestamp: latestState.sourceTimestamp,
            providerFetchedAt: latestState.providerFetchedAt,
            providerBindingId: latestState.providerBindingId,
            sourceSubtype: link?.sourceSubtype ?? null,
            obdIsPluggedIn: conn.obdIsPluggedIn,
            dimoTokenId: latestState.dimoTokenId,
          }
        : null,
    };
  }

  private async loadClickHouseSnapshots(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ recordedAt: Date; hasOperationalSignal: boolean }>> {
    if (!this.clickHouse?.isAvailable) return [];

    try {
      const result = await this.clickHouse.getClient().query({
        query: `
          SELECT
            recorded_at,
            speed_kmh,
            latitude,
            longitude,
            odometer_km
          FROM ${SNAPSHOTS_TABLE}
          WHERE vehicle_id = {vehicleId:String}
            AND recorded_at >= parseDateTime64BestEffort({from:String})
            AND recorded_at <= parseDateTime64BestEffort({to:String})
          ORDER BY recorded_at ASC
        `,
        query_params: {
          vehicleId,
          from: from.toISOString(),
          to: to.toISOString(),
        },
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as Array<{
        recorded_at: string;
        speed_kmh: number | null;
        latitude: number | null;
        longitude: number | null;
        odometer_km: number | null;
      }>;

      return rows.map((row) => ({
        recordedAt: new Date(row.recorded_at),
        hasOperationalSignal:
          row.speed_kmh != null ||
          (row.latitude != null && row.longitude != null) ||
          row.odometer_km != null,
      }));
    } catch (err) {
      this.logger.warn(
        `ClickHouse snapshot history skipped for ${vehicleId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }
}
