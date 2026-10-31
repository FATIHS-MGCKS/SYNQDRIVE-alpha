import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4Layer2P4bP2AdmissibleEventRowV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import {
  DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
} from './ds4-layer2-p4b-pinned-source-runs.v1';
import type { Ds4Layer2P4bLoadedMotionPayloadV1 } from './ds4-layer2-p4b-payload-loader.v1';

/** Test-only: synthesize motion payloads aligned to P2 event indices (read-only research harness). */
export function buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(
  events: readonly Ds4Layer2P4bP2AdmissibleEventRowV1[],
  options?: {
    boundarySpeedKmh?: number;
    includeWindowSpeedSamples?: boolean;
    repairInWindow?: boolean;
    /** When true on C5_1 trips, emit pass-through repair rows at each event start label (legacy-40 reproduction). */
    c51PassThroughGridRepairRows?: boolean;
    inWindowRepairState?: 'REPAIR_ACCEPTED' | 'REPAIR_REJECTED' | 'UNCERTAIN' | 'PASS_THROUGH_NO_REPAIR';
  },
): Map<string, Ds4Layer2P4bLoadedMotionPayloadV1> {
  const boundary = options?.boundarySpeedKmh ?? 42;
  const byRun = new Map<string, Ds4Layer2P4bP2AdmissibleEventRowV1[]>();
  for (const ev of events) {
    const list = byRun.get(ev.sourceMotionRunId) ?? [];
    list.push(ev);
    byRun.set(ev.sourceMotionRunId, list);
  }

  const payloads = new Map<string, Ds4Layer2P4bLoadedMotionPayloadV1>();
  for (const [runId, runEvents] of byRun) {
    const tripId = runEvents[0]!.tripId;
    const pinned = DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[tripId as keyof typeof DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1];
    const maxIndex = Math.max(...runEvents.map((e) => e.eventIndex));
    const motionEvents = Array.from({ length: maxIndex + 1 }, (_, i) => {
      const match = runEvents.find((e) => e.eventIndex === i);
      if (!match) {
        return {
          kind: 'ACCELERATION',
          startLabel: '1970-01-01T00:00:00Z',
          endLabel: '1970-01-01T00:00:01Z',
          startSpeedKmh: boundary,
          endSpeedKmh: boundary,
          deltaKmh: 0,
          quality: 'OK',
          flags: [] as string[],
        };
      }
      return {
        kind: match.eventKind,
        startLabel: match.startLabelUtc,
        endLabel: match.endLabelUtc,
        startSpeedKmh: boundary,
        endSpeedKmh: boundary + 1,
        deltaKmh: 1,
        quality: 'OK',
        flags: [] as string[],
      };
    });

    const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
    if (options?.includeWindowSpeedSamples) {
      for (const ev of runEvents) {
        speeds.push({
          bucketLabelUtc: ev.startLabelUtc,
          speedKmh: boundary,
          quality: 'OK',
          support: [],
          estimator: 'TEST',
          flags: [],
        });
      }
    }

    const speedRepairs: DiV0MotionCoreShadowPayloadV1['speedRepairs'] = [];
    if (options?.repairInWindow && runEvents[0]) {
      speedRepairs.push({
        bucketLabelUtc: runEvents[0]!.startLabelUtc,
        repairState: options.inWindowRepairState ?? 'REPAIR_ACCEPTED',
        c4SpeedKmh: boundary,
        c4Quality: 'OK',
        preferredSpeedKmh: boundary,
        preferredQuality: 'OK',
        rejectionReason: null,
        q5Evidence: null,
        q6Evidence: null,
      });
    }
    if (options?.c51PassThroughGridRepairRows && pinned.speedAuthority === 'C5_1_PREFERRED') {
      for (const ev of runEvents) {
        speedRepairs.push({
          bucketLabelUtc: ev.startLabelUtc,
          repairState: 'PASS_THROUGH_NO_REPAIR',
          c4SpeedKmh: boundary,
          c4Quality: 'OK',
          preferredSpeedKmh: boundary,
          preferredQuality: 'OK',
          rejectionReason: null,
          q5Evidence: null,
          q6Evidence: null,
        });
      }
    }

    const payload: DiV0MotionCoreShadowPayloadV1 = {
      contract: {
        algorithmVersions: {
          c4: 'test',
          c5_1: null,
          c5_1ProductionSafety: null,
          c5_1AlgorithmFileSha256: null,
          fsm: 'test',
          gapBridgeV1: null,
          fsmAuxBinding: null,
          events: 'test',
          bundle: 'test-bundle-v1',
        },
        speedAuthority: pinned.speedAuthority,
        timeSemantics: {
          processingMode: 'POST_TRIP_RETROSPECTIVE',
          c4ValueSupportForwardS: 1,
          c4FullFinalizationForwardS: 1,
          fsmMode: 'RETROSPECTIVE',
          eventFinalizationNote: 'test',
          computedAtUtc: '2026-10-31T00:00:00Z',
        },
        sparse: {
          channelOutcome: null,
          comparable: true,
          sampleCount: 0,
          samples: [],
          limitations: [],
        },
        comparisonHints: {
          artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
          inferredNeverPromotedToDirect: true,
          unknownNotCountedAsConfirmedStandstill: true,
        },
      },
      speeds,
      speedRepairs,
      fsmLabels: [],
      stopEpisodes: [],
      events: motionEvents,
      summary: {
        labelCount: 0,
        speedNumericCount: speeds.length,
        eventCount: motionEvents.length,
        eventAcceptedCount: motionEvents.length,
        eventArtefactSuspectCount: 0,
        stopEpisodeCount: 0,
      },
    };

    payloads.set(runId, {
      payload,
      sourceMotionRunId: runId,
      contentFingerprint: pinned.contentFingerprint,
      speedAuthority: pinned.speedAuthority,
      sourceMotionRevision: 'test-bundle-v1',
      shadowBundleVersion: 'test',
    });
  }

  return payloads;
}
