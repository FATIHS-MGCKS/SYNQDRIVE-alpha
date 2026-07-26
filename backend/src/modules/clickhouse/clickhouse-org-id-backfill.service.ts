import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseService } from './clickhouse.service';

const LEGACY_ORG_TABLES = [
  'telemetry_snapshots',
  'telemetry_state_changes',
  'trip_segment_candidates',
  // These gained org_id in migrations 004-006, but rows written before their
  // producers populated it stay unattributed and therefore invisible to
  // org-scoped analytics reads.
  'telemetry_waypoints',
  'trip_activity_windows',
] as const;

/**
 * Backfills org_id on legacy ClickHouse mirror tables from PostgreSQL vehicles.
 * Triggered once after migration 007 applies (P1-T1).
 */
@Injectable()
export class ClickHouseOrgIdBackfillService {
  private readonly logger = new Logger(ClickHouseOrgIdBackfillService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async runAfterMigration007(): Promise<void> {
    if (!this.ch.isAvailable || !this.prisma) {
      return;
    }
    if (process.env.CLICKHOUSE_ORG_BACKFILL_ENABLED !== 'true') {
      this.logger.debug('org_id backfill skipped (CLICKHOUSE_ORG_BACKFILL_ENABLED!=true)');
      return;
    }

    void this.runBatchedBackfill().catch((err: unknown) => {
      this.logger.warn(
        `org_id backfill failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async runBatchedBackfill(): Promise<{ vehiclesProcessed: number; mutations: number }> {
    const batchSize = Number(process.env.CLICKHOUSE_ORG_BACKFILL_BATCH_SIZE ?? 100);
    let cursor: string | undefined;
    let vehiclesProcessed = 0;
    let mutations = 0;

    for (;;) {
      const vehicles = await this.prisma!.vehicle.findMany({
        select: { id: true, organizationId: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (vehicles.length === 0) break;

      for (const v of vehicles) {
        if (!v.organizationId) continue;
        for (const table of LEGACY_ORG_TABLES) {
          try {
            await this.ch.getClient().command({
              query: `
                ALTER TABLE ${this.ch.databaseName}.${table}
                UPDATE org_id = {orgId: String}
                WHERE vehicle_id = {vehicleId: String} AND org_id = ''
              `,
              query_params: { orgId: v.organizationId, vehicleId: v.id },
              clickhouse_settings: { mutations_sync: '0' },
            });
            mutations += 1;
          } catch (err: unknown) {
            this.logger.warn(
              `org_id mutation skipped ${table}/${v.id}: ${(err as Error).message}`,
            );
          }
        }
        vehiclesProcessed += 1;
      }

      cursor = vehicles[vehicles.length - 1]?.id;
      if (vehicles.length < batchSize) break;
    }

    this.logger.log(
      `org_id backfill scheduled mutations=${mutations} vehicles=${vehiclesProcessed}`,
    );
    return { vehiclesProcessed, mutations };
  }
}
