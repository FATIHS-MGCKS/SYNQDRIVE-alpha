import { Injectable } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { validateTripStart } from '../trip-evidence.helpers';

/**
 * StartConfirmationDetector
 *
 * Wraps `validateTripStart` from trip-evidence.helpers.ts.
 * Confirms a trip start candidate by evaluating a window of core DIMO data points
 * for sustained activity (consecutive active points, duration, weighted signal score).
 *
 * Used in: live_start phase (POSSIBLE_START confirmation)
 */
@Injectable()
export class StartConfirmationDetector implements TripDetector {
  readonly name = 'StartConfirmationDetector';

  async evaluate(ctx: DetectorContext): Promise<DetectorFinding> {
    const { coreDataPoints, snapshotSignals, profile } = ctx;

    if (!coreDataPoints || coreDataPoints.length === 0) {
      return {
        detectorName: this.name,
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { reason: 'no_core_data_points' },
        timestamp: new Date(),
      };
    }

    const currentTelemetry = snapshotSignals
      ? {
          isIgnitionOn: snapshotSignals.isIgnitionOn,
          speedKmh: snapshotSignals.speedKmh,
          engineLoad: snapshotSignals.engineLoad,
        }
      : null;

    const result = validateTripStart(coreDataPoints, currentTelemetry, profile);

    return {
      detectorName: this.name,
      verdict: result.confirmed ? 'TRIGGERED' : 'NOT_TRIGGERED',
      confidence: result.confidence,
      evidence: {
        mode: result.mode,
        summary: result.summary,
      },
      timestamp: new Date(),
    };
  }
}
