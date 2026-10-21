import type { VehicleDetectionProfile } from '@prisma/client';
import type {
  DetectionPhase,
  DataQualityAssessment,
  AnomalyContext,
} from '../detectors/detector.interfaces';
import type { LiveStartFreshnessState } from '../trip-start-detection-policy';

// ═══════════════════════════════════════════════════════════════
//  POLICY INPUT
// ═══════════════════════════════════════════════════════════════

export interface PolicyInput {
  phase: DetectionPhase;
  profile: VehicleDetectionProfile;
  dataQuality: DataQualityAssessment;
  anomalyContext?: AnomalyContext;
  /** Explicit LIVE_START freshness authority — avoids INVALID→STALE coercion. */
  liveStartFreshnessState?: LiveStartFreshnessState;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTION POLICY (output of resolver)
// ═══════════════════════════════════════════════════════════════

export interface DetectionPolicy {
  /** Ordered list of detector names to execute. */
  detectors: string[];
  /** Minimum confidence required for any TRIGGERED finding to count. */
  requiredConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  /** How long a detector may take before we consider it timed out. */
  timeoutMs: number;
  /** What to do when all detectors return INCONCLUSIVE or fail. */
  fallbackBehavior: 'SKIP' | 'RETRY' | 'ESCALATE';
  /** Optional audit reason when detectors are intentionally skipped. */
  skipReason?: string;
}
