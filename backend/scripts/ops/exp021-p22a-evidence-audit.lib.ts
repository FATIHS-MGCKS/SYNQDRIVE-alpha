/**
 * EXP021 P22A — independent halt validation evidence audit (read-only, no detector changes).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildFreezeManifest } from './exp021-retrospective-halt-v0_2-freeze-review.lib';
import { EXP021_EV_GT_REFERENCE } from './exp021-ev-ground-truth-forensic-export.lib';

export const P22A_SCHEMA = 'EXP021_P22A_INDEPENDENT_VALIDATION_V1';

export type ObservationCoverage = 'FULLY_OBSERVED' | 'PARTIALLY_OBSERVED' | 'UNKNOWN_DOMINANT';

export type VideoEvidenceQuality =
  | 'INDEPENDENT_NOT_AVAILABLE'
  | 'DEVELOPMENT_LEAKAGE_RISK'
  | 'CANDIDATE_UNALIGNED'
  | 'CANDIDATE_SPARSE_ALIGNED_FIT_ONLY';

export type P22ACaseType =
  | 'HALT_WITHOUT_SIGNAL'
  | 'SLOW_ROLL_NO_FULL_HALT'
  | 'STOP_AND_GO'
  | 'MOVEMENT_DURING_GAP'
  | 'MANEUVER_RETURN_SAME_POINT';

export type P22AGroundTruthLabel =
  | 'HALT_PRESENT'
  | 'CONTINUOUS_HALT'
  | 'SLOW_ROLL'
  | 'STOP_AND_GO'
  | 'MOVEMENT_DURING_GAP'
  | 'MANEUVER_RETURN_SAME_POINT'
  | 'NOT_DISTINGUISHABLE';

export type VideoAnchorCandidate = {
  caseType: P22ACaseType;
  anchorId: string;
  datasetPartition: 'DEVELOPMENT_TESLA_EV_GT' | 'HOLDOUT_CONTAMINATED' | 'INDEPENDENT_CANDIDATE_RD003' | 'INDEPENDENT_CANDIDATE_RD004';
  tripId: string | null;
  utcWindow: { from: string | null; to: string | null; note?: string };
  videoSource: string;
  videoTimeOffset: string;
  tachoObserved: string;
  labelCoverage: ObservationCoverage;
  independentEvidenceQuality: VideoEvidenceQuality;
  leakageNotes: string[];
  p22aLabelsAssertable: P22AGroundTruthLabel[];
};

const BERLIN_OCT16_TO_UTC: Record<string, string> = {
  '05:40:19': '2026-10-16T03:40:19Z',
  '05:40:49': '2026-10-16T03:40:49Z',
  '05:41:50': '2026-10-16T03:41:50Z',
  '05:42:29': '2026-10-16T03:42:29Z',
  '05:42:50': '2026-10-16T03:42:50Z',
  '05:42:57': '2026-10-16T03:42:57Z',
  '05:43:43': '2026-10-16T03:43:43Z',
  '05:44:35': '2026-10-16T03:44:35Z',
  '05:54:20': '2026-10-16T03:54:20Z',
  '05:54:49': '2026-10-16T03:54:49Z',
};

function berlinRangeToUtc(startBerlin: string, endBerlin: string): { from: string; to: string } {
  const from = BERLIN_OCT16_TO_UTC[startBerlin] ?? null;
  const to = BERLIN_OCT16_TO_UTC[endBerlin] ?? null;
  if (!from || !to) {
    return {
      from: from ?? `UNMAPPED_BERLIN_${startBerlin}`,
      to: to ?? `UNMAPPED_BERLIN_${endBerlin}`,
    };
  }
  return { from, to };
}

export function buildVideoAnchorInventory(repoRoot: string): VideoAnchorCandidate[] {
  const kompakt = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16',
  );
  const events = JSON.parse(
    fs.readFileSync(path.join(kompakt, 'analysis/results/events.json'), 'utf8'),
  ) as Array<{
    id: string;
    startBerlin: string;
    endBerlin: string;
    type: string;
    evidence: string;
  }>;

  const devTrip = EXP021_EV_GT_REFERENCE.tripId;
  const anchors: VideoAnchorCandidate[] = [];

  const mapDev = (
    caseType: P22ACaseType,
    anchorId: string,
    eventId: string,
    partition: VideoAnchorCandidate['datasetPartition'],
    clip: string,
    offset: string,
    tacho: string,
    coverage: ObservationCoverage,
    labels: P22AGroundTruthLabel[],
    extraLeakage: string[] = [],
  ) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const utc = berlinRangeToUtc(ev.startBerlin, ev.endBerlin);
    anchors.push({
      caseType,
      anchorId,
      datasetPartition: partition,
      tripId: devTrip,
      utcWindow: { ...utc, note: 'Berlin CEST → UTC via fixed Oct-16 offset table in audit lib' },
      videoSource: clip,
      videoTimeOffset: offset,
      tachoObserved: tacho,
      labelCoverage: coverage,
      independentEvidenceQuality:
        partition === 'HOLDOUT_CONTAMINATED'
          ? 'DEVELOPMENT_LEAKAGE_RISK'
          : 'DEVELOPMENT_LEAKAGE_RISK',
      leakageNotes: [
        'Tesla EV-GT reference used for detector development and freeze review — not an independent blind holdout.',
        'Map/traffic-signal context explicitly excluded from ground truth per P22A rules.',
        ...extraLeakage,
      ],
      p22aLabelsAssertable: labels,
    });
  };

  mapDev(
    'HALT_WITHOUT_SIGNAL',
    'DEV_TESLA_E02_LONG_ZERO_TACHO',
    'E02',
    'DEVELOPMENT_TESLA_EV_GT',
    'TC_00063.MOV (holdout-contaminated)',
    'visible Berlin 05:40:19–49',
    '31× tacho 0 (visually reviewed)',
    'PARTIALLY_OBSERVED',
    ['HALT_PRESENT', 'NOT_DISTINGUISHABLE'],
    ['Holdout clip TC_00063 named in evaluation-protocol.json — hypotheses already influenced.'],
  );
  mapDev(
    'SLOW_ROLL_NO_FULL_HALT',
    'DEV_TESLA_E03_DECEL_TO_8',
    'E03',
    'DEVELOPMENT_TESLA_EV_GT',
    'TC_00063.MOV',
    '05:41:42–47 Berlin',
    '56→8 km/h tacho, no claim of full standstill',
    'FULLY_OBSERVED',
    ['SLOW_ROLL', 'NOT_DISTINGUISHABLE'],
  );
  mapDev(
    'STOP_AND_GO',
    'DEV_TESLA_E07_POST_GAP_ACCEL',
    'E07',
    'DEVELOPMENT_TESLA_EV_GT',
    'TC_00064.MOV',
    '05:44:36–41 Berlin',
    '6→42 km/h after E06 gap',
    'PARTIALLY_OBSERVED',
    ['MOVEMENT_DURING_GAP', 'NOT_DISTINGUISHABLE'],
  );
  mapDev(
    'MOVEMENT_DURING_GAP',
    'DEV_TESLA_E06_ZERO_WITH_TACHO_UNKNOWN',
    'E06',
    'DEVELOPMENT_TESLA_EV_GT',
    'TC_00064.MOV',
    '05:43:43–44:35 Berlin',
    '46×0; 05:44:03–09 UNKNOWN; 1×>5 in gap window per ABC',
    'PARTIALLY_OBSERVED',
    ['HALT_PRESENT', 'MOVEMENT_DURING_GAP', 'NOT_DISTINGUISHABLE'],
  );
  mapDev(
    'MANEUVER_RETURN_SAME_POINT',
    'DEV_TESLA_E01_DEPARTURE_REVERSE',
    'E01',
    'DEVELOPMENT_TESLA_EV_GT',
    'TC_00062.MOV',
    'first visible 05:37:41+',
    'tacho 0 + reverse camera; first motion time NOT_DETERMINED',
    'PARTIALLY_OBSERVED',
    ['NOT_DISTINGUISHABLE'],
  );
  mapDev(
    'MANEUVER_RETURN_SAME_POINT',
    'DEV_TESLA_E12_PARKING_END',
    'E12',
    'HOLDOUT_CONTAMINATED',
    'TC_00067.MOV (holdout-adjacent)',
    '05:54:20–49 Berlin',
    'maneuver + DI numeric gap; video ends before trip end',
    'UNKNOWN_DOMINANT',
    ['MANEUVER_RETURN_SAME_POINT', 'NOT_DISTINGUISHABLE'],
    ['Holdout policy: TC_00066 holdout; E12 in late clip — still same development drive.'],
  );

  const rd003Path = path.join(repoRoot, 'docs/audits/data/rd003-video-ground-truth-observations.json');
  if (fs.existsSync(rd003Path)) {
    const rd003 = JSON.parse(fs.readFileSync(rd003Path, 'utf8')) as {
      sessionId: string;
      clips: Array<{
        clipId: string;
        fileName: string;
        behavioralSummary: string;
        candidateAbsoluteTime: { candidateStartUtc?: string | null; status: string };
      }>;
    };
    const rd003Cases: Array<{ clipId: string; caseType: P22ACaseType; summary: string }> = [
      { clipId: 'RD003_GT_CLIP_001', caseType: 'STOP_AND_GO', summary: 'STOP → LAUNCH → acceleration' },
      { clipId: 'RD003_GT_CLIP_005', caseType: 'STOP_AND_GO', summary: 'DECELERATION → STOP → acceleration' },
      { clipId: 'RD003_GT_CLIP_009', caseType: 'MANEUVER_RETURN_SAME_POINT', summary: 'REVERSE → STOP → forward launch' },
      { clipId: 'RD003_GT_CLIP_002', caseType: 'SLOW_ROLL_NO_FULL_HALT', summary: 'STABLE_CRUISE negative control' },
    ];
    for (const c of rd003Cases) {
      const clip = rd003.clips.find((x) => x.clipId === c.clipId);
      if (!clip) continue;
      anchors.push({
        caseType: c.caseType,
        anchorId: `RD003_${clip.clipId}`,
        datasetPartition: 'INDEPENDENT_CANDIDATE_RD003',
        tripId: null,
        utcWindow: {
          from: clip.candidateAbsoluteTime.candidateStartUtc ?? null,
          to: null,
          note: 'RD003: CANDIDATE_VIDEO_CLOCK only; INDEPENDENT_ABSOLUTE_ACCURACY_VALIDATED=NO per RD003_RETROSPECTIVE',
        },
        videoSource: clip.fileName,
        videoTimeOffset: 'sparse 1 Hz video-time observations (not full frame coverage)',
        tachoObserved: c.summary,
        labelCoverage: 'PARTIALLY_OBSERVED',
        independentEvidenceQuality: 'CANDIDATE_UNALIGNED',
        leakageNotes: [
          'Not wired to P21 forensic loader / v0_2 gap replay on this audit pass.',
          'GROUND_TRUTH_VALIDATED=NO at ingestion (DI-EV-0034B).',
          'Alignment fit ≠ independent proof (RD003 §Video/alignment chain).',
        ],
        p22aLabelsAssertable: ['NOT_DISTINGUISHABLE'],
      });
    }
  }

  anchors.push({
    caseType: 'MOVEMENT_DURING_GAP',
    anchorId: 'RD004_B_LATE_BUCKET_RECOVERY',
    datasetPartition: 'INDEPENDENT_CANDIDATE_RD004',
    tripId: null,
    utcWindow: { from: null, to: null, note: 'Segment B exact-window replay — telemetry timing, not halt video GT' },
    videoSource: 'RD004-B segment exports (alignment segments)',
    videoTimeOffset: 'NOT_ALIGNED_FOR_HALT_LABELS',
    tachoObserved: 'N/A — documents provider late arrival + watermark gaps',
    labelCoverage: 'UNKNOWN_DOMINANT',
    independentEvidenceQuality: 'CANDIDATE_SPARSE_ALIGNED_FIT_ONLY',
    leakageNotes: [
      'RD004 proves capture/recovery mechanics; does not supply per-second halt labels for v0_2.',
      '26 buckets permanently excluded under overlap-only policy (RD004-B.4).',
    ],
    p22aLabelsAssertable: ['MOVEMENT_DURING_GAP', 'NOT_DISTINGUISHABLE'],
  });

  return anchors;
}

export function buildP22AValidationPayload(repoRoot: string, headSha: string, prNumber: number) {
  const freeze = buildFreezeManifest(repoRoot);
  const manifestHash = freeze.parameterSnapshotHash as string;
  const anchors = buildVideoAnchorInventory(repoRoot);

  const independentAnchors = anchors.filter(
    (a) =>
      a.datasetPartition === 'INDEPENDENT_CANDIDATE_RD003' ||
      a.datasetPartition === 'INDEPENDENT_CANDIDATE_RD004',
  );
  const developmentAnchors = anchors.filter((a) => a.datasetPartition.startsWith('DEVELOPMENT') || a.datasetPartition === 'HOLDOUT_CONTAMINATED');

  const caseTypes: P22ACaseType[] = [
    'HALT_WITHOUT_SIGNAL',
    'SLOW_ROLL_NO_FULL_HALT',
    'STOP_AND_GO',
    'MOVEMENT_DURING_GAP',
    'MANEUVER_RETURN_SAME_POINT',
  ];

  const validatedCounts = {
    HALT_WITHOUT_SIGNAL: 0,
    SLOW_ROLL_NO_FULL_HALT: 0,
    STOP_AND_GO: 0,
    MOVEMENT_DURING_GAP: 0,
    MANEUVER_RETURN_SAME_POINT: 0,
  };

  const transferPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-retrospective-halt-transferability/TRANSFERABILITY_REPORT.json',
  );
  let transferabilityTripCount = 0;
  if (fs.existsSync(transferPath)) {
    const tr = JSON.parse(fs.readFileSync(transferPath, 'utf8')) as { tripCount: number };
    transferabilityTripCount = tr.tripCount;
  }

  const developmentDiagnostics = {
    source: 'forensic-readonly-exports-2026-10-16-retrospective-halt-v2-freeze/REVIEW_SUMMARY.md',
    notCountedAsIndependentValidation: true,
    likelyHaltWithoutVideoTachoInGap: ['GAP_EVT_002', 'GAP_EVT_003'],
    videoSupportedLikelyHalt: ['GAP_EVT_005', 'GAP_EVT_007'],
    videoNotDecisiveLikelyHalt: ['GAP_EVT_006', 'GAP_EVT_008'],
    falseHaltSignalsNaturalGaps: {
      likelyHaltWithoutOverlappingMainHaltWindow: 2,
      likelyHaltWithVideoContradictionOrNoStopEvidence: 1,
    },
    interpretation:
      'Development-only counters — do not populate P22A independent FALSE_HALT_COUNT without blind labels.',
  };

  const noValidatedCases =
    Object.values(validatedCounts).every((n) => n === 0) &&
    !anchors.some(
      (a) =>
        a.tripId != null &&
        (a.datasetPartition === 'INDEPENDENT_CANDIDATE_RD003' ||
          a.datasetPartition === 'INDEPENDENT_CANDIDATE_RD004') &&
        a.independentEvidenceQuality === 'INDEPENDENT_NOT_AVAILABLE',
    );

  const p22aResult = noValidatedCases ? 'BLOCKED_INSUFFICIENT_GROUND_TRUTH' : 'PARTIAL';

  return {
    schema: P22A_SCHEMA,
    observedAtUtc: new Date().toISOString(),
    prNumber,
    headSha,
    v0_2: {
      version: 'EXP021_RETROSPECTIVE_HALT_PROTOTYPE_V0_2',
      parameterSnapshotHash: manifestHash,
      parameterSnapshotHashVerifiedUnchanged: manifestHash === 'dc4339e7b3687ef613b59e3ee9fe75b7a3d885dce5f5884735421e58a46d4ab7',
      detectorCodeModifiedInP22A: false,
    },
    leakageProtection: {
      teslaReferencePartition: 'DEVELOPMENT_ONLY',
      holdoutClipsContaminated: ['TC_00063.MOV', 'TC_00066.MOV'],
      mapContextAsGroundTruth: 'FORBIDDEN',
      thresholdTuningOnValidationCases: 'FORBIDDEN',
    },
    p22aResult,
    videoAnchorInventory: anchors,
    independentValidation: {
      availableIndependentVideoCases: independentAnchors.length,
      validatedHaltCases: validatedCounts.HALT_WITHOUT_SIGNAL,
      validatedSlowRollCases: validatedCounts.SLOW_ROLL_NO_FULL_HALT,
      validatedStopAndGoCases: validatedCounts.STOP_AND_GO,
      validatedMovementGapCases: validatedCounts.MOVEMENT_DURING_GAP,
      validatedManeuverCases: validatedCounts.MANEUVER_RETURN_SAME_POINT,
      falseHaltCount: 0,
      falseMovementCount: 0,
      unknownCount: independentAnchors.length,
      groundTruthCoverage: '0 independent cases with trip-aligned v0_2 replay + validated per-second halt labels',
      metricsComputed: [],
    },
    developmentDiagnostics,
    transferability: {
      offlineTripCount: transferabilityTripCount,
      verdict: 'ROBUSTNESS_SIGNAL_ONLY',
      hitRateClaim: 'FORBIDDEN_WITHOUT_INDEPENDENT_VIDEO',
    },
    productionMutations: 'NONE',
    nextSafeAction:
      'Capture new independent video with sub-minute UTC alignment; label five case types; bind to P21 pin; replay v0_2 without threshold changes.',
  };
}
