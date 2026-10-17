#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.4 runner — iPhone GPS overlay forensics (offline).
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
  verifyPhase3e3Preflight,
} from './ldi10d-phase3e3-road-matching-accuracy.lib';
import { VIDEO_BASELINE_EXPECTED } from './ldi10d-phase3c-gps-speed-research.lib';
import {
  REVIEW_PACK_REL,
  runPhase3e4Analysis,
  verifyPhase3e4Preflight,
  loadVideoMetadata,
} from './ldi10d-phase3e4-iphone-gps-forensics.lib';

const VITERBI_ASSOCIATED = 300;
const VITERBI_AMBIGUOUS = 357;
const VITERBI_UNKNOWN = 479;

const GOOGLE_DRIVE_SOURCES: Array<{ video: string; url: string }> = [
  {
    video: 'TC_00062.MOV',
    url: 'https://drive.google.com/file/d/1haghGlbC1eb1NegQJmGQrs0rmItTXynw/view?usp=drivesdk',
  },
  {
    video: 'TC_00063.MOV',
    url: 'https://drive.google.com/file/d/15hlDvzC1fo2art75pEd2GrmbS-sQbM8z/view?usp=drivesdk',
  },
  {
    video: 'TC_00064.MOV',
    url: 'https://drive.google.com/file/d/1Rvy3PaVbf8OLd753MEBriZMwX6v2SBAJ/view?usp=drivesdk',
  },
  {
    video: 'TC_00065.MOV',
    url: 'https://drive.google.com/file/d/18MRwZbBHyAToXbKUOtaFCr0ve5R9Vdcm/view?usp=drivesdk',
  },
  {
    video: 'TC_00066.MOV',
    url: 'https://drive.google.com/file/d/18xdPmP8MkU7RqvHqisRezeiZJ6rV1U67/view?usp=drivesdk',
  },
  {
    video: 'TC_00067.MOV',
    url: 'https://drive.google.com/file/d/1iyZU1c4SCX4g031W4aBJRQheH_87gHSo/view?usp=drivesdk',
  },
];

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function main(): void {
  const out = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const a = runPhase3e4Analysis(repoRoot);
  if (!a.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E.4', errors: a.preflight.errors }));
    process.exit(1);
  }

  const packDir = path.join(repoRoot, REVIEW_PACK_REL);
  const frameHashes = fs
    .readdirSync(path.join(packDir, 'frames'))
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => ({ file: `frames/${f}`, sha256: sha256File(path.join(packDir, 'frames', f)) }));

  const videoSourcesAccessible = a.preflight.movFilesPresent ? 'MOV_IN_REVIEW_PACK' : 'FRAMES_ONLY';

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_VIDEO_INVENTORY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_VIDEO_INVENTORY_V1',
        headSha,
        videoSourcesAccessible,
        googleDriveSources: GOOGLE_DRIVE_SOURCES,
        metadata: loadVideoMetadata(repoRoot),
        movFilesInRepository: a.preflight.movFilesPresent,
        sampledFrames: frameHashes,
        note: 'Full MOV extraction requires owner-provided files or authenticated Drive fetch; not performed in CI.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_VIDEO_INVENTORY.md'),
    [
      '# Video inventory — Phase 3E.4',
      '',
      `| Access | **${videoSourcesAccessible}** |`,
      `| Sampled frames | ${a.preflight.frameCount} |`,
      `| MOV in repo | ${a.preflight.movFilesPresent ? 'YES' : 'NO'} |`,
      '',
      'Google Drive originals are listed in `LDI10D_PHASE3E4_VIDEO_INVENTORY.json`.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_OCR_METHODOLOGY.md'),
    [
      '# OCR methodology — Phase 3E.4',
      '',
      '1. Crop top-right overlay ROI: `ffmpeg -vf crop=iw*0.42:ih*0.22:iw*0.56:0`.',
      '2. Tesseract `eng` on cropped PNG (no silent digit correction).',
      '3. Heuristic parse (`parseOverlayOcrText`) for CEST timestamp, lat/lon (Kassel corridor `51.x`), altitude, km/h.',
      '4. Uncertain fields recorded in observation `ocrRawSnippet` and `ocrStatus`.',
      '5. One human-verified point from preliminary audit (TC_00062 @ 30s) included separately.',
      '',
      '**Limitation:** Frame snapshots ≠ GPS fix cadence; `gpsFixUpdate` remains `UNKNOWN_FRAME_SNAPSHOT`.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_OCR_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_OCR_VALIDATION_V1',
        headSha,
        framesProcessed: a.preflight.frameCount,
        observationsTotal: a.observations.length,
        ocrVerifiedOrHuman: a.ocrVerified,
        byStatus: a.observations.reduce(
          (acc, o) => {
            acc[o.ocrStatus] = (acc[o.ocrStatus] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_IPHONE_GPS_OBSERVATIONS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_IPHONE_GPS_OBSERVATIONS_V1',
        headSha,
        tripId: '358d0158-b2a9-47ed-af26-33926c5770b4',
        dimoTokenId: 186946,
        observations: a.observations,
        perSecondCoverageNote:
          'Sparse frame samples only; not a continuous per-second iPhone track. Full MOV OCR pipeline required for complete coverage.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_TIMESTAMP_ALIGNMENT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_TIMESTAMP_ALIGNMENT_V1',
        headSha,
        cestAssumption: 'Overlay timestamps parsed as Europe/Berlin CEST (+02:00) pending systematic clock audit.',
        status: a.spatial.timestampAlignmentStatus,
        meanAbsOverlayVsMetadataOffsetSec: a.spatial.timestampAlignmentErrorSec,
        pairedSpatialBuckets: a.spatial.pairedFixes.length,
        note: 'No arbitrary shift applied to improve metrics.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_TIMESTAMP_ALIGNMENT.md'),
    [
      '# Timestamp alignment audit',
      '',
      `- Status: **${a.spatial.timestampAlignmentStatus}**`,
      `- Mean |overlay UTC − video-metadata sync UTC|: ${a.spatial.timestampAlignmentErrorSec ?? 'NOT_ASSESSABLE'} s`,
      '- Video creation_time_utc treated as t=0 anchor per MOV metadata file.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_SPATIAL_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_SPATIAL_COMPARISON_V1',
        headSha,
        pairedFixes: a.spatial.pairedFixes,
        haversineM: {
          median: a.spatial.medianM,
          p90: a.spatial.p90M,
          p95: a.spatial.p95M,
          max: a.spatial.maxM,
          robustPairCount: a.spatial.robustPairCount,
          outlierPairCount: a.spatial.outlierPairCount,
          outlierThresholdM: 500,
        },
        roadIdentityGroundTruth: 'NOT_ASSESSABLE',
        note: 'iPhone overlay coordinates are independent spatial reference, not road-ID ground truth.',
      },
      null,
      2,
    ),
  );

  const p33 = verifyPhase3e3Preflight(repoRoot);
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_ROAD_MATCHING_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_ROAD_MATCHING_COMPARISON_V1',
        headSha,
        frozenOsmSha256: p33.teslaOsmSha256,
        baseline: { ASSOCIATED: BASELINE_ASSOCIATED, AMBIGUOUS: BASELINE_AMBIGUOUS, UNKNOWN: BASELINE_UNKNOWN },
        viterbi: { ASSOCIATED: VITERBI_ASSOCIATED, AMBIGUOUS: VITERBI_AMBIGUOUS, UNKNOWN: VITERBI_UNKNOWN },
        accuracyVsIphoneRoadId: 'NOT_ASSESSABLE',
        improvementProven: a.roadMatchingImprovementProven,
        note: 'More ASSOCIATED buckets do not prove better matching without independent road-ID labels.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_SPEED_ACCURACY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_SPEED_ACCURACY_V1',
        headSha,
        trustedTachoReference: VIDEO_BASELINE_EXPECTED,
        l3BaselineMaeKmh: a.l3Mae,
        bestNewCandidateMaeKmh: 'NOT_ASSESSABLE',
        speedImprovementProven: a.speedImprovementProven,
        biasHypothesesResearchOnly: [
          'coordinate_quantization',
          'sampling_cadence',
          'temporal_windowing',
          'gps_smoothing',
          'motion_gating',
          'low_speed_bias',
          'accel_decel_lag',
          'coordinate_freezes',
          'chord_distance_on_curves',
          'gps_accuracy_degradation',
        ],
        iphoneSpeedVsL3: 'NOT_ASSESSABLE_INSUFFICIENT_PAIRED_SAMPLES',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_CONTEXTUAL_EVENTS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_CONTEXTUAL_EVENTS_V1',
        headSha,
        observedStandstills: a.observedStandstills,
        inferredStopCandidates: a.inferredStopCandidates,
        labeling: {
          OBSERVED: 0,
          CONTEXT_SUPPORTED: 0,
          INFERRED_CANDIDATE: a.inferredStopCandidates,
          UNKNOWN: 'MAJORITY',
          QC_BLOCKED: 'N/A',
        },
        note: 'Low iPhone overlay speed on a frame does not prove sustained standstill; no production event mutation.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_FAILURE_REGISTER.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_FAILURE_REGISTER_V1',
        headSha,
        items: [
          {
            id: 'FM_MOV_UNAVAILABLE',
            severity: 'BLOCKER_FULL_EXTRACTION',
            description: 'Original MOV files not in repository; Google Drive requires owner auth.',
          },
          {
            id: 'FM_SPARSE_FRAMES',
            severity: 'LIMITATION',
            description: '18 sampled frames insufficient for per-second GPS track or road-ID validation.',
          },
          {
            id: 'FM_OCR_UNCERTAINTY',
            severity: 'LIMITATION',
            description: 'OCR may misread digits; uncertain fields not auto-corrected.',
          },
          {
            id: 'FM_ROAD_ID_GT',
            severity: 'GAP',
            description: 'No independent road-identity ground truth for accuracy proof.',
          },
        ],
      },
      null,
      2,
    ),
  );

  const manifestFiles = [
    'LDI10D_PHASE3E4_VIDEO_INVENTORY.json',
    'LDI10D_PHASE3E4_IPHONE_GPS_OBSERVATIONS.json',
    'LDI10D_PHASE3E4_SPATIAL_COMPARISON.json',
    'LDI10D_PHASE3E4_OCR_VALIDATION.json',
  ];
  const manifest = manifestFiles.map((f) => ({ file: f, sha256: sha256File(path.join(out, f)) }));
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_PROVENANCE_MANIFEST.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E4_PROVENANCE_V1', headSha, reviewPack: REVIEW_PACK_REL, artifacts: manifest }, null, 2),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_OWNER_DECISION.md'),
    [
      '# Owner decision — Phase 3E.4',
      '',
      '| Gate | Result |',
      '| --- | --- |',
      `| Video sources | ${videoSourcesAccessible} |`,
      `| Independent road-ID GT | **NOT_ASSESSABLE** |`,
      `| Viterbi accuracy proven | **NO** (unchanged from 3E.3) |`,
      `| L3 speed improvement | **NO** |`,
      `| Production / QC mutation | **NONE** |`,
      '',
      '**Next:** Provide full MOV files or approved Drive export; run systematic overlay transcription; expand spatial pairing before road-matching or speed tuning claims.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E4_VALIDATION_V1',
        headSha,
        inputIntegrity: a.preflight.inputIntegrity,
        frozenEvidenceMutated: false,
        l3BaselineDrift: a.l3Drift,
        qcMutations: 'NONE',
        productionMutations: 'NONE',
      },
      null,
      2,
    ),
  );

  const result = {
    LDI10D_PHASE: '3E4',
    VIDEO_SOURCES_ACCESSIBLE: videoSourcesAccessible,
    VIDEO_DURATION_TOTAL: a.videoDurationTotal,
    FRAMES_ANALYZED: a.preflight.frameCount,
    GPS_OVERLAY_OBSERVATIONS: a.observations.length,
    GPS_UNIQUE_FIXES: a.uniqueFixes,
    GPS_OCR_VERIFIED: a.ocrVerified,
    TIMESTAMP_ALIGNMENT_STATUS: a.spatial.timestampAlignmentStatus,
    TIMESTAMP_ALIGNMENT_ERROR: a.spatial.timestampAlignmentErrorSec,
    DIMO_IPHONE_PAIRED_FIXES: a.spatial.pairedFixes.length,
    MEDIAN_SPATIAL_DISAGREEMENT_M: a.spatial.medianM,
    P95_SPATIAL_DISAGREEMENT_M: a.spatial.p95M,
    ROAD_ID_GROUND_TRUTH_STATUS: a.roadIdStatus,
    BASELINE_ROAD_MATCHING_ACCURACY: 'NOT_ASSESSABLE',
    VITERBI_ROAD_MATCHING_ACCURACY: 'NOT_ASSESSABLE',
    ROAD_MATCHING_IMPROVEMENT_PROVEN: a.roadMatchingImprovementProven,
    L3_BASELINE_MAE_KMH: a.l3Mae,
    BEST_NEW_CANDIDATE_MAE_KMH: 'NOT_ASSESSABLE',
    SPEED_ACCURACY_IMPROVEMENT_PROVEN: a.speedImprovementProven,
    OBSERVED_STANDSTILLS: a.observedStandstills,
    INFERRED_STOP_CANDIDATES: a.inferredStopCandidates,
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    REPLAY_TESTS: 'PENDING',
    REMAINING_EVIDENCE_GAPS: 'FULL_MOV_OCR_TRACK,ROAD_ID_LABELS,TACHO_OCR',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    STOP: 'WAIT_OWNER_REVIEW',
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E4_RESULT.md'),
    [
      '# LDI-10D Phase 3E.4 — Result',
      '',
      '```json',
      JSON.stringify(result, null, 2),
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase3e4-iphone-gps-forensics',
      'cd backend && npx jest ldi10d-phase3e4 --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
