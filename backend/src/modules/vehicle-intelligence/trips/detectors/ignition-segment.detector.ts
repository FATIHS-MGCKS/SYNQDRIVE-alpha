import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { ClickHouseAnalyticsService } from '../../../clickhouse/clickhouse-analytics.service';

export interface IgnitionSegmentFinding {
  segmentStart: Date;
  segmentEnd: Date;
  durationMs: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface IgnitionSegmentContext extends DetectorContext {
  /** Candidate trip windows returned by the detector, attached to the finding. */
  foundSegments?: IgnitionSegmentFinding[];
}

/**
 * IgnitionSegmentDetector
 *
 * Analytical detector backed by ClickHouse telemetry_state_changes.
 * Finds ignition ON→OFF segments within a time window, returning trip candidates
 * for use by the reconciliation/repair layer.
 *
 * If ClickHouse is not available, falls back to INCONCLUSIVE gracefully.
 * Used in: repair_missing_trip, repair_missing_end phases
 */
@Injectable()
export class IgnitionSegmentDetector implements TripDetector {
  readonly name = 'IgnitionSegmentDetector';
  private readonly logger = new Logger(IgnitionSegmentDetector.name);

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
      const segments = await this.chAnalytics.findIgnitionSegments(
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
      this.logger.warn(`IgnitionSegmentDetector query failed: ${(err as Error).message}`);
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
