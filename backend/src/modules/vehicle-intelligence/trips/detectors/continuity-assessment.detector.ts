import { Injectable } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import {
  assessActiveContinuity,
  evaluatePerformanceActivity,
} from '../trip-evidence.helpers';

/**
 * ContinuityAssessmentDetector
 *
 * Wraps `assessActiveContinuity` + `evaluatePerformanceActivity` from
 * trip-evidence.helpers.ts. Evaluates whether an active trip should remain
 * ACTIVE, transition to IDLE_WITHIN_TRIP, or move to POSSIBLE_END.
 *
 * Used in: active_trip phase (ACTIVE_TICK continuity evaluation)
 */
@Injectable()
export class ContinuityAssessmentDetector implements TripDetector {
  readonly name = 'ContinuityAssessmentDetector';

  async evaluate(ctx: DetectorContext): Promise<DetectorFinding> {
    const { coreDataPoints, performanceReadings, profile } = ctx;

    if (!coreDataPoints || coreDataPoints.length === 0) {
      return {
        detectorName: this.name,
        verdict: 'NOT_TRIGGERED',
        confidence: 'LOW',
        evidence: {
          verdict: 'POSSIBLE_END',
          reason: 'no_core_data_points',
        },
        timestamp: new Date(),
      };
    }

    const perfActive = evaluatePerformanceActivity(performanceReadings ?? []);
    const assessment = assessActiveContinuity(coreDataPoints, perfActive, profile);

    // Translate continuity verdict to detector finding
    // TRIGGERED = trip is active/idle (keep open)
    // NOT_TRIGGERED = trip should end (POSSIBLE_END)
    const isActive = assessment.verdict === 'ACTIVE' || assessment.verdict === 'IDLE';

    return {
      detectorName: this.name,
      verdict: isActive ? 'TRIGGERED' : 'NOT_TRIGGERED',
      confidence: assessment.endConfidence ?? 'MEDIUM',
      evidence: {
        continuityVerdict: assessment.verdict,
        endMode: assessment.endMode,
        summary: assessment.summary,
        perfActive,
      },
      timestamp: new Date(),
    };
  }
}
