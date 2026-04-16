import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { ClickHouseAnalyticsService } from '../../../clickhouse/clickhouse-analytics.service';

/**
 * ActivityWindowDetector
 *
 * Analytical detector backed by ClickHouse telemetry_snapshots.
 * Finds clusters of vehicle activity (speed/odometer) within a time window.
 * Used alongside IgnitionSegmentDetector in the repair layer to corroborate
 * trip candidate windows with actual movement data.
 *
 * If ClickHouse is not available, falls back to INCONCLUSIVE gracefully.
 * Used in: repair_missing_trip phases
 */
@Injectable()
export class ActivityWindowDetector implements TripDetector {
  readonly name = 'ActivityWindowDetector';
  private readonly logger = new Logger(ActivityWindowDetector.name);

  constructor(
    @Optional() private readonly chAnalytics: ClickHouseAnalyticsService,
  ) {}

  async evaluate(ctx: DetectorContext): Promise<DetectorFinding> {
    const { vehicleId, timeWindow, profile } = ctx;

    if (!this.chAnalytics) {
      return {
        detectorName: this.name,
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { reason: 'clickhouse_unavailable' },
        timestamp: new Date(),
      };
    }

    if (!timeWindow) {
      return {
        detectorName: this.name,
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { reason: 'no_time_window' },
        timestamp: new Date(),
      };
    }

    try {
      const summary = await this.chAnalytics.summarizeActivityWindow(
        vehicleId,
        timeWindow.from,
        timeWindow.to,
      );

      const hasActivity =
        summary.maxSpeedKmh > 3 || summary.odometerDeltaKm > 0.05;

      return {
        detectorName: this.name,
        verdict: hasActivity ? 'TRIGGERED' : 'NOT_TRIGGERED',
        confidence: hasActivity && summary.pointCount >= 5 ? 'HIGH' : 'MEDIUM',
        evidence: {
          pointCount: summary.pointCount,
          maxSpeedKmh: summary.maxSpeedKmh,
          odometerDeltaKm: summary.odometerDeltaKm,
          hasActivity,
          profile,
        },
        timestamp: new Date(),
      };
    } catch (err: unknown) {
      this.logger.warn(`ActivityWindowDetector query failed: ${(err as Error).message}`);
      return {
        detectorName: this.name,
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { reason: 'query_error', error: (err as Error).message },
        timestamp: new Date(),
      };
    }
  }
}
