/**
 * EXP021 P22D — RD003 independent UTC anchor recovery (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildFreezeManifest } from './exp021-retrospective-halt-v0_2-freeze-review.lib';
import { RD003_SESSION_ID, RD003_VEHICLE_ID } from './exp021-p22c-rd003-session-trip-audit.lib';

export const P22D_SCHEMA = 'EXP021_P22D_RD003_UTC_ANCHOR_RECOVERY_V1';

export type AnchorClass = 'ORIGINAL_INDEPENDENT' | 'ORIGINAL_VISUAL_ASSUMED_TZ' | 'SESSION_RUNTIME' | 'TELEMETRY_DERIVED' | 'NONE';

export type UtcAnchor = {
  anchorId: string;
  clipId: string | null;
  source: string;
  originalTimestamp: string;
  utcValue: string | null;
  utcEarliest: string | null;
  utcLatest: string | null;
  uncertaintySeconds: number | null;
  provenance: string;
  dependsOnGpsDimoExp021: string;
  suitableForIndependentGt: boolean;
  anchorClass: AnchorClass;
};

export type ClipUtcRecovery = {
  clipId: string;
  fileName: string;
  durationSeconds: number;
  earliestUtcStart: string | null;
  latestUtcStart: string | null;
  bestIndependentUtcStart: string | null;
  utcUncertaintySeconds: number | null;
  clockDriftAssessment: string;
  validationStatus: 'VALIDATED' | 'PARTIAL' | 'UNKNOWN' | 'BLOCKED';
  independentAnchorsUsed: string[];
  telemetryDerivedStart: string | null;
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function loadSessionBounds(repoRoot: string): {
  fromSealedSummary: { startedAt: string; stoppedAt: string };
  fromP22cTripBinding: string | null;
} {
  const summaryPath = path.join(
    repoRoot,
    'docs/audits/data/dimo-lte-r1-reference-drive-003-session-summary.json',
  );
  const summary = readJson<{ sessionStartedAt: string; sessionStoppedAt: string }>(summaryPath);
  let tripBinding: string | null = null;
  const p22c = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/p22c/P22C_RD003_SESSION_TRIP_AUDIT.json',
  );
  if (fs.existsSync(p22c)) {
    const j = readJson<{ sessionToTrip?: { uniqueTripBinding?: string } }>(p22c);
    tripBinding = j.sessionToTrip?.uniqueTripBinding ?? null;
  }
  return {
    fromSealedSummary: { startedAt: summary.sessionStartedAt, stoppedAt: summary.sessionStoppedAt },
    fromP22cTripBinding: tripBinding,
  };
}

export function buildAnchorInventory(repoRoot: string): UtcAnchor[] {
  const anchors: UtcAnchor[] = [];
  const bounds = loadSessionBounds(repoRoot);

  anchors.push({
    anchorId: 'RC_SESSION_STARTED_AT',
    clipId: null,
    source: 'dimo-lte-r1-reference-drive-003-session-summary.json + reference_capture_sessions (P22C)',
    originalTimestamp: bounds.fromSealedSummary.startedAt,
    utcValue: bounds.fromSealedSummary.startedAt,
    utcEarliest: null,
    utcLatest: null,
    uncertaintySeconds: null,
    provenance: 'Reference-capture runtime session clock at FAST GO (not video container metadata)',
    dependsOnGpsDimoExp021: 'DIMO reference-capture session lifecycle only; not GPS-fit',
    suitableForIndependentGt: false,
    anchorClass: 'SESSION_RUNTIME',
  });
  anchors.push({
    anchorId: 'RC_SESSION_STOPPED_AT',
    clipId: null,
    source: 'sealed session summary',
    originalTimestamp: bounds.fromSealedSummary.stoppedAt,
    utcValue: bounds.fromSealedSummary.stoppedAt,
    utcEarliest: null,
    utcLatest: null,
    uncertaintySeconds: null,
    provenance: 'Session stop timestamp',
    dependsOnGpsDimoExp021: 'DIMO reference-capture only',
    suitableForIndependentGt: false,
    anchorClass: 'SESSION_RUNTIME',
  });

  const gtPath = path.join(repoRoot, 'docs/audits/data/rd003-video-ground-truth-observations.json');
  const gt = readJson<{
    clips: Array<{
      clipId: string;
      fileName: string;
      videoDurationSeconds: number;
      videoClock?: {
        displayedLocalTime?: string;
        displayedMinuteTransitions?: Array<{
          videoTimeSeconds: number;
          uncertaintySeconds?: number;
          fromMinute: string;
          toMinute: string;
        }>;
        timezoneInterpretation?: string;
        timezoneStatus?: string;
        clockResolutionSeconds?: number;
      };
      candidateAbsoluteTime?: {
        candidateStartUtc?: string | null;
        candidateStartUtcFrom?: string | null;
        candidateStartUtcTo?: string | null;
        uncertaintySeconds?: number | null;
        derivation?: string;
        status?: string;
      };
      observations?: Array<{ observationType: string; videoTimeSeconds?: number }>;
    }>;
  }>(gtPath);

  for (const c of gt.clips) {
    const cat = c.candidateAbsoluteTime;
    if (cat?.candidateStartUtc) {
      anchors.push({
        anchorId: `${c.clipId}_CANDIDATE_START_CEST_ASSUMED`,
        clipId: c.clipId,
        source: 'rd003-video-ground-truth-observations.json candidateAbsoluteTime',
        originalTimestamp: c.videoClock?.displayedLocalTime ?? 'instrument cluster visible time',
        utcValue: cat.candidateStartUtc,
        utcEarliest: cat.candidateStartUtc,
        utcLatest: cat.candidateStartUtc,
        uncertaintySeconds: cat.uncertaintySeconds ?? 30,
        provenance: cat.derivation ?? cat.status ?? 'CEST assumed NOT VALIDATED',
        dependsOnGpsDimoExp021: 'None; depends on CEST timezone hypothesis',
        suitableForIndependentGt: false,
        anchorClass: 'ORIGINAL_VISUAL_ASSUMED_TZ',
      });
    }
    if (cat?.candidateStartUtcFrom && cat?.candidateStartUtcTo) {
      anchors.push({
        anchorId: `${c.clipId}_VISIBLE_MINUTE_WINDOW`,
        clipId: c.clipId,
        source: 'visible minute + clip duration constraint',
        originalTimestamp: c.videoClock?.displayedLocalTime ?? '',
        utcValue: null,
        utcEarliest: cat.candidateStartUtcFrom,
        utcLatest: cat.candidateStartUtcTo,
        uncertaintySeconds: null,
        provenance: cat.derivation ?? '',
        dependsOnGpsDimoExp021: 'None',
        suitableForIndependentGt: false,
        anchorClass: 'ORIGINAL_VISUAL_ASSUMED_TZ',
      });
    }
    for (const tr of c.videoClock?.displayedMinuteTransitions ?? []) {
      anchors.push({
        anchorId: `${c.clipId}_MINUTE_TRANSITION_${tr.fromMinute}_to_${tr.toMinute}`,
        clipId: c.clipId,
        source: 'DIRECT_VISUAL CLOCK_MINUTE_TRANSITION in GT observations',
        originalTimestamp: `${tr.fromMinute}→${tr.toMinute} at videoT=${tr.videoTimeSeconds}s`,
        utcValue: null,
        utcEarliest: null,
        utcLatest: null,
        uncertaintySeconds: tr.uncertaintySeconds ?? 0.1,
        provenance: 'Original frame review — ties video timeline to minute boundary only',
        dependsOnGpsDimoExp021: 'None',
        suitableForIndependentGt: false,
        anchorClass: 'ORIGINAL_INDEPENDENT',
      });
    }
  }

  const alignPath = path.join(repoRoot, 'docs/audits/data/rd003-video-gt-alignment/clip-alignments.json');
  if (fs.existsSync(alignPath)) {
    const aligns = readJson<
      Array<{
        clipId: string;
        speedAlignmentBySurface?: {
          HF_HISTORICAL?: { bestCandidate?: { alignedClipStartUtc?: string } };
        };
      }>
    >(alignPath);
    for (const a of aligns) {
      const u = a.speedAlignmentBySurface?.HF_HISTORICAL?.bestCandidate?.alignedClipStartUtc;
      if (!u) continue;
      anchors.push({
        anchorId: `${a.clipId}_HF_SPEED_FIT_START`,
        clipId: a.clipId,
        source: 'clip-alignments.json HF_HISTORICAL bestCandidate',
        originalTimestamp: u,
        utcValue: u,
        utcEarliest: null,
        utcLatest: null,
        uncertaintySeconds: null,
        provenance: 'Telemetry speed alignment fit — NOT independent',
        dependsOnGpsDimoExp021: 'HF_HISTORICAL speed vs video labels',
        suitableForIndependentGt: false,
        anchorClass: 'TELEMETRY_DERIVED',
      });
    }
  }

  return anchors;
}

export function buildClipRecoveryTable(repoRoot: string): ClipUtcRecovery[] {
  const gtPath = path.join(repoRoot, 'docs/audits/data/rd003-video-ground-truth-observations.json');
  const gt = readJson<{ clips: Array<{
    clipId: string;
    fileName: string;
    videoDurationSeconds: number;
    candidateAbsoluteTime?: {
      candidateStartUtc?: string | null;
      candidateStartUtcFrom?: string | null;
      candidateStartUtcTo?: string | null;
      uncertaintySeconds?: number | null;
    };
    videoClock?: { displayedMinuteTransitions?: unknown[] };
  }> }>(gtPath);

  const alignBy = new Map<string, string | null>();
  const alignPath = path.join(repoRoot, 'docs/audits/data/rd003-video-gt-alignment/clip-alignments.json');
  if (fs.existsSync(alignPath)) {
    const aligns = readJson<
      Array<{ clipId: string; speedAlignmentBySurface?: { HF_HISTORICAL?: { bestCandidate?: { alignedClipStartUtc?: string } } } }>
    >(alignPath);
    for (const a of aligns) {
      alignBy.set(a.clipId, a.speedAlignmentBySurface?.HF_HISTORICAL?.bestCandidate?.alignedClipStartUtc ?? null);
    }
  }

  const discoveryPath = path.join(
    repoRoot,
    'docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery-v2/discovery-v2-summary.json',
  );
  const discovery = fs.existsSync(discoveryPath)
    ? readJson<{ JOINTLY_CONSISTENT_STRONG_CANDIDATE_COUNT?: number; CEST_TIMEZONE_HYPOTHESIS_CONCLUSION?: string }>(
        discoveryPath,
      )
    : null;

  const driftNote =
    discovery?.CEST_TIMEZONE_HYPOTHESIS_CONCLUSION ??
    'UNRESOLVED; discovery v2: JOINTLY_CONSISTENT_STRONG_CANDIDATE_COUNT=0; IMG_2807 vs IMG_2810 mutually incompatible';

  return gt.clips.map((c) => {
    const cat = c.candidateAbsoluteTime;
    let earliest = cat?.candidateStartUtcFrom ?? cat?.candidateStartUtc ?? null;
    let latest = cat?.candidateStartUtcTo ?? cat?.candidateStartUtc ?? null;
    if (cat?.candidateStartUtc && cat.uncertaintySeconds) {
      const t = Date.parse(cat.candidateStartUtc);
      earliest = new Date(t - cat.uncertaintySeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      latest = new Date(t + cat.uncertaintySeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    const independentUsed: string[] = [];
    if ((c.videoClock?.displayedMinuteTransitions?.length ?? 0) > 0) {
      independentUsed.push('MINUTE_TRANSITION');
    }
    if (cat?.candidateStartUtcFrom) independentUsed.push('VISIBLE_MINUTE_WINDOW_CEST');
    if (cat?.candidateStartUtc) independentUsed.push('CEST_ASSUMED_POINT');

    const validationStatus: ClipUtcRecovery['validationStatus'] = 'BLOCKED';
    return {
      clipId: c.clipId,
      fileName: c.fileName,
      durationSeconds: c.videoDurationSeconds,
      earliestUtcStart: earliest,
      latestUtcStart: latest,
      bestIndependentUtcStart: null,
      utcUncertaintySeconds: cat?.uncertaintySeconds ?? (cat?.candidateStartUtcFrom ? null : 30),
      clockDriftAssessment: driftNote,
      validationStatus,
      independentAnchorsUsed: independentUsed,
      telemetryDerivedStart: alignBy.get(c.clipId) ?? null,
    };
  });
}

export type P22DPayload = Omit<ReturnType<typeof buildP22DPayloadCore>, never>;

export function buildP22DCompletionLines(payload: {
  p22dResult: string;
  prNumber: number;
  headSha: string;
  originalSourcesAudit: { videoCreationTimestampsInRepository: boolean };
  anchors: { all: UtcAnchor[]; telemetryDerivedAnchors: number };
  qualityGates: {
    B_clipUtcSynchronization: { clipsWithValidatedUtc: number };
    A_tripIdentity: { tripId: string | null };
  };
  recoveryBlockers: string[];
  v0_2: { parameterSnapshotHash: string | unknown };
  productionMutations: string;
  nextSafeAction: string;
}): string[] {
  const suitableIndependent = payload.anchors.all.filter((a) => a.suitableForIndependentGt).length;
  return [
    `P22D_RESULT=${payload.p22dResult}`,
    `PR_NUMBER=${payload.prNumber}`,
    `HEAD_SHA=${payload.headSha}`,
    `ORIGINAL_VIDEO_TIMESTAMPS_FOUND=${payload.originalSourcesAudit.videoCreationTimestampsInRepository}`,
    `INDEPENDENT_UTC_ANCHORS=${suitableIndependent}`,
    `TELEMETRY_DERIVED_ANCHORS=${payload.anchors.telemetryDerivedAnchors}`,
    `CLIPS_WITH_VALIDATED_UTC=${payload.qualityGates.B_clipUtcSynchronization.clipsWithValidatedUtc}`,
    `BEST_UTC_PRECISION=NONE_VALIDATED; visual_minute_transitions_without_validated_timezone; CEST_windows_±30s_or_minute_boundaries_only`,
    `CLOCK_DRIFT_ASSESSMENT=JOINTLY_CONSISTENT_STRONG_CANDIDATE_COUNT=0; cross_clip_incompatible_basins_IMG_2807_vs_IMG_2810`,
    `TRIP_BINDING_STATUS=UNIQUE_CANDIDATE_${payload.qualityGates.A_tripIdentity.tripId}`,
    `VIDEO_LABEL_VALIDATION=PARTIAL_198_sparse_speed_observations_not_telemetry_aligned`,
    `INDEPENDENT_REPLAY_READY=NO`,
    `RECOVERY_BLOCKERS=${payload.recoveryBlockers.length}_documented_in_P22D_UTC_ANCHOR_RECOVERY.json`,
    `V0_2_HASH_UNCHANGED=${String(payload.v0_2.parameterSnapshotHash)}`,
    `PRODUCTION_MUTATIONS=${payload.productionMutations}`,
    `NEXT_SAFE_ACTION=${payload.nextSafeAction}`,
  ];
}

export function buildP22DPayloadCore(repoRoot: string, headSha: string, prNumber: number) {
  const freeze = buildFreezeManifest(repoRoot);
  const anchors = buildAnchorInventory(repoRoot);
  const clips = buildClipRecoveryTable(repoRoot);
  const independent = anchors.filter((a) => a.anchorClass === 'ORIGINAL_INDEPENDENT');
  const visualAssumed = anchors.filter((a) => a.anchorClass === 'ORIGINAL_VISUAL_ASSUMED_TZ');
  const telemetry = anchors.filter((a) => a.anchorClass === 'TELEMETRY_DERIVED');
  const validatedClips = clips.filter((c) => c.validationStatus === 'VALIDATED').length;

  const originalVideoInRepo = false;
  const recoveryBlocked = validatedClips === 0;

  const payload = {
    schema: P22D_SCHEMA,
    observedAtUtc: new Date().toISOString(),
    prNumber,
    headSha,
    p22dResult: recoveryBlocked ? 'UTC_RECOVERY_BLOCKED' : 'PARTIAL',
    v0_2: { parameterSnapshotHash: freeze.parameterSnapshotHash, unchanged: true },
    originalSourcesAudit: {
      videoContainerMetadataInRepository: originalVideoInRepo,
      videoCreationTimestampsInRepository: false,
      originalFilenames: clips.map((c) => c.fileName),
      sessionBounds: loadSessionBounds(repoRoot),
      sealedExportSha256: '81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4',
      externalGtSha256: 'ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e',
      syncMarkerJsonOnSession: null,
      groundTruthVideoRefOnSession: null,
      note: 'IMG_2803–2811.mp4 not stored in git; no committed container creation_time / QuickTime metadata.',
    },
    anchors: {
      all: anchors,
      independentUtcAnchors: independent.length,
      independentMinuteTransitionAnchors: independent.length,
      independentUtcAnchorsSuitableForGt: anchors.filter((a) => a.suitableForIndependentGt).length,
      telemetryDerivedAnchors: telemetry.length,
      visualAssumedTimezoneAnchors: visualAssumed.length,
    },
    clips,
    qualityGates: {
      A_tripIdentity: {
        status: 'UNIQUE_CANDIDATE',
        tripId: loadSessionBounds(repoRoot).fromP22cTripBinding,
        note: 'P22C temporal containment — does not validate per-clip UTC',
      },
      B_clipUtcSynchronization: {
        status: 'BLOCKED',
        clipsWithValidatedUtc: validatedClips,
        jointlyConsistentStrongCandidates: 0,
      },
      C_independentVideoMotionLabels: {
        status: 'PARTIAL',
        note: '198 sparse SPEED observations (visual review); not full-frame coverage; VALIDATED ≠ telemetry alignment',
      },
      D_frozenV02ReplayReadiness: {
        status: 'NOT_READY',
        reasons: ['No VALIDATED clip UTC', 'No P21 work item pin on trip fe40356a…'],
      },
    },
    recoveryBlockers: [
      'No original video files or container creation timestamps in repository',
      'CEST timezone for instrument clock NOT VALIDATED (discovery v2)',
      'JOINTLY_CONSISTENT_STRONG_CANDIDATE_COUNT=0',
      'IMG_2807 and IMG_2810 strong basins mutually incompatible (−130.8s chronology conflict)',
      'HF alignment starts are telemetry-derived — cannot count as independent UTC',
      'CROSS_CLIP_CLOCK_MODEL eligibleClipCount=0',
    ],
    productionMutations: 'NONE',
    nextSafeAction:
      'Obtain owner-provided original MP4s with verifiable creation metadata OR paired UTC sync marker at recording; re-ingest per-clip creation_time; then re-run alignment without using v0_2.',
    sessionId: RD003_SESSION_ID,
    vehicleId: RD003_VEHICLE_ID,
  };

  return payload;
}

export function buildP22DPayload(repoRoot: string, headSha: string, prNumber: number) {
  const payload = buildP22DPayloadCore(repoRoot, headSha, prNumber);
  return { ...payload, completionLines: buildP22DCompletionLines(payload) };
}
