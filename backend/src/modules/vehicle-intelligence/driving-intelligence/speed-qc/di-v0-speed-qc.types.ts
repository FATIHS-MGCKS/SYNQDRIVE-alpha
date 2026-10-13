import type {
  AbstentionReason,
  EvidenceAvailability,
  MotionState,
  PositionState,
  SourceRelation,
  SpeedEvidenceState,
  ValueConfidence,
} from '../core/types';
import type { DiV0SpeedQcReasonCode } from './di-v0-speed-qc-reason-codes';

export type DiV0SpeedQcTrustLevel = 'TRUSTED' | 'TRUSTED_LIMITED' | 'UNTRUSTED';

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
  r1CorroboratesL3: boolean;
  r1IndependentWitness: boolean;
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
