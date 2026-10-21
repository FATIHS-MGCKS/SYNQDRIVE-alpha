import { createHash } from 'crypto';
import {
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
  MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_CORE_SPEED_C4_VERSION,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  motionEventVersionId,
  motionFsmVersionId,
  runMotionFsm,
  type MotionFsmMode,
} from '../core';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 } from './di-v0-motion-core-shadow.bundle.version';
import { adaptMotionCoreShadowEvidenceFromParsedContainer } from './di-v0-motion-core-shadow-evidence.adapter';
import { buildMotionCoreShadowIntentKey } from './di-v0-motion-core-shadow-intent';
import type {
  DiV0MotionCoreShadowPayloadV1,
  DiV0MotionCoreShadowProcessingMode,
  DiV0MotionCoreShadowSummaryJson,
} from './di-v0-motion-core-shadow.types';
import { mapMotionManoeuvreEventToPersisted as mapEvent } from './di-v0-motion-core-shadow.types';

export const DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE: MotionFsmMode = 'RETROSPECTIVE';
export const DI_V0_MOTION_CORE_SHADOW_PROCESSING_MODE: DiV0MotionCoreShadowProcessingMode =
  'POST_TRIP_RETROSPECTIVE';

export type DiV0MotionCoreShadowProcessInput = {
  parsed: DiV0S4ParsedEvidenceContainer;
  sourceFamily: DiV0S4SourceFamily;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  computedAt?: Date;
};

export type DiV0MotionCoreShadowProcessResult = {
  intentKey: string;
  payload: DiV0MotionCoreShadowPayloadV1;
  summary: DiV0MotionCoreShadowSummaryJson;
  payloadFingerprint: string;
};

function fingerprintPayload(payload: DiV0MotionCoreShadowPayloadV1): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Pure post-trip motion-core shadow computation (Fable review recommended stack).
 * Does not read or mutate production shadow intervals.
 */
export function processDiV0MotionCoreShadowTrip(input: DiV0MotionCoreShadowProcessInput): DiV0MotionCoreShadowProcessResult {
  const computedAt = input.computedAt ?? new Date();
  const evidence = adaptMotionCoreShadowEvidenceFromParsedContainer(input.parsed, input.sourceFamily);
  const c4 = computeC4AdaptiveL3(evidence.buckets);
  const sparseArg = evidence.sparseComparable ? evidence.sparseSpeed : null;
  const fsmLabels = runMotionFsm(
    evidence.buckets,
    c4,
    DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE,
    sparseArg,
    MOTION_FSM_PARAMS_V0_2_DEV,
    MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  );
  const stopEpisodes = extractMotionFsmStopEpisodes(
    0,
    fsmLabels,
    DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE,
  );
  const events = detectMotionManoeuvreEvents(
    0,
    c4,
    'C4_ADAPTIVE_L3',
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  );

  const intentKey = buildMotionCoreShadowIntentKey({
    pinnedSnapshotHash: input.pinnedSnapshotHash,
    combinedInputIdentity: input.combinedInputIdentity,
  });

  const fsmVersion = motionFsmVersionId(MOTION_FSM_V0_3_CANDIDATE_OPTIONS);
  const eventVersion = motionEventVersionId(MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);

  const payload: DiV0MotionCoreShadowPayloadV1 = {
    contract: {
      algorithmVersions: {
        c4: MOTION_CORE_SPEED_C4_VERSION,
        fsm: fsmVersion,
        events: eventVersion,
        bundle: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
      },
      timeSemantics: {
        processingMode: DI_V0_MOTION_CORE_SHADOW_PROCESSING_MODE,
        c4ValueSupportForwardS: MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
        c4FullFinalizationForwardS: MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
        fsmMode: DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE,
        eventFinalizationNote:
          'Post-trip batch; event detector is retrospective; K3 may add up to 2s within-segment finalization.',
        computedAtUtc: computedAt.toISOString(),
      },
      sparse: {
        channelOutcome: evidence.sparseChannelOutcome,
        comparable: evidence.sparseComparable,
        sampleCount: evidence.sparsePersisted.length,
        samples: evidence.sparsePersisted,
        limitations: evidence.limitations,
      },
      comparisonHints: {
        artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
        inferredNeverPromotedToDirect: true,
        unknownNotCountedAsConfirmedStandstill: true,
      },
    },
    speeds: c4.map((s) => ({
      bucketLabelUtc: s.label,
      speedKmh: s.valueKmh,
      quality: s.quality,
      support: s.supportLabels ?? [],
      estimator: s.estimator,
      flags: s.flags ?? [],
    })),
    fsmLabels: fsmLabels.map((l) => ({
      bucketLabelUtc: l.label,
      state: l.state,
      evidenceQuality: l.evidenceQuality,
      reason: l.reason,
      flags: l.flags ?? [],
    })),
    stopEpisodes,
    events: events.map(mapEvent),
    summary: {
      labelCount: fsmLabels.length,
      speedNumericCount: c4.filter((s) => s.valueKmh != null).length,
      eventCount: events.length,
      eventAcceptedCount: events.filter((e) => e.quality !== 'ARTEFACT_SUSPECT').length,
      eventArtefactSuspectCount: events.filter((e) => e.quality === 'ARTEFACT_SUSPECT').length,
      stopEpisodeCount: stopEpisodes.length,
    },
  };

  const payloadFingerprint = fingerprintPayload(payload);
  const summary: DiV0MotionCoreShadowSummaryJson = {
    bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
    intentKey,
    processingMode: DI_V0_MOTION_CORE_SHADOW_PROCESSING_MODE,
    sparseComparable: evidence.sparseComparable,
    limitations: evidence.limitations,
    labelCount: payload.summary.labelCount,
    eventAcceptedCount: payload.summary.eventAcceptedCount,
    eventArtefactSuspectCount: payload.summary.eventArtefactSuspectCount,
    contentFingerprint: payloadFingerprint,
  };

  return { intentKey, payload, summary, payloadFingerprint };
}
