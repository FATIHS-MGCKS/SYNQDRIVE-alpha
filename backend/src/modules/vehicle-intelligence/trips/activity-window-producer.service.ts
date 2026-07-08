import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseAnalyticsService } from '@modules/clickhouse/clickhouse-analytics.service';
import { ClickHouseActivityWindowsService } from '@modules/clickhouse/clickhouse-activity-windows.service';
import {
  buildIgnitionActivityWindows,
  buildMovingActivityWindows,
  buildTripSummaryWindow,
  dedupeActivityWindows,
  deriveIdleParkedWindows,
} from './activity-window-derive';

/**
 * ActivityWindowProducerService
 *
 * Post-trip producer for `trip_activity_windows` — analytical evidence for
 * reconciliation / route replay context. NOT canonical trip truth.
 *
 * SAFETY:
 *   - Disabled by default (`ACTIVITY_WINDOW_MIRROR_ENABLED=true`).
 *   - Scoped to finalized trip time windows only.
 *   - ReplacingMergeTree + dedupe keys — safe to re-run.
 *   - Never throws into callers.
 */
@Injectable()
export class ActivityWindowProducerService {
  private readonly logger = new Logger(ActivityWindowProducerService.name);

  constructor(
    private readonly clickHouseActivityWindows: ClickHouseActivityWindowsService,
    @Optional() private readonly chAnalytics?: ClickHouseAnalyticsService,
  ) {}

  get isEnabled(): boolean {
    return process.env.ACTIVITY_WINDOW_MIRROR_ENABLED === 'true';
  }

  async produceForTrip(params: {
    orgId: string | null | undefined;
    vehicleId: string;
    tripId: string;
    bookingId?: string | null;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<{
    produced: boolean;
    windowsInserted: number;
    reason?: string;
  }> {
    const noop = (reason: string) => ({
      produced: false,
      windowsInserted: 0,
      reason,
    });

    try {
      if (!this.isEnabled) return noop('disabled');
      if (!params.orgId) return noop('no_org');
      if (!this.chAnalytics) return noop('analytics_unavailable');

      const ctx = {
        orgId: params.orgId,
        vehicleId: params.vehicleId,
        tripId: params.tripId,
        bookingId: params.bookingId ?? null,
      };

      const [ignitionSegments, motionSegments, summary, snapshots] =
        await Promise.all([
          this.chAnalytics
            .findIgnitionSegments(
              params.vehicleId,
              params.windowStart,
              params.windowEnd,
            )
            .catch(() => []),
          this.chAnalytics
            .findMotionSegments(
              params.vehicleId,
              params.windowStart,
              params.windowEnd,
            )
            .catch(() => []),
          this.chAnalytics
            .summarizeActivityWindow(
              params.vehicleId,
              params.windowStart,
              params.windowEnd,
            )
            .catch(() => null),
          this.chAnalytics.fetchSnapshotsInWindow(
            params.vehicleId,
            params.windowStart,
            params.windowEnd,
          ),
        ]);

      const windows = dedupeActivityWindows([
        ...buildIgnitionActivityWindows(ctx, ignitionSegments),
        ...buildMovingActivityWindows(ctx, motionSegments),
        ...deriveIdleParkedWindows(ctx, snapshots),
        ...(summary
          ? [
              buildTripSummaryWindow(
                {
                  ...ctx,
                  windowStart: params.windowStart,
                  windowEnd: params.windowEnd,
                },
                summary,
              ),
            ]
          : []),
      ]);

      if (windows.length === 0) return noop('no_windows');

      await this.clickHouseActivityWindows.insertActivityWindows(windows);
      return { produced: true, windowsInserted: windows.length };
    } catch (err: unknown) {
      this.logger.warn(
        `produceForTrip failed for trip ${params.tripId}: ${(err as Error).message}`,
      );
      return noop('error');
    }
  }
}
