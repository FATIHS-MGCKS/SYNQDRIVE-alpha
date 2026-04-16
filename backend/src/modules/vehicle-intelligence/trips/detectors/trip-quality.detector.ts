import { Injectable } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { checkTripQuality } from '../trip-evidence.helpers';

export interface TripQualityContext extends DetectorContext {
  durationMs: number;
  distanceKm: number | null;
  maxConsecutiveActive: number;
  previousTripEndTime: Date | null;
  currentTripStartTime: Date;
}

/**
 * TripQualityDetector
 *
 * Wraps `checkTripQuality` from trip-evidence.helpers.ts.
 * Determines whether a finalized trip should be discarded (too short, no distance)
 * or merged with a preceding trip (small gap).
 *
 * TRIGGERED = trip is fine / should be kept
 * NOT_TRIGGERED = trip should be discarded
 * INCONCLUSIVE = trip should be merged with the previous trip
 *
 * Used in: quality_check phase (FINALIZE step)
 */
@Injectable()
export class TripQualityDetector implements TripDetector {
  readonly name = 'TripQualityDetector';

  async evaluate(ctx: TripQualityContext): Promise<DetectorFinding> {
    const {
      durationMs,
      distanceKm,
      maxConsecutiveActive,
      previousTripEndTime,
      currentTripStartTime,
    } = ctx;

    const result = checkTripQuality(
      durationMs,
      distanceKm,
      maxConsecutiveActive,
      previousTripEndTime,
      currentTripStartTime,
    );

    if (result.shouldDiscard) {
      return {
        detectorName: this.name,
        verdict: 'NOT_TRIGGERED',
        confidence: 'HIGH',
        evidence: { action: 'discard', reason: result.reason, durationMs, distanceKm },
        timestamp: new Date(),
      };
    }

    if (result.shouldMergeWithPrevious) {
      return {
        detectorName: this.name,
        verdict: 'INCONCLUSIVE',
        confidence: 'HIGH',
        evidence: { action: 'merge', reason: result.reason, durationMs, distanceKm },
        timestamp: new Date(),
      };
    }

    return {
      detectorName: this.name,
      verdict: 'TRIGGERED',
      confidence: 'HIGH',
      evidence: { action: 'keep', durationMs, distanceKm },
      timestamp: new Date(),
    };
  }
}
