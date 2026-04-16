import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import { SnapshotEvidenceEvaluator } from './snapshot-evidence.evaluator';
import { StartConfirmationDetector } from './start-confirmation.detector';
import { ContinuityAssessmentDetector } from './continuity-assessment.detector';
import { EndContinuityDetector } from './end-continuity.detector';
import { ChangePointEndDetector } from './change-point-end.detector';
import { TripQualityDetector } from './trip-quality.detector';
import { TripOverlapDetector } from './trip-overlap.detector';
import { IgnitionSegmentDetector } from './ignition-segment.detector';
import { MotionSegmentDetector } from './motion-segment.detector';
import { ActivityWindowDetector } from './activity-window.detector';
import { TripMetricsService } from '../../../observability/trip-metrics.service';

/**
 * DetectorRegistry
 *
 * Resolves detector instances by name for use in the policy→detector dispatch loop.
 * All registered detectors implement `TripDetector` and never mutate trip truth —
 * they only return `DetectorFinding` values.
 *
 * ARCHITECTURE RULE: Only the `TripDecisionEngine` may commit truth from findings.
 * The registry and its callers must never write to `vehicle_trips` directly.
 *
 * Detectors that depend on optional infrastructure (ClickHouse) are injected with
 * `@Optional()` at their own level and degrade gracefully.
 */
@Injectable()
export class DetectorRegistry {
  private readonly logger = new Logger(DetectorRegistry.name);
  private readonly registry: Map<string, TripDetector>;

  constructor(
    private readonly snapshotEvidenceEvaluator: SnapshotEvidenceEvaluator,
    private readonly startConfirmationDetector: StartConfirmationDetector,
    private readonly continuityAssessmentDetector: ContinuityAssessmentDetector,
    private readonly endContinuityDetector: EndContinuityDetector,
    private readonly changePointEndDetector: ChangePointEndDetector,
    private readonly tripQualityDetector: TripQualityDetector,
    private readonly tripOverlapDetector: TripOverlapDetector,
    @Optional() private readonly ignitionSegmentDetector: IgnitionSegmentDetector,
    @Optional() private readonly motionSegmentDetector: MotionSegmentDetector,
    @Optional() private readonly activityWindowDetector: ActivityWindowDetector,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {
    this.registry = new Map<string, TripDetector>([
      ['SnapshotEvidenceEvaluator', this.snapshotEvidenceEvaluator],
      ['StartConfirmationDetector', this.startConfirmationDetector],
      ['ContinuityAssessmentDetector', this.continuityAssessmentDetector],
      ['EndContinuityDetector', this.endContinuityDetector],
      ['ChangePointEndDetector', this.changePointEndDetector],
      ['TripQualityDetector', this.tripQualityDetector],
      ['TripOverlapDetector', this.tripOverlapDetector],
    ]);

    // Optional detectors — only registered if available (ClickHouse present)
    if (this.ignitionSegmentDetector) {
      this.registry.set('IgnitionSegmentDetector', this.ignitionSegmentDetector);
    }
    if (this.motionSegmentDetector) {
      this.registry.set('MotionSegmentDetector', this.motionSegmentDetector);
    }
    if (this.activityWindowDetector) {
      this.registry.set('ActivityWindowDetector', this.activityWindowDetector);
    }
  }

  /**
   * Returns the detector instance for the given name.
   * Returns undefined if the detector is not available (e.g. requires ClickHouse).
   */
  get(name: string): TripDetector | undefined {
    return this.registry.get(name);
  }

  /**
   * Runs a list of detector names against the given context in sequence.
   * Detectors that are unavailable are skipped and logged at debug level.
   * All findings are returned regardless of verdict — the decision engine filters.
   *
   * @param detectorNames - ordered list of detector names (from policy resolver)
   * @param ctx - shared context provided to all detectors
   * @param timeoutMs - per-detector timeout in ms (default: 10s)
   */
  async runAll(
    detectorNames: string[],
    ctx: DetectorContext,
    timeoutMs = 10_000,
  ): Promise<DetectorFinding[]> {
    const findings: DetectorFinding[] = [];

    for (const name of detectorNames) {
      const detector = this.registry.get(name);
      if (!detector) {
        this.logger.debug(`Detector "${name}" not available — skipping`);
        continue;
      }

      try {
        const t0 = Date.now();
        let timer: ReturnType<typeof setTimeout>;
        const finding = await Promise.race([
          detector.evaluate(ctx).finally(() => clearTimeout(timer)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Detector ${name} timed out`)), timeoutMs);
          }),
        ]);
        this.metrics?.detectorLatency.observe({ detector: name }, (Date.now() - t0) / 1000);
        findings.push(finding);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Detector "${name}" failed: ${msg}`);
        // Push an INCONCLUSIVE finding so the caller knows the detector was attempted
        findings.push({
          detectorName: name,
          verdict: 'INCONCLUSIVE',
          confidence: 'LOW',
          evidence: { error: msg },
          timestamp: new Date(),
        });
      }
    }

    return findings;
  }
}
