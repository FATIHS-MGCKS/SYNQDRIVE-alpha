import { Injectable } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { detectTripEndChangePoint } from '../trip-cusum';
import type { TripCoreDataPoint } from '../../../dimo/dimo-segments.service';

/**
 * ChangePointEndDetector
 *
 * Wraps `detectTripEndChangePoint` (CUSUM algorithm) from trip-cusum.ts.
 *
 * IMPORTANT FIX: Input points are explicitly sorted by timestamp ascending
 * before the CUSUM analysis. The original call sites relied on DIMO returning
 * sorted data, which is not guaranteed. This sort makes the analysis deterministic.
 *
 * TRIGGERED = CUSUM detected a change point → trip end confirmed
 * NOT_TRIGGERED = CUSUM says still active (appearsOngoing)
 * INCONCLUSIVE = CUSUM threshold not crossed / insufficient data
 *
 * Used in: possible_end + repair_missing_end phases
 */
@Injectable()
export class ChangePointEndDetector implements TripDetector {
  readonly name = 'ChangePointEndDetector';

  async evaluate(ctx: DetectorContext): Promise<DetectorFinding> {
    const { coreDataPoints } = ctx;

    if (!coreDataPoints || coreDataPoints.length < 4) {
      return {
        detectorName: this.name,
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: {
          reason: 'insufficient_points',
          pointCount: coreDataPoints?.length ?? 0,
        },
        timestamp: new Date(),
      };
    }

    // ─── EXPLICIT SORT (audit-mandated fix) ─────────────────────────────────
    // Sort ascending by timestamp before feeding to CUSUM. The algorithm
    // assumes chronological ordering; out-of-order points would produce
    // incorrect S[i] accumulations.
    const sorted: TripCoreDataPoint[] = [...coreDataPoints].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const result = detectTripEndChangePoint(sorted);

    if (result.appearsOngoing) {
      return {
        detectorName: this.name,
        verdict: 'NOT_TRIGGERED',
        confidence: result.confidence,
        evidence: {
          appearsOngoing: true,
          reason: result.reason,
          pointCount: sorted.length,
        },
        timestamp: new Date(),
      };
    }

    if (result.changePointDetected && result.changePointAt) {
      return {
        detectorName: this.name,
        verdict: 'TRIGGERED',
        confidence: result.confidence,
        evidence: {
          changePointDetected: true,
          reason: result.reason,
          pointCount: sorted.length,
          cusumLastMovementAt: result.lastMovementAt?.toISOString(),
          cusumSegmentEnd: result.changePointAt?.toISOString(),
        },
        timestamp: new Date(),
        detectedAt: result.changePointAt,
      };
    }

    return {
      detectorName: this.name,
      verdict: 'INCONCLUSIVE',
      confidence: result.confidence,
      evidence: {
        reason: result.reason,
        pointCount: sorted.length,
      },
      timestamp: new Date(),
    };
  }
}
