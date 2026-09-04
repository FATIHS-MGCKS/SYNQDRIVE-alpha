/**
 * DI-EV-0035B — RD004-B Segment B video ↔ telemetry validation CLI.
 * SAFETY: read-only; no DB, Prisma, API, production runtime, or detector mutation.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';
import {
  RD004_B_EVIDENCE_ID,
  RD004_B_MODE,
  RD004_B_PHASE,
  RD004_B_SOURCE_FILES,
  assertNoEnvironmentSpecificPathsInObject,
  computeRd004SourceBundleSha256,
  loadRd004Jsonl,
  rd004SegmentBOutputSha256,
  runRd004SegmentBAnalysis,
  SEGMENT_B_CONSTANTS,
  toRepoRelativePath,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-segment-b';
import type { LegacyPreprocessedSpeedRow } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-a-segment-a';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_OBSERVATIONS = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-b',
  RD004_B_SOURCE_FILES.observations,
);
const DEFAULT_LEGACY_SIDECAR = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-b',
  RD004_B_SOURCE_FILES.legacySidecar,
);
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b');
const DEFAULT_FULL_SESSION = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a/source-observations.jsonl',
);
const DEFAULT_HF_DIAGNOSTIC = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-b/rd004-b-hf-capture-completeness-diagnostic.json',
);
const DEFAULT_EXACT_REPLAY = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-b/rd004-b-hf-exact-window-replay.json',
);
const DEFAULT_RECOVERY_DESIGN = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-b/rd004-b-hf-recovery-policy-design.json',
);

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function loadLegacySidecar(content: string): LegacyPreprocessedSpeedRow[] {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LegacyPreprocessedSpeedRow);
}

function main(): void {
  const observationsPath = parseArg('--observations') ?? DEFAULT_OBSERVATIONS;
  const legacySidecarPath = parseArg('--legacy-sidecar') ?? DEFAULT_LEGACY_SIDECAR;
  const fullSessionPath = parseArg('--full-session-observations') ?? DEFAULT_FULL_SESSION;
  const hfDiagnosticPath = parseArg('--hf-diagnostic') ?? DEFAULT_HF_DIAGNOSTIC;
  const exactReplayPath = parseArg('--exact-replay') ?? DEFAULT_EXACT_REPLAY;
  const recoveryDesignPath = parseArg('--recovery-design') ?? DEFAULT_RECOVERY_DESIGN;
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;

  assertSafeOutputPath(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const observationsContent = fs.readFileSync(observationsPath, 'utf8');
  const legacySidecarContent = fs.readFileSync(legacySidecarPath, 'utf8');
  const observationsSha256 = crypto.createHash('sha256').update(observationsContent).digest('hex');
  const legacySidecarSha256 = crypto.createHash('sha256').update(legacySidecarContent).digest('hex');
  const { bundleSha256 } = computeRd004SourceBundleSha256({
    [RD004_B_SOURCE_FILES.observations]: observationsSha256,
    [RD004_B_SOURCE_FILES.legacySidecar]: legacySidecarSha256,
  });

  const observations = loadRd004Jsonl(observationsContent);
  const legacySidecar = loadLegacySidecar(legacySidecarContent);
  const fullSessionObservations = fs.existsSync(fullSessionPath)
    ? loadRd004Jsonl(fs.readFileSync(fullSessionPath, 'utf8'))
    : observations;

  let diagnosticRequerySpeedTimestamps: string[] | null = null;
  let diagnosticRequeryError: string | null = null;
  if (fs.existsSync(hfDiagnosticPath)) {
    const hfDiag = JSON.parse(fs.readFileSync(hfDiagnosticPath, 'utf8')) as {
      broadRequery?: {
        requeryTimestamps?: string[] | null;
        error?: string | null;
        succeeded?: boolean;
      };
      requery?: {
        requeryTimestamps?: string[] | null;
        error?: string | null;
        succeeded?: boolean;
      };
    };
    const broad = hfDiag.broadRequery ?? hfDiag.requery;
    if (broad?.succeeded && broad.requeryTimestamps?.length) {
      diagnosticRequerySpeedTimestamps = broad.requeryTimestamps;
    } else if (broad?.error) {
      diagnosticRequeryError = broad.error;
    }
  }

  let exactWindowReplay: ReturnType<typeof runRd004SegmentBAnalysis>['exactWindowReplay'] = null;
  if (fs.existsSync(exactReplayPath)) {
    const replay = JSON.parse(fs.readFileSync(exactReplayPath, 'utf8')) as {
      EXACT_WINDOW_REPLAY_ATTEMPTED: string;
      EXACT_WINDOW_REPLAY_SUCCEEDED: string;
      EXACT_WINDOW_REPLAY_WINDOW_COUNT: number;
      aggregate: Record<string, number>;
      watermarkRecoveryAnalysis: Record<string, unknown>;
      HF_SPARSE_CADENCE_ORIGIN: string;
      HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES' | 'NO' | 'PARTIAL';
      HF_CAPTURE_ROOT_CAUSE: string;
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: string;
      ORIGINAL_HF_QUERY_WINDOWS?: unknown[];
      ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE?: string;
    };
    exactWindowReplay = {
      EXACT_WINDOW_REPLAY_ATTEMPTED: replay.EXACT_WINDOW_REPLAY_ATTEMPTED,
      EXACT_WINDOW_REPLAY_SUCCEEDED: replay.EXACT_WINDOW_REPLAY_SUCCEEDED,
      EXACT_WINDOW_REPLAY_WINDOW_COUNT: replay.EXACT_WINDOW_REPLAY_WINDOW_COUNT,
      aggregate: replay.aggregate,
      watermarkRecoveryAnalysis: replay.watermarkRecoveryAnalysis,
      HF_SPARSE_CADENCE_ORIGIN: replay.HF_SPARSE_CADENCE_ORIGIN,
      HF_CAPTURE_COMPLETENESS_VALIDATED: replay.HF_CAPTURE_COMPLETENESS_VALIDATED,
      HF_CAPTURE_ROOT_CAUSE: replay.HF_CAPTURE_ROOT_CAUSE as never,
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: replay.RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED,
      ORIGINAL_HF_QUERY_WINDOWS: replay.ORIGINAL_HF_QUERY_WINDOWS,
      ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE: replay.ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE,
    };
  }

  let recoveryPolicyDesign: ReturnType<typeof runRd004SegmentBAnalysis>['recoveryPolicyDesign'] = null;
  if (fs.existsSync(recoveryDesignPath)) {
    const design = JSON.parse(fs.readFileSync(recoveryDesignPath, 'utf8')) as {
      RECOMMENDED_HF_RECOVERY_ARCHITECTURE?: string;
      RECOMMENDED_SETTLEMENT_DELAY_SECONDS?: number | null;
      RECOMMENDED_RECOVERY_OVERLAP_SECONDS?: number | null;
      PERIODIC_DEEP_RECOVERY_RECOMMENDED?: string;
      HF_RUNTIME_FIX_CONTRACT_CREATED?: string;
      RD004_HF_RECOVERY_POLICY_DESIGNED?: string;
      rd004Status?: Record<string, string>;
    };
    recoveryPolicyDesign = design;
  }

  const result = runRd004SegmentBAnalysis({
    observations,
    legacySidecar,
    fullSessionObservations,
    diagnosticRequerySpeedTimestamps,
    diagnosticRequeryError,
    exactWindowReplay,
    recoveryPolicyDesign,
  });

  const paths = {
    sessionSummary: path.join(outDir, 'rd004-b-session-summary.json'),
    videoMasterTimeline: path.join(outDir, 'rd004-b-video-master-timeline.json'),
    videoAnchorTable: path.join(outDir, 'rd004-b-video-anchor-table.json'),
    signalCadence: path.join(outDir, 'rd004-b-signal-cadence.json'),
    videoClockAlignment: path.join(outDir, 'rd004-b-video-clock-alignment.json'),
    speedAccuracy: path.join(outDir, 'rd004-b-speed-accuracy.json'),
    stopTiming: path.join(outDir, 'rd004-b-stop-timing.json'),
    kinematicReconstruction: path.join(outDir, 'rd004-b-kinematic-reconstruction.json'),
    preprocessingResponse: path.join(outDir, 'rd004-b-preprocessing-response.json'),
    legacyDetectorAudit: path.join(outDir, 'rd004-b-legacy-detector-audit.json'),
    supportingSignals: path.join(outDir, 'rd004-b-supporting-signals.json'),
    gearReverseValidation: path.join(outDir, 'rd004-b-gear-reverse-validation.json'),
    segmentAComparison: path.join(outDir, 'rd004-b-segment-a-comparison.json'),
    transitionIntervalCensoring: path.join(outDir, 'rd004-b-transition-interval-censoring.json'),
    hfCaptureCompleteness: path.join(outDir, 'rd004-b-hf-capture-completeness-diagnostic.json'),
    sourceManifest: path.join(outDir, RD004_B_SOURCE_FILES.manifest),
  };

  for (const p of Object.values(paths)) assertSafeOutputPath(p);

  const sourceObservationsRel = toRepoRelativePath(observationsPath, REPO_ROOT);
  const sourceLegacyRel = toRepoRelativePath(legacySidecarPath, REPO_ROOT);

  const sessionSummary = {
    evidenceId: RD004_B_EVIDENCE_ID,
    mode: RD004_B_MODE,
    phase: RD004_B_PHASE,
    vehicle: SEGMENT_B_CONSTANTS.vehicleLabel,
    vehicleId: SEGMENT_B_CONSTANTS.vehicleId,
    tokenId: SEGMENT_B_CONSTANTS.tokenId,
    sessionId: SEGMENT_B_CONSTANTS.sessionId,
    referenceDriveId: SEGMENT_B_CONSTANTS.referenceDriveId,
    sourceObservationsPath: sourceObservationsRel,
    sourceObservationsSha256: observationsSha256,
    sourceLegacySidecarPath: sourceLegacyRel,
    sourceLegacySidecarSha256: legacySidecarSha256,
    sourceBundleSha256: bundleSha256,
    derivedFromFullSessionSha256: SEGMENT_B_CONSTANTS.fullSessionSealedEvidenceSha256,
    BUNDLE_SHA256_METHOD: 'CANONICAL_MEMBER_HASH_MANIFEST',
    CANONICAL_PATHS_REPO_RELATIVE: 'YES',
    queryEnvelope: {
      startUtc: SEGMENT_B_CONSTANTS.queryEnvelopeStartUtc,
      endUtc: SEGMENT_B_CONSTANTS.queryEnvelopeEndUtc,
    },
    videoWindow: {
      startUtc: SEGMENT_B_CONSTANTS.videoStartUtc,
      endUtc: SEGMENT_B_CONSTANTS.videoEndUtc,
      durationSeconds: SEGMENT_B_CONSTANTS.videoDurationSeconds,
      independentClockAnchorUtc: SEGMENT_B_CONSTANTS.independentClockAnchorUtc,
      timeIsDisplayCest: SEGMENT_B_CONSTANTS.timeIsDisplayCest,
      masterTimelineAudioCorrelated: result.videoMasterTimeline.VIDEO_MASTER_TIMELINE_AUDIO_CORRELATED,
      clipTotalOverlapSeconds: result.videoMasterTimeline.VIDEO_CLIP_TOTAL_OVERLAP_SECONDS,
    },
    envelopeRowCount: result.envelopeRowCount,
    flags: result.flags,
    SEGMENT_A_EVIDENCE_UNCHANGED: 'YES',
    PRODUCTION_SCORE_CHANGED: 'NO',
    PRODUCTION_DETECTORS_CHANGED: 'NO',
    DEPLOYED: 'NO',
  };

  const pathViolations = assertNoEnvironmentSpecificPathsInObject(sessionSummary);
  if (pathViolations.length) {
    throw new Error(`Environment-specific paths in session summary: ${pathViolations.join(', ')}`);
  }

  fs.writeFileSync(paths.sessionSummary, stableStringify(sessionSummary));
  fs.writeFileSync(paths.videoMasterTimeline, stableStringify(result.videoMasterTimeline));
  fs.writeFileSync(paths.videoAnchorTable, stableStringify(result.videoAnchorTable));
  fs.writeFileSync(paths.signalCadence, stableStringify(result.signalCadence));
  fs.writeFileSync(paths.videoClockAlignment, stableStringify(result.videoClockAlignment));
  fs.writeFileSync(paths.speedAccuracy, stableStringify(result.speedAccuracy));
  fs.writeFileSync(paths.stopTiming, stableStringify(result.stopTiming));
  fs.writeFileSync(paths.kinematicReconstruction, stableStringify(result.kinematicReconstruction));
  fs.writeFileSync(
    paths.legacyDetectorAudit,
    stableStringify({
      events: result.legacyDetectorAudit.events,
      counts: result.legacyDetectorAudit.counts,
      cleanPointCount: result.legacyDetectorAudit.cleanPointCount,
      mode: 'OFFLINE_READ_ONLY',
    }),
  );
  fs.writeFileSync(paths.preprocessingResponse, stableStringify(result.preprocessingResponse));
  fs.writeFileSync(paths.supportingSignals, stableStringify(result.supportingSignals));
  fs.writeFileSync(paths.gearReverseValidation, stableStringify(result.gearReverseValidation));
  fs.writeFileSync(paths.segmentAComparison, stableStringify(result.segmentAComparison));
  fs.writeFileSync(paths.transitionIntervalCensoring, stableStringify(result.transitionIntervalCensoring));
  fs.writeFileSync(paths.hfCaptureCompleteness, stableStringify(result.hfCaptureCompleteness));

  const outputSha256 = rd004SegmentBOutputSha256({
    sessionSummary,
    flags: result.flags,
    envelopeRowCount: result.envelopeRowCount,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: RD004_B_EVIDENCE_ID,
        analysisMode: RD004_B_MODE,
        outDir: toRepoRelativePath(outDir, REPO_ROOT),
        sourceBundleSha256: bundleSha256,
        outputSha256,
        flags: result.flags,
      },
      null,
      2,
    ),
  );
}

main();
