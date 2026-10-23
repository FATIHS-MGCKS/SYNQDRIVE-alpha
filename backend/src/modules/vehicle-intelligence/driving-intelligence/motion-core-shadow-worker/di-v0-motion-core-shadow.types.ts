import type { MotionFsmMode, MotionFsmStopEpisode } from '../core/kinematics/motion-fsm';
import type { MotionManoeuvreEvent } from '../core/kinematics/motion-event.types';
import type { MotionCoreSpeedQuality } from '../core/kinematics/speed-sample.types';
import type { DiV0MotionCoreShadowSparseSamplePersisted } from './di-v0-motion-core-shadow-evidence.adapter';

export type DiV0MotionCoreShadowProcessingMode = 'POST_TRIP_RETROSPECTIVE';

export type DiV0MotionCoreShadowPersistedSpeedRow = {
  bucketLabelUtc: string;
  speedKmh: number | null;
  quality: MotionCoreSpeedQuality | string;
  support: string[];
  estimator: string;
  flags: string[];
};

export type DiV0MotionCoreShadowSpeedAuthority = 'C4_ONLY' | 'C5_1_PREFERRED';

export type DiV0MotionCoreShadowPersistedRepairRow = {
  bucketLabelUtc: string;
  repairState: string;
  c4SpeedKmh: number | null;
  c4Quality: string;
  preferredSpeedKmh: number | null;
  preferredQuality: string;
  rejectionReason: string | null;
  q5Evidence: string | null;
  q6Evidence: string | null;
};

export type DiV0MotionCoreShadowPersistedFsmRow = {
  bucketLabelUtc: string;
  state: string;
  evidenceQuality: string;
  reason: string;
  flags: string[];
};

export type DiV0MotionCoreShadowPersistedEventRow = {
  kind: string;
  startLabel: string;
  endLabel: string;
  startSpeedKmh: number;
  endSpeedKmh: number;
  deltaKmh: number;
  quality: string;
  flags: string[];
};

export type DiV0MotionCoreShadowTimeSemantics = {
  processingMode: DiV0MotionCoreShadowProcessingMode;
  c4ValueSupportForwardS: number;
  c4FullFinalizationForwardS: number;
  fsmMode: MotionFsmMode;
  eventFinalizationNote: string;
  computedAtUtc: string;
};

export type DiV0MotionCoreShadowQualityContract = {
  algorithmVersions: {
    c4: string;
    c5_1: string | null;
    c5_1ProductionSafety: string | null;
    c5_1AlgorithmFileSha256: string | null;
    fsm: string;
    events: string;
    bundle: string;
  };
  speedAuthority: DiV0MotionCoreShadowSpeedAuthority;
  knownLimitations?: string[];
  timeSemantics: DiV0MotionCoreShadowTimeSemantics;
  sparse: {
    channelOutcome: string | null;
    comparable: boolean;
    sampleCount: number;
    samples: DiV0MotionCoreShadowSparseSamplePersisted[];
    limitations: string[];
  };
  comparisonHints: {
    artefactSuspectExcludedFromAcceptedManoeuvreCounts: true;
    inferredNeverPromotedToDirect: true;
    unknownNotCountedAsConfirmedStandstill: true;
  };
};

export type DiV0MotionCoreShadowPayloadV1 = {
  contract: DiV0MotionCoreShadowQualityContract;
  speeds: DiV0MotionCoreShadowPersistedSpeedRow[];
  /** Immutable C4 baseline when speedAuthority is C5_1_PREFERRED. */
  c4Speeds?: DiV0MotionCoreShadowPersistedSpeedRow[];
  speedRepairs?: DiV0MotionCoreShadowPersistedRepairRow[];
  fsmLabels: DiV0MotionCoreShadowPersistedFsmRow[];
  stopEpisodes: MotionFsmStopEpisode[];
  events: DiV0MotionCoreShadowPersistedEventRow[];
  summary: {
    labelCount: number;
    speedNumericCount: number;
    eventCount: number;
    eventAcceptedCount: number;
    eventArtefactSuspectCount: number;
    stopEpisodeCount: number;
  };
};

export type DiV0MotionCoreShadowSummaryJson = {
  bundleVersion: string;
  intentKey: string;
  processingMode: DiV0MotionCoreShadowProcessingMode;
  sparseComparable: boolean;
  limitations: string[];
  labelCount: number;
  eventAcceptedCount: number;
  eventArtefactSuspectCount: number;
  contentFingerprint: string;
};

export function mapMotionManoeuvreEventToPersisted(row: MotionManoeuvreEvent): DiV0MotionCoreShadowPersistedEventRow {
  return {
    kind: row.kind,
    startLabel: row.startLabel,
    endLabel: row.endLabel,
    startSpeedKmh: row.startSpeedKmh,
    endSpeedKmh: row.endSpeedKmh,
    deltaKmh: row.deltaKmh,
    quality: row.quality,
    flags: row.flags ?? [],
  };
}
