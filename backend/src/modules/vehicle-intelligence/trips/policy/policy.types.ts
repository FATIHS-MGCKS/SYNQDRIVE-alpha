import type { VehicleDetectionProfile } from '@prisma/client';
import type {
  DetectionPhase,
  DataQualityAssessment,
  AnomalyContext,
} from '../detectors/detector.interfaces';

// ═══════════════════════════════════════════════════════════════
//  POLICY INPUT
// ═══════════════════════════════════════════════════════════════

export interface PolicyInput {
  phase: DetectionPhase;
  profile: VehicleDetectionProfile;
  dataQuality: DataQualityAssessment;
  anomalyContext?: AnomalyContext;
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
}
