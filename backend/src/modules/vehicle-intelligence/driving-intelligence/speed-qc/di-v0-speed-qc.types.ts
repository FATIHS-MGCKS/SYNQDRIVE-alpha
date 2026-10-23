import type {
  AbstentionReason,
  EvidenceAvailability,
  MotionState,
  PositionState,
  SourceRelation,
  SpeedEvidenceState,
  TemporalConfidence,
  ValueConfidence,
} from '../core/types';
import type { DiV0SpeedQcReasonCode } from './di-v0-speed-qc-reason-codes';

export type DiV0SpeedQcTrustLevel = 'TRUSTED' | 'TRUSTED_LIMITED' | 'UNTRUSTED';

/**
 * Snapshot reference identity for QC input binding.
 * String equality on `pinnedSnapshotHash` / `expectedPinnedSnapshotHash` is a
 * **container identity check only** — not cryptographic validation of gzip payload bytes.
 * Payload attestation remains an upstream S4 pin responsibility (P2 projector).
 */
export interface DiV0SpeedQcEvidenceIdentity {
  pinnedSnapshotHash: string;
  /** When set, must match pinnedSnapshotHash or evaluation fails closed. */
  expectedPinnedSnapshotHash?: string | null;
}

export interface DiV0SpeedQcPositionSample {
  bucketLabel: string;
  availability: EvidenceAvailability;
  latitude?: number;
  longitude?: number;
  positionState?: PositionState;
}

export interface DiV0SpeedQcR1Sample {
  bucketLabel: string;
  speedKmh: number | null;
  temporalConfidence: TemporalConfidence;
}

/** Shadow interval fields required for QC (S1 output / S2 row semantics unchanged). */
export interface DiV0SpeedQcShadowInterval {
  intervalStart: string;
  intervalEnd: string;
  referenceTime: string;
  estimatedSpeedKmh: number | null;
  speedEvidenceState: SpeedEvidenceState;
  valueConfidence: ValueConfidence;
  sourceRelation: SourceRelation;
  motionState: MotionState;
  positionState: PositionState;
  abstentionReason: AbstentionReason | null;
  sourceQualityFlags: string[];
  evidenceSources: string[];
}

export interface DiV0SpeedQcEvaluateInput {
  centerBucketLabel: string;
  shadow: DiV0SpeedQcShadowInterval;
  positions: DiV0SpeedQcPositionSample[];
  r1Obd?: DiV0SpeedQcR1Sample[];
  evidenceIdentity: DiV0SpeedQcEvidenceIdentity;
  /** Defaults to DI_V0_SPEED_QC_POLICY_V1 when omitted. */
  qcPolicyVersion?: string;
}

export interface DiV0SpeedQcSupportAssessment {
  prevLabel: string | null;
  centerLabel: string;
  nextLabel: string | null;
  calendarSupportComplete: boolean;
  legDistancesM: { prevToCenter: number | null; centerToNext: number | null };
  legImpliedSpeedMps: { prevToCenter: number | null; centerToNext: number | null };
  legDeltaSeconds: { prevToCenter: number | null; centerToNext: number | null };
  supportQualityFlags: string[];
}

export interface DiV0SpeedQcSourceCorroboration {
  r1PresentAtCenter: boolean;
  r1SpeedKmhAtCenter: number | null;
  /** Bucket-aligned speed agreement — not interval-only semantics. */
  r1CorroboratesL3: boolean;
  /** True only when R1 corroborates and shadow is not R1_INTERVAL_ONLY at center. */
  r1IndependentWitness: boolean;
  r1IntervalOnlyAtCenter: boolean;
}

export interface DiV0SpeedQcPhysicalPlausibility {
  calibrationKind: 'PROVISIONAL';
  maxLegSpeedMpsApplied: number;
  maxLongitudinalAccelMps2Applied: number;
  impliedAccelPrevCenterNextMps2: number | null;
}

export interface DiV0SpeedQcIntervalVerdict {
  qcPolicyVersion: string;
  trustLevel: DiV0SpeedQcTrustLevel;
  reasonCodes: DiV0SpeedQcReasonCode[];
  inputEvidenceIdentity: DiV0SpeedQcEvidenceIdentity;
  originalEstimatedSpeedKmh: number | null;
  qcTrustedSpeedKmh: number | null;
  supportAssessment: DiV0SpeedQcSupportAssessment;
  sourceCorroboration: DiV0SpeedQcSourceCorroboration;
  physicalPlausibility: DiV0SpeedQcPhysicalPlausibility;
}
