import { Injectable } from '@nestjs/common';
import { DETECTION_PHASES } from '../detectors/detector.interfaces';
import type { PolicyInput, DetectionPolicy } from './policy.types';

/**
 * TripDetectionPolicyResolver
 *
 * The central authority for deciding which detectors to run given a
 * lifecycle phase, vehicle profile, data quality, and anomaly context.
 *
 * Rules are deterministic and hardcoded (not DB-driven) for auditability.
 * Changing detector selection requires a code change + deployment, ensuring
 * traceability of any behavioral change.
 *
 * Detectors are returned as ordered name lists. The orchestration layer and
 * reconciliation layer look up the actual detector instances by name from
 * the NestJS DI container (via a registry).
 */
@Injectable()
export class TripDetectionPolicyResolver {
  resolve(input: PolicyInput): DetectionPolicy {
    const { phase, profile, dataQuality, anomalyContext } = input;

    switch (phase) {
      // ── Live trip start candidate from a snapshot ──────────────────────────
      case DETECTION_PHASES.LIVE_START:
        return {
          detectors: ['SnapshotEvidenceEvaluator'],
          requiredConfidence: 'LOW', // We want sensitivity; decision engine filters noise
          timeoutMs: 5_000,
          fallbackBehavior: 'SKIP',
        };

      // ── Start confirmation from backfill window (POSSIBLE_START → ACTIVE) ─
      case DETECTION_PHASES.ACTIVE_TRIP:
        if (anomalyContext?.confirmingStart) {
          const detectors = ['StartConfirmationDetector'];
          if (anomalyContext.clickhouseAvailable) {
            detectors.push('ActivityWindowDetector', 'IgnitionSegmentDetector');
          }
          return {
            detectors,
            requiredConfidence: profile === 'EV' ? 'LOW' : 'MEDIUM',
            timeoutMs: 10_000,
            fallbackBehavior: 'RETRY',
          };
        }

        if (anomalyContext?.ambiguousContinuity) {
          return {
            detectors: anomalyContext.clickhouseAvailable
              ? ['ActivityWindowDetector']
              : [],
            requiredConfidence: 'MEDIUM',
            timeoutMs: 10_000,
            fallbackBehavior: 'RETRY',
          };
        }

        return {
          detectors: ['ContinuityAssessmentDetector'],
          requiredConfidence: profile === 'EV' ? 'LOW' : 'MEDIUM',
          timeoutMs: 10_000,
          fallbackBehavior: 'RETRY',
        };

      // ── Active trip continuity tick ────────────────────────────────────────
      // (Separate phase constant used by processActiveTick — same resolver output)
      case DETECTION_PHASES.POSSIBLE_END:
        return {
          detectors: ['EndContinuityDetector', 'ChangePointEndDetector'],
          requiredConfidence: 'MEDIUM',
          timeoutMs: 15_000,
          fallbackBehavior: 'RETRY',
        };

      // ── Repair: look for missing trips in a historical window ──────────────
      case DETECTION_PHASES.REPAIR_MISSING_TRIP: {
        const detectors: string[] = [];
        // If ClickHouse data is dense, prefer analytical detectors
        if (dataQuality.highFrequencyAvailable && dataQuality.telemetryDensity !== 'NONE') {
          detectors.push('IgnitionSegmentDetector');
          detectors.push('ActivityWindowDetector');
        } else {
          // Fallback: use core DIMO data points if provided in context
          detectors.push('StartConfirmationDetector');
        }
        return {
          detectors,
          requiredConfidence: 'MEDIUM',
          timeoutMs: 30_000,
          fallbackBehavior: 'ESCALATE',
        };
      }

      // ── Repair: find the correct end time for an open/missing-end trip ─────
      case DETECTION_PHASES.REPAIR_MISSING_END:
        return {
          detectors: ['ChangePointEndDetector', 'IgnitionSegmentDetector'],
          requiredConfidence: 'MEDIUM',
          timeoutMs: 20_000,
          fallbackBehavior: 'ESCALATE',
        };

      // ── Overlap / duplicate check before inserting a repair trip ──────────
      case DETECTION_PHASES.DUPLICATE_OR_OVERLAP_CHECK:
        return {
          detectors: ['TripOverlapDetector'],
          requiredConfidence: 'HIGH',
          timeoutMs: 5_000,
          fallbackBehavior: 'SKIP',
        };

      // ── Quality check before finalizing a trip ────────────────────────────
      case DETECTION_PHASES.QUALITY_CHECK:
        return {
          detectors: ['TripQualityDetector'],
          requiredConfidence: 'HIGH',
          timeoutMs: 5_000,
          fallbackBehavior: 'SKIP',
        };

      default: {
        // Unknown phase — return safest possible policy
        return {
          detectors: [],
          requiredConfidence: 'HIGH',
          timeoutMs: 5_000,
          fallbackBehavior: 'SKIP',
        };
      }
    }
  }

  /**
   * Enriches a PolicyInput with a data quality assessment based on the
   * current snapshot signals (used in the live pipeline).
   */
  assessDataQuality(params: {
    snapshotFreshMs: number | null;
    ignitionAvailable: boolean;
    speedAvailable: boolean;
    odometerAvailable: boolean;
    corePointCount: number;
    hasRoutePoints: boolean;
    hasHighFrequency: boolean;
  }): import('../detectors/detector.interfaces').DataQualityAssessment {
    const STALE_THRESHOLD_MS = 90_000; // 1.5 min

    let snapshotFreshness: 'FRESH' | 'STALE' | 'MISSING' = 'MISSING';
    if (params.snapshotFreshMs !== null) {
      snapshotFreshness =
        params.snapshotFreshMs < STALE_THRESHOLD_MS ? 'FRESH' : 'STALE';
    }

    let telemetryDensity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE';
    if (params.corePointCount >= 10) telemetryDensity = 'HIGH';
    else if (params.corePointCount >= 4) telemetryDensity = 'MEDIUM';
    else if (params.corePointCount >= 1) telemetryDensity = 'LOW';

    return {
      snapshotFreshness,
      ignitionAvailable: params.ignitionAvailable,
      speedAvailable: params.speedAvailable,
      odometerAvailable: params.odometerAvailable,
      telemetryDensity,
      routeCoverage: params.hasRoutePoints ? 'PARTIAL' : 'NONE',
      highFrequencyAvailable: params.hasHighFrequency,
    };
  }
}
