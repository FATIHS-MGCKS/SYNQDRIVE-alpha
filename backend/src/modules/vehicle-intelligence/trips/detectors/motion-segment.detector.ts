import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { ClickHouseAnalyticsService } from '../../../clickhouse/clickhouse-analytics.service';

export interface MotionSegmentFinding {
  segmentStart: Date;
  segmentEnd: Date;
  durationMs: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * MotionSegmentDetector
 *
 * Analytical detector backed by ClickHouse telemetry_state_changes
 * using signal_name = 'motion' (speed > 2 km/h transitions).
 *
 * This is the EV-friendly counterpart to IgnitionSegmentDetector.
 * Vehicles like Tesla that never report isIgnitionOn produce zero ignition
 * state changes, but DO produce motion state changes whenever speed crosses
 * the 2 km/h threshold. This detector uses those transitions to find trip
 * candidates during reconciliation.
 *
 * Used in: repair_missing_trip phase (primarily for EV/UNKNOWN profiles)
 */
@Injectable()
export class MotionSegmentDetector implements TripDetector {
  readonly name = 'MotionSegmentDetector';
  private readonly logger = new Logger(MotionSegmentDetector.name);

  constructor(
    @Optional() private readonly chAnalytics: ClickHouseAnalyticsService,
  ) {}

  async evaluate(ctx: DetectorContext): Promise<DetectorFinding> {
    const { vehicleId, timeWindow } = ctx;

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
      const segments = await this.chAnalytics.findMotionSegments(
        vehicleId,
        timeWindow.from,
        timeWindow.to,
      );

      if (segments.length === 0) {
        return {
          detectorName: this.name,
          verdict: 'NOT_TRIGGERED',
          confidence: 'MEDIUM',
          evidence: { segmentsFound: 0, window: timeWindow },
          timestamp: new Date(),
        };
      }

      return {
        detectorName: this.name,
        verdict: 'TRIGGERED',
        confidence: 'HIGH',
        evidence: {
          segmentsFound: segments.length,
          segments: segments.map((s) => ({
            start: s.segmentStart.toISOString(),
            end: s.segmentEnd.toISOString(),
            durationMs: s.durationMs,
            confidence: s.confidence,
          })),
        },
        timestamp: new Date(),
      };
    } catch (err: unknown) {
      this.logger.warn(`MotionSegmentDetector query failed: ${(err as Error).message}`);
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
