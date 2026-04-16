import { Injectable } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { evaluateSnapshotEvidence } from '../trip-evidence.helpers';

/**
 * SnapshotEvidenceEvaluator
 *
 * Wraps the pure `evaluateSnapshotEvidence` function from trip-evidence.helpers.ts.
 * Evaluates a single DIMO snapshot against the previous known state to determine
 * whether there is sufficient evidence to candidate a trip start.
 *
 * Used in: live_start phase
 */
@Injectable()
export class SnapshotEvidenceEvaluator implements TripDetector {
  readonly name = 'SnapshotEvidenceEvaluator';

  async evaluate(ctx: DetectorContext): Promise<DetectorFinding> {
    const { snapshotSignals, previousSnapshot, profile } = ctx;

    if (!snapshotSignals) {
      return {
        detectorName: this.name,
        verdict: 'INCONCLUSIVE',
        confidence: 'LOW',
        evidence: { reason: 'no_snapshot_signals' },
        timestamp: new Date(),
      };
    }

    const result = evaluateSnapshotEvidence(
      snapshotSignals,
      previousSnapshot ?? null,
      profile,
    );

    return {
      detectorName: this.name,
      verdict: result.triggered ? 'TRIGGERED' : 'NOT_TRIGGERED',
      confidence: result.confidence,
      evidence: {
        strong: result.strong,
        weak: result.weak,
        hasMovement: result.hasMovement,
        reasons: result.reasons,
        mode: result.mode,
      },
      timestamp: new Date(),
    };
  }
}
