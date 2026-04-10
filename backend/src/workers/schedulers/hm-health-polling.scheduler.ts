import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { HmSignalUsageService, HmSignalGroupKey } from '../../modules/high-mobility/high-mobility-signal-usage.service';

/**
 * HM Health Polling Scheduler
 *
 * Polls High Mobility health signals conservatively per signal group cadence:
 *   - SERVICE group:       3x/day — at ~00:00, ~12:00, ~18:00 UTC
 *   - TIRE_PRESSURE group: every 4 hours (6x/day)
 *   - AI_HEALTH_CARE group: every 4 hours (6x/day)
 *
 * Runs a check every 5 minutes; uses lastSuccessAt timestamps to enforce cadence.
 * Only polls vehicles with an active HM_HEALTH data source link.
 *
 * Architecture note: isolated from all business logic — only orchestrates fetches.
 * Never writes to authoritative health engines; delegates entirely to HmSignalUsageService.
 */
@Injectable()
export class HmHealthPollingScheduler {
  private readonly logger = new Logger(HmHealthPollingScheduler.name);

  // Minimum intervals (ms) between fetches per group
  private readonly SERVICE_MIN_INTERVAL_MS = 5 * 60 * 60 * 1000;  // 5 hours
  private readonly PERIODIC_MIN_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

  // Service group target hours (UTC) — poll within 10-minute windows
  private readonly SERVICE_TARGET_HOURS = [0, 12, 18];

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalUsageService: HmSignalUsageService,
  ) {}

  /** Runs every 5 minutes — checks which groups need polling */
  @Interval(5 * 60 * 1000)
  async pollHmHealthSignals(): Promise<void> {
    // Get all vehicles with active HM_HEALTH links
    const activeLinks = await this.prisma.vehicleDataSourceLink.findMany({
      where: {
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
      select: { vehicleId: true, sourceReferenceId: true },
      distinct: ['vehicleId'],
    });

    if (activeLinks.length === 0) return;

    const now = new Date();
    const nowHourUtc = now.getUTCHours();
    const nowMinute = now.getUTCMinutes();

    // Check if we're within a SERVICE polling window (first 10 minutes of target hours)
    const isServiceWindow = this.SERVICE_TARGET_HOURS.some(
      h => nowHourUtc === h && nowMinute < 10
    );

    let serviceCount = 0;
    let tireCount = 0;
    let aiCount = 0;

    for (const link of activeLinks) {
      const vehicleId = link.vehicleId;

      // SERVICE group — 3x/day
      if (isServiceWindow) {
        const shouldFetch = await this.shouldFetchGroup(vehicleId, 'SERVICE', this.SERVICE_MIN_INTERVAL_MS);
        if (shouldFetch) {
          await this.safeRefresh(vehicleId, 'SERVICE');
          serviceCount++;
        }
      }

      // TIRE_PRESSURE — every 4 hours
      const shouldFetchTire = await this.shouldFetchGroup(vehicleId, 'TIRE_PRESSURE', this.PERIODIC_MIN_INTERVAL_MS);
      if (shouldFetchTire) {
        await this.safeRefresh(vehicleId, 'TIRE_PRESSURE');
        tireCount++;
      }

      // AI_HEALTH_CARE — every 4 hours
      const shouldFetchAi = await this.shouldFetchGroup(vehicleId, 'AI_HEALTH_CARE', this.PERIODIC_MIN_INTERVAL_MS);
      if (shouldFetchAi) {
        await this.safeRefresh(vehicleId, 'AI_HEALTH_CARE');
        aiCount++;
      }
    }

    if (serviceCount + tireCount + aiCount > 0) {
      this.logger.log(
        `HM polling cycle: SERVICE=${serviceCount}, TIRE_PRESSURE=${tireCount}, AI_HEALTH_CARE=${aiCount} vehicles`
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async shouldFetchGroup(
    vehicleId: string,
    group: HmSignalGroupKey,
    minIntervalMs: number,
  ): Promise<boolean> {
    const state = await this.prisma.hmSignalGroupState.findFirst({
      where: { vehicleId, signalGroup: group as any },
      select: { lastSuccessAt: true },
    });

    if (!state?.lastSuccessAt) return true; // Never fetched — fetch now

    const elapsed = Date.now() - state.lastSuccessAt.getTime();
    return elapsed >= minIntervalMs;
  }

  private async safeRefresh(vehicleId: string, group: HmSignalGroupKey): Promise<void> {
    try {
      await this.signalUsageService.refreshSignalGroup(vehicleId, group);
    } catch (err: any) {
      this.logger.warn(`HM polling error for vehicle ${vehicleId} [${group}]: ${err?.message}`);
    }
  }
}
