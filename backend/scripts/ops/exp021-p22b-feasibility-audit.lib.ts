/**
 * EXP021 P22B — ground-truth recovery feasibility (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildFreezeManifest } from './exp021-retrospective-halt-v0_2-freeze-review.lib';

export const P22B_SCHEMA = 'EXP021_P22B_RECOVERY_FEASIBILITY_V1';

export type RecoveryClass = 'RECOVERABLE' | 'PARTIALLY_RECOVERABLE' | 'NEW_CAPTURE_REQUIRED';

export type CaseType =
  | 'HALT_WITHOUT_SIGNAL'
  | 'SLOW_ROLL_NO_FULL_HALT'
  | 'STOP_AND_GO'
  | 'MOVEMENT_DURING_GAP'
  | 'MANEUVER_RETURN_SAME_POINT';

export type Rd003ClipRow = {
  clipId: string;
  fileName: string;
  videoDurationSeconds: number;
  negativeControl: boolean;
  behavioralSummary: string;
  videoClockDisplayed: string | null;
  candidateStartUtc: string | null;
  candidateUtcUncertaintySeconds: number | null;
  clockStatus: string;
  observationCount: number;
  speedSampleCount: number;
  tachoZeroLabeledSeconds: number;
  speedMinKmh: number | null;
  speedMaxKmh: number | null;
  observationProvenance: string;
  originalVideoInRepository: false;
  alignmentStatus: string | null;
  matchCoverageRatio: number | null;
};

const VEHICLE_RD003 = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const SESSION_RD003 = '0fa040aa-6105-4872-9b2c-f8ad477009b8';

export function loadRd003Clips(repoRoot: string): {
  sessionId: string;
  referenceDriveId: string;
  vehicleId: string;
  synqDriveTripId: null;
  ingestionAuthority: string;
  groundTruthValidated: false;
  clips: Rd003ClipRow[];
} {
  const gtPath = path.join(repoRoot, 'docs/audits/data/rd003-video-ground-truth-observations.json');
  const alignPath = path.join(repoRoot, 'docs/audits/data/rd003-video-gt-alignment/clip-alignments.json');
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8')) as {
    referenceDriveId: string;
    sessionId: string;
    ingestionAuthority: string;
    clips: Array<{
      clipId: string;
      fileName: string;
      videoDurationSeconds: number;
      negativeControl: boolean;
      behavioralSummary: string;
      videoClock?: { displayedLocalTime?: string };
      candidateAbsoluteTime?: {
        candidateStartUtc?: string | null;
        uncertaintySeconds?: number | null;
        status?: string;
      };
      observations?: Array<{ observationType: string; value: number }>;
    }>;
  };
  const alignByClip = new Map<string, { alignmentStatus: string | null; metrics?: { MATCH_COVERAGE_RATIO?: number } }>();
  if (fs.existsSync(alignPath)) {
    const aligns = JSON.parse(fs.readFileSync(alignPath, 'utf8')) as Array<{
      clipId: string;
      alignmentStatus?: string;
      speedAlignmentBySurface?: { HF_HISTORICAL?: { metrics?: { MATCH_COVERAGE_RATIO?: number } } };
    }>;
    for (const a of aligns) {
      alignByClip.set(a.clipId, {
        alignmentStatus: a.alignmentStatus ?? null,
        metrics: a.speedAlignmentBySurface?.HF_HISTORICAL?.metrics,
      });
    }
  }

  const clips: Rd003ClipRow[] = gt.clips.map((c) => {
    const speeds = (c.observations ?? []).filter((o) => o.observationType === 'SPEED');
    const vals = speeds.map((s) => s.value);
    const al = alignByClip.get(c.clipId);
    const cat = c.candidateAbsoluteTime;
    const startUtc =
      typeof cat?.candidateStartUtc === 'string'
        ? cat.candidateStartUtc
        : cat?.status === 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY'
          ? null
          : null;
    return {
      clipId: c.clipId,
      fileName: c.fileName,
      videoDurationSeconds: c.videoDurationSeconds,
      negativeControl: c.negativeControl,
      behavioralSummary: c.behavioralSummary,
      videoClockDisplayed: c.videoClock?.displayedLocalTime ?? null,
      candidateStartUtc: startUtc,
      candidateUtcUncertaintySeconds: cat?.uncertaintySeconds ?? null,
      clockStatus: cat?.status ?? 'UNKNOWN',
      observationCount: c.observations?.length ?? 0,
      speedSampleCount: speeds.length,
      tachoZeroLabeledSeconds: speeds.filter((s) => s.value === 0).length,
      speedMinKmh: vals.length ? Math.min(...vals) : null,
      speedMaxKmh: vals.length ? Math.max(...vals) : null,
      observationProvenance: gt.ingestionAuthority,
      originalVideoInRepository: false,
      alignmentStatus: al?.alignmentStatus ?? null,
      matchCoverageRatio: al?.metrics?.MATCH_COVERAGE_RATIO ?? null,
    };
  });

  return {
    sessionId: gt.sessionId,
    referenceDriveId: gt.referenceDriveId,
    vehicleId: VEHICLE_RD003,
    synqDriveTripId: null,
    ingestionAuthority: gt.ingestionAuthority,
    groundTruthValidated: false,
    clips,
  };
}

export function assessRd004VideoGroundTruth(repoRoot: string): {
  sessionId: string;
  vehicleId: string;
  synqDriveTripId: null;
  haltVideoGroundTruthValidated: false;
  lateBucketEventsAreGroundTruth: false;
  stopTimingValidated: boolean;
  videoAnchorsPresent: boolean;
  notes: string[];
} {
  const stopPath = path.join(repoRoot, 'docs/audits/data/rd004-segment-b/rd004-b-stop-timing.json');
  const anchorPath = path.join(repoRoot, 'docs/audits/data/rd004-segment-b/rd004-b-video-anchor-table.json');
  let stopTimingValidated = false;
  if (fs.existsSync(stopPath)) {
    const s = JSON.parse(fs.readFileSync(stopPath, 'utf8')) as { STOP_TIMING_VALIDATED?: string };
    stopTimingValidated = s.STOP_TIMING_VALIDATED === 'YES';
  }
  const videoAnchorsPresent = fs.existsSync(anchorPath);
  return {
    sessionId: 'f1e81e78-f96b-44ee-80c2-ca5270f21248',
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    synqDriveTripId: null,
    haltVideoGroundTruthValidated: false,
    lateBucketEventsAreGroundTruth: false,
    stopTimingValidated,
    videoAnchorsPresent,
    notes: [
      'Segment B documents HF late arrival and watermark recovery — not per-second halt labels for v0_2.',
      'rd004-b-stop-timing.json: STOP_TIMING_VALIDATED=NO; provider timeline cannot validate its own alignment.',
      'Segment A: VIDEO_PROVIDER_ALIGNMENT_CLASS=INSUFFICIENT_EVIDENCE (rd004-a-findings.md).',
    ],
  };
}

export function v02Rd003UsageAudit(repoRoot: string): {
  usedInRetrospectiveHaltV02Code: false;
  usedInExp021TransferabilityOrP22A: 'INVENTORY_ONLY';
  usedInDiArchitectureCadence: true;
  contaminationClassForV02: 'NOT_USED_PARAMETER_SELECTION';
  notes: string[];
} {
  return {
    usedInRetrospectiveHaltV02Code: false,
    usedInExp021TransferabilityOrP22A: 'INVENTORY_ONLY',
    usedInDiArchitectureCadence: true,
    contaminationClassForV02: 'NOT_USED_PARAMETER_SELECTION',
    notes: [
      'No RD003 imports in exp021-retrospective-halt-prototype*.ts or v2 lib (repo grep 2026-10-16).',
      'RD003 informs DI cadence / signal-quality architecture, not v0_2 composite halt scores.',
      'Tesla EV-GT remains EXP021 halt development material; RD003 is separate reference-capture lineage.',
    ],
  };
}

export function recoveryMatrix(): Array<{
  caseType: CaseType;
  recoveryClass: RecoveryClass;
  existingVideo: string[];
  existingTelemetry: string[];
  syncAnchors: string;
  blockers: string[];
  captureProtocolIfNew: string | null;
}> {
  return [
    {
      caseType: 'HALT_WITHOUT_SIGNAL',
      recoveryClass: 'PARTIALLY_RECOVERABLE',
      existingVideo: ['RD003 IMG_2803/2807/2808 (stop segments, sparse 0 km/h labels)', 'Tesla E02/E04–E06 (development only)'],
      existingTelemetry: ['RD003 session HF speed ~2s + GPS slow path', 'Tesla P21 pin 358d0158… (dev)'],
      syncAnchors: 'RD003 ±30s video-clock candidate; no validated provider offset; Tesla visible Berlin clock without sub-second UTC',
      blockers: [
        'No SynqDrive trip_id for RD003 session in capture report.',
        'GROUND_TRUTH_VALIDATED=NO; clip alignments INSUFFICIENT_GROUND_TRUTH / low MATCH_COVERAGE.',
        'Tesla cannot serve independent holdout.',
      ],
      captureProtocolIfNew:
        'Parked/stop away from signalized intersection; dashcam + fixed UTC reference (NTP/phone network time photo at start); 60s include full stop with readable speed; passenger operates camera before drive.',
    },
    {
      caseType: 'SLOW_ROLL_NO_FULL_HALT',
      recoveryClass: 'NEW_CAPTURE_REQUIRED',
      existingVideo: ['RD003 clip 002/007 are cruise/decel controls, not slow-roll-through', 'Tesla E03 decel to 8 km/h (dev)'],
      existingTelemetry: ['RD003 session', 'Tesla pin'],
      syncAnchors: 'Same as above',
      blockers: ['No archived clip labeled as sustained 1–5 km/h roll without full 0 km/h stop tied to P21 gaps.'],
      captureProtocolIfNew:
        'Approach junction or yield; maintain 2–5 km/h for ≥15s without complete stop; single continuous clip; UTC sync at start; avoid camera handling while rolling.',
    },
    {
      caseType: 'STOP_AND_GO',
      recoveryClass: 'PARTIALLY_RECOVERABLE',
      existingVideo: ['RD003 clips 001, 005, 006 (behavioral STOP→LAUNCH)', 'Tesla stop-and-go segments (dev)'],
      existingTelemetry: ['RD003 sealed session telemetry', 'Tesla shadow intervals'],
      syncAnchors: 'RD003 sparse 1 Hz video-time speed labels only; alignment workbench candidates not VALIDATED',
      blockers: ['Cannot bind to v0_2 gap windows without validated UTC↔telemetry map and P21 pin.'],
      captureProtocolIfNew:
        'Two full stop→go cycles in one clip; visible speed display; honk/mark at stop line optional; UTC reference at clip start; post-drive only review.',
    },
    {
      caseType: 'MOVEMENT_DURING_GAP',
      recoveryClass: 'PARTIALLY_RECOVERABLE',
      existingVideo: ['Tesla E06/E07 gap + accel (dev)', 'RD004 video exists but stop-in-gap NOT validated'],
      existingTelemetry: ['Tesla ROW_ABSENT gaps', 'RD004 HF replay diagnostics only'],
      syncAnchors: 'Tesla partial; RD004 STOP_TIMING_VALIDATED=NO',
      blockers: [
        'RD004 late-bucket/watermark events are capture artifacts, not independent movement GT.',
        'Independent case needs position gap with video proving continued motion.',
      ],
      captureProtocolIfNew:
        'Drive through area with known GPS drop-out or sparse uplink segment; continuous video showing speed >0 throughout gap; log clip start against UTC; do not use map-only inference.',
    },
    {
      caseType: 'MANEUVER_RETURN_SAME_POINT',
      recoveryClass: 'PARTIALLY_RECOVERABLE',
      existingVideo: ['RD003 clip 009 REVERSE sequence', 'Tesla E01 reverse departure + E12 parking (dev)'],
      existingTelemetry: ['RD003 session GPS', 'Tesla pin geometry'],
      syncAnchors: 'RD003 clip 009 candidate UTC window 19:24:29Z±3s only',
      blockers: ['v0_2 chord metric cannot validate return-to-same-point without path GT; alignment unvalidated.'],
      captureProtocolIfNew:
        'Low-speed forward-reverse-forward in open lot; GPS visible on secondary logging if available; mark UTC at maneuver start; passenger sets camera before maneuver.',
    },
  ];
}

export function buildP22BPayload(repoRoot: string, headSha: string, prNumber: number) {
  const freeze = buildFreezeManifest(repoRoot);
  const rd003 = loadRd003Clips(repoRoot);
  const rd004 = assessRd004VideoGroundTruth(repoRoot);
  const v02Usage = v02Rd003UsageAudit(repoRoot);
  const matrix = recoveryMatrix();

  const recoverable = matrix.filter((m) => m.recoveryClass === 'RECOVERABLE').map((m) => m.caseType);
  const partial = matrix.filter((m) => m.recoveryClass === 'PARTIALLY_RECOVERABLE').map((m) => m.caseType);
  const newCap = matrix.filter((m) => m.recoveryClass === 'NEW_CAPTURE_REQUIRED').map((m) => m.caseType);

  return {
    schema: P22B_SCHEMA,
    observedAtUtc: new Date().toISOString(),
    prNumber,
    headSha,
    p22bResult: 'PARTIAL_RECOVERY_FEASIBLE_INDEPENDENT_VALIDATION_BLOCKED',
    v0_2: {
      parameterSnapshotHash: freeze.parameterSnapshotHash,
      unchangedInP22B: true,
    },
    rd003: {
      ...rd003,
      tripBinding: {
        synqDriveTripId: null,
        vehicleId: VEHICLE_RD003,
        sessionId: SESSION_RD003,
        referenceDriveId: rd003.referenceDriveId,
        uniqueUtcTripWindowPossible: 'NO_VALIDATED_GLOBAL_CHRONOLOGY',
        note: 'Reference-capture session; no trip_id in DI-EV-0027 capture report. P21 forensic loader expects trip+workItem pin.',
      },
      independence: v02Usage,
    },
    rd004VideoGroundTruth: rd004,
    recoveryMatrix: matrix,
    recoverableCases: recoverable,
    partiallyRecoverableCases: partial,
    newCaptureRequiredCases: newCap,
    utcSyncPrecision: {
      rd003: '±30s candidate clip start (video instrument clock); multi-clock model PENDING; no CLOCK_BOUNDARY_ELIGIBLE_CLIPS',
      teslaEvGt: '1s visible Berlin labels; sub-second absolute offset not established (kompakt Bericht)',
      rd004SegmentA: 'Video UTC anchored at t=0 via Time.is; providerTimestamp offset INSUFFICIENT_EVIDENCE',
      rd004SegmentB: 'Video anchors HIGH confidence at sparse points; stop timing vs HF NOT validated',
    },
    independentValidationPossibleNow: false,
    minimumNewCapturePlan: {
      principle: 'One new independent drive with documented UTC sync, P21 PRIMARY pin, and pre-declared holdout clips before any v0_2 threshold work.',
      cases: matrix.filter((m) => m.captureProtocolIfNew).map((m) => ({
        caseType: m.caseType,
        protocol: m.captureProtocolIfNew,
      })),
    },
    productionMutations: 'NONE',
    nextSafeAction:
      'Offline: complete RD003 clip-alignment review to VALIDATED status OR schedule single new capture per protocols; then bind P21 pin and replay frozen v0_2 without tuning.',
  };
}
