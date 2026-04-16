import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '../../modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';

/**
 * TripReconciliationScheduler
 *
 * Tiered periodic reconciliation jobs. Replaces reliance on the manual
 * "Sync Trips" button as a primary operational safeguard.
 *
 * TIER STRATEGY:
 *  - Fast  (15 min):  last 45 minutes, only recently-active vehicles
 *  - Warm  (4 hours): last 12 hours, all vehicles with DIMO tokens
 *  - Cold  (daily):   last 7 days, all vehicles — comprehensive safety net
 */
@Injectable()
export class TripReconciliationScheduler {
  private readonly logger = new Logger(TripReconciliationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: TripReconciliationService,
  ) {}

  // ─── FAST REPAIR (every 15 minutes) ───────────────────────────────────────

  @Interval(15 * 60_000)
  async fastRepair(): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - 45 * 60_000);

    // Only vehicles with recent snapshot activity (active vehicles).
    // providerFetchedAt reflects when we polled DIMO; lastSeenAt reflects DIMO's
    // provider timestamp which can lag wall clock (esp. Tesla). We consider a
    // vehicle "recently active" if either signal is within the last hour.
    const recencyThreshold = new Date(to.getTime() - 60 * 60_000);
    const recentActive = await this.prisma.vehicleLatestState.findMany({
      where: {
        OR: [
          { lastSeenAt: { gte: recencyThreshold } },
          { providerFetchedAt: { gte: recencyThreshold } },
        ],
      },
      select: { vehicleId: true },
    });

    for (const { vehicleId } of recentActive) {
      try {
        const result = await this.reconciliation.reconcileWindow(
          vehicleId,
          from,
          to,
          'fast',
          { useDimoSegmentFallback: true },
        );
        if (result.repairsApplied > 0 || result.repairsProposed > 0) {
          this.logger.log(
            `Fast repair [${vehicleId}]: proposed=${result.repairsProposed} applied=${result.repairsApplied}`,
          );
        }
      } catch (err: unknown) {
        this.logger.warn(`Fast repair failed for ${vehicleId}: ${(err as Error).message}`);
      }
    }
  }

  // ─── WARM REPAIR (every 4 hours) ──────────────────────────────────────────

  @Interval(4 * 3600_000)
  async warmRepair(): Promise<void> {
    this.logger.log('Warm reconciliation starting…');
    const to = new Date();
    const from = new Date(to.getTime() - 12 * 3600_000);

    const vehicles = await this.getVehiclesWithDimoTokens();
    let repaired = 0;

    for (const vehicleId of vehicles) {
      try {
        const result = await this.reconciliation.reconcileWindow(
          vehicleId,
          from,
          to,
          'warm',
          { useDimoSegmentFallback: true },
        );
        repaired += result.repairsApplied;
      } catch (err: unknown) {
        this.logger.warn(`Warm repair failed for ${vehicleId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Warm reconciliation complete — ${repaired} trip(s) repaired across ${vehicles.length} vehicles.`);
  }

  // ─── COLD REPAIR (daily at 03:00) ─────────────────────────────────────────

  @Cron('0 3 * * *')
  async coldRepair(): Promise<void> {
    this.logger.log('Cold reconciliation starting…');
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 3600_000);

    const vehicles = await this.getVehiclesWithDimoTokens();
    let repaired = 0;

    for (const vehicleId of vehicles) {
      try {
        const result = await this.reconciliation.reconcileWindow(
          vehicleId,
          from,
          to,
          'cold',
          { useDimoSegmentFallback: true },
        );
        repaired += result.repairsApplied;
      } catch (err: unknown) {
        this.logger.warn(`Cold repair failed for ${vehicleId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Cold reconciliation complete — ${repaired} trip(s) repaired across ${vehicles.length} vehicles.`);
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private async getVehiclesWithDimoTokens(): Promise<string[]> {
    const rows = await this.prisma.vehicleLatestState.findMany({
      where: { dimoTokenId: { not: null } },
      select: { vehicleId: true },
    });
    return rows.map((r) => r.vehicleId);
  }
}
