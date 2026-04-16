import { Injectable } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { hasActivityResumed } from '../trip-evidence.helpers';

/**
 * EndContinuityDetector
 *
 * Wraps `hasActivityResumed` from trip-evidence.helpers.ts.
 * Used during the POSSIBLE_END phase to determine if the vehicle has resumed
 * meaningful movement — in which case, the trip end candidate should be cancelled
 * and the trip returned to ACTIVE state.
 *
 * TRIGGERED means "activity has resumed → reopen trip"
 * NOT_TRIGGERED means "no activity → proceed toward end"
 *
 * Used in: possible_end phase (resume check in processPossibleEndCheck)
 */
@Injectable()
export class EndContinuityDetector implements TripDetector {
  readonly name = 'EndContinuityDetector';

  async evaluate(ctx: DetectorContext): Promise<DetectorFinding> {
    const { coreDataPoints, profile } = ctx;

    if (!coreDataPoints || coreDataPoints.length === 0) {
      return {
        detectorName: this.name,
        verdict: 'NOT_TRIGGERED',
        confidence: 'LOW',
        evidence: { reason: 'no_recent_points', resumed: false },
        timestamp: new Date(),
      };
    }

    const resumed = hasActivityResumed(coreDataPoints, profile);

    return {
      detectorName: this.name,
      verdict: resumed ? 'TRIGGERED' : 'NOT_TRIGGERED',
      confidence: resumed ? 'MEDIUM' : 'LOW',
      evidence: {
        resumed,
        pointCount: coreDataPoints.length,
        profile,
      },
      timestamp: new Date(),
    };
  }
}
