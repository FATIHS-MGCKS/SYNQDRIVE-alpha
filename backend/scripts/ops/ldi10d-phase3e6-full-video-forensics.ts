#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.6 runner — full-video forensics report (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { loadCommittedFixture } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import { VIDEO_BASELINE_EXPECTED } from './ldi10d-phase3c-gps-speed-research.lib';
import {
  HANDOFF_REL,
  runPhase3e6Analysis,
  VIDEO_SECONDS_TOTAL_PINNED,
} from './ldi10d-phase3e6-full-video-forensics.lib';
import { BASELINE_ASSOCIATED, BASELINE_AMBIGUOUS, BASELINE_UNKNOWN } from './ldi10d-phase3e3-road-matching-accuracy.lib';

const VITERBI_ASSOCIATED = 300;

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const out = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const a = runPhase3e6Analysis(repoRoot);
  if (!a.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E.6', errors: a.preflight.errors }));
    process.exit(1);
  }

  const movAvailable = a.preflight.movPresent ? 'YES' : 'NO';
  const sourceVideo = movAvailable === 'YES' ? 'LOCAL_MOV' : 'SOURCE_VIDEO_UNAVAILABLE';

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_OCR_COVERAGE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_OCR_COVERAGE_V1',
        headSha,
        originalMovAvailable: movAvailable,
        fullVideo1HzOcrCompleted: 'NO',
        reason: 'Handoff documents incomplete 1-Hz OCR; only 206×5s CSV available',
        videoSecondsTotalPinned: VIDEO_SECONDS_TOTAL_PINNED,
        videoSecondsAnalyzedCoverage: '206 sparse samples (~5s cadence), not 1028×1Hz',
        ocrFramesAnalyzed: a.preflight.ocrRowCount,
        handoffScript: `${HANDOFF_REL}/ocr_full.py`,
        framesDirPresent: a.preflight.framesDirPresent,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_OCR_DATASET.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_OCR_DATASET_V1',
        headSha,
        rows: a.classified,
        confidenceNote: 'Uncalibrated; VERIFIED requires Phase 3E.4 frame cross-check ≤15m',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_OCR_FAILURE_REGISTER.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_OCR_FAILURE_REGISTER_V1',
        headSha,
        byConfidence: a.classified.reduce(
          (acc, r) => {
            acc[r.ocrConfidence] = (acc[r.ocrConfidence] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        partialRows: a.classified.filter((r) => r.ocrConfidence === 'PARTIAL').length,
        invalidRows: a.classified.filter((r) => r.ocrConfidence === 'INVALID').length,
        manualReviewRequired: true,
        reviewCropsGenerated: false,
        reason: 'No frame images in handoff ZIP; crops require owner frame archive',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_SPATIAL_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_SPATIAL_COMPARISON_V1',
        headSha,
        evaluationA_independentQualityFiltered: {
          description: 'HIGH_CONFIDENCE or VERIFIED OCR; NO DIMO agreement filter',
          selectionBias: 'NONE_ON_DIMO_DISTANCE',
          stats: a.spatialA,
        },
        evaluationB_historicalCompatibility: {
          description: 'Reproduces Phase 3E.5 verified set (DIMO ≤35m and related gates)',
          selectionBias: 'DIMO_AGREEMENT_FILTER_PRESENT',
          stats: a.spatialB,
          pinnedPairCount: a.compatVerifiedCount,
        },
        note: 'Two agreeing GPS traces do not establish absolute ground truth',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_TIMESTAMP_SYNC.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_TIMESTAMP_SYNC_V1',
        headSha,
        overlayUtcProvenance: 'OCR CEST→UTC from ChatGPT pack',
        dimoJoinWindowSec: 2,
        offsetSensitivityMedianM: a.offsetSensitivity,
        arbitraryShiftApplied: false,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_ROAD_MATCHING_REVIEW.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_ROAD_MATCHING_REVIEW_V1',
        headSha,
        roadIdGroundTruth: 'NOT_ASSESSABLE',
        tripPinnedCounts: {
          baseline: { ASSOCIATED: BASELINE_ASSOCIATED, AMBIGUOUS: BASELINE_AMBIGUOUS, UNKNOWN: BASELINE_UNKNOWN },
          viterbi: { ASSOCIATED: VITERBI_ASSOCIATED },
        },
        baselineViterbiDisagreementsAtCompatibilityIphoneUtc: a.disagreements,
        improvementProven: 'NO',
        independentlyVerifiedRoadCases: 0,
        ambiguousCases: a.disagreements.length,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_SPEED_ACCURACY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_SPEED_ACCURACY_V1',
        headSha,
        pinnedHistoricalBaseline: VIDEO_BASELINE_EXPECTED,
        baselineSpeedMaeKmh: a.baselineMae,
        holdoutTachoWitnessMaeKmh: a.holdoutMae,
        bestValidatedCandidate: a.bestValidatedAlgo,
        speedAccuracyImprovementProven: a.speedImprovementProven,
        comparisonMatrix: a.p3c.comparisonMatrix,
        note: 'Holdout clip split from Phase 3C research; no retuning in 3E.6',
      },
      null,
      2,
    ),
  );

  const freezeStudies = a.freezeCases.map((c, idx) => ({
    caseId: `FREEZE_${idx + 1}`,
    video: c.video,
    offsetS: c.offsetS,
    overlayUtc: c.overlayUtc,
    lat: c.lat,
    lon: c.lon,
    iphoneSpeedKmh: c.iphoneSpeedKmh,
    impliedSpeedFromDisplacementKmh: c.impliedSpeedFromDisplacementKmh,
    dimoHaversineM: c.dimoHaversineM,
    classification: 'GPS_FREEZE_SUSPECTED',
    observedStandstill: 'NO',
    note: 'Repeated coordinates with changing displayed speed; not proof of physical stop',
  }));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_GPS_FREEZE_CASE_STUDIES.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E6_GPS_FREEZE_V1', headSha, cases: freezeStudies }, null, 2),
  );

  const fixture = loadCommittedFixture(repoRoot);
  const ocrByUtc = new Map(
    a.classified.filter((r) => r.overlayUtc).map((r) => [r.overlayUtc!, r]),
  );
  const timeline = fixture.buckets.map((b) => {
    const ocr = ocrByUtc.get(b.bucketLabelUtc);
    return {
      bucketLabelUtc: b.bucketLabelUtc,
      dimoPosition: b.availability,
      l3Kmh: b.pinnedProductionL3Kmh,
      iphoneOcr: ocr
        ? {
            confidence: ocr.ocrConfidence,
            lat: ocr.lat,
            lon: ocr.lon,
            freezeSuspected: ocr.gpsFreezeSuspected,
          }
        : null,
      inferenceLevel: ocr ? 'OBSERVED_SPARSE_OCR' : 'MISSING_OCR',
    };
  });

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_STOP_TIMELINE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_STOP_TIMELINE_V1',
        headSha,
        observedStandstills: 0,
        inferredStopCandidates: a.classified.filter(
          (r) => (r.iphoneSpeedKmh ?? 99) < 2 && r.independentEligible,
        ).length,
        lowSpeedOnly: a.classified.filter(
          (r) => (r.iphoneSpeedKmh ?? 99) < 5 && r.independentEligible,
        ).length,
        labels: ['OBSERVED_STANDSTILL', 'INFERRED_STOP_CANDIDATE', 'LOW_SPEED_ONLY', 'GPS_FREEZE_SUSPECTED', 'UNKNOWN_INSUFFICIENT_EVIDENCE'],
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_EVIDENCE_QUALITY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E6_EVIDENCE_QUALITY_V1',
        headSha,
        perSecondBuckets: timeline.length,
        sparseOcrSeconds: timeline.filter((t) => t.iphoneOcr).length,
        confidenceUncalibrated: true,
        l3BaselineDrift: a.p3d.l3BaselineDrift,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_OWNER_REPORT.md'),
    [
      '# LDI-10D Phase 3E.6 — Owner review',
      '',
      '## Integrity',
      `- INPUT_INTEGRITY: **${a.preflight.inputIntegrity}**`,
      `- ORIGINAL_MOV_AVAILABLE: **${movAvailable}** (${sourceVideo})`,
      `- Full 1-Hz OCR: **NOT COMPLETED** (206×5s handoff only)`,
      '',
      '## Spatial (dual evaluation)',
      `| Set | N | Median m | P95 m |`,
      `| --- | ---: | ---: | ---: |`,
      `| **A** Independent (no DIMO filter) | ${a.spatialA.n} | ${a.spatialA.medianM?.toFixed(2)} | ${a.spatialA.p95M?.toFixed(2)} |`,
      `| **B** 3E.5 compatibility (biased) | ${a.spatialB.n} | ${a.spatialB.medianM?.toFixed(2) ?? 'N/A'} | ${a.spatialB.p95M?.toFixed(2) ?? 'N/A'} |`,
      '',
      '## Road matching',
      '- ROAD_ID_GROUND_TRUTH: **NOT_ASSESSABLE**',
      `- Baseline/Viterbi disagreements at compatibility iPhone UTCs: **${a.disagreements.length}**`,
      '',
      '## Speed',
      `- Pinned L3 MAE (historical): **${VIDEO_BASELINE_EXPECTED.maeKmh}** km/h`,
      `- Holdout witness MAE (3C): **${a.holdoutMae ?? 'N/A'}** · improvement proven: **NO**`,
      '',
      '## Stops / freeze',
      `- GPS freeze cases reviewed: **${freezeStudies.length}**`,
      '- OBSERVED standstills: **0**',
      '',
      '**STOP: WAIT_OWNER_REVIEW**',
      '',
      '```bash',
      'cd backend && npm run ldi10d:phase3e6-full-video-forensics',
      'cd backend && npx jest ldi10d-phase3e6 --runInBand',
      '```',
    ].join('\n'),
  );

  const ocrVerified = a.classified.filter((r) => r.ocrConfidence === 'VERIFIED').length;

  const result = {
    LDI10D_PHASE: '3E6',
    INPUT_INTEGRITY: a.preflight.inputIntegrity,
    ORIGINAL_MOV_AVAILABLE: movAvailable,
    VIDEO_SECONDS_TOTAL: VIDEO_SECONDS_TOTAL_PINNED,
    VIDEO_SECONDS_ANALYZED: 206,
    OCR_FRAMES_ANALYZED: a.preflight.ocrRowCount,
    OCR_GPS_VERIFIED: ocrVerified,
    DIMO_IPHONE_PAIRS_UNFILTERED: a.spatialA.n,
    DIMO_IPHONE_MEDIAN_M: a.spatialA.medianM,
    DIMO_IPHONE_P95_M: a.spatialA.p95M,
    GPS_FREEZE_CASES_REVIEWED: freezeStudies.length,
    OBSERVED_STANDSTILLS: 0,
    INFERRED_STOP_CANDIDATES: a.classified.filter((r) => (r.iphoneSpeedKmh ?? 99) < 2 && r.independentEligible).length,
    ROAD_ID_GROUND_TRUTH_STATUS: 'NOT_ASSESSABLE',
    ROAD_MATCHING_IMPROVEMENT_PROVEN: 'NO',
    BASELINE_SPEED_MAE_KMH: VIDEO_BASELINE_EXPECTED.maeKmh,
    BEST_VALIDATED_SPEED_MAE_KMH: a.holdoutMae ?? 'NOT_ASSESSABLE',
    SPEED_ACCURACY_IMPROVEMENT_PROVEN: 'NO',
    L3_BASELINE_DRIFT: a.p3d.l3BaselineDrift,
    REPLAY_TESTS: 'PENDING',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E6_RESULT.md'),
    ['# LDI-10D Phase 3E.6 — Result', '', '```json', JSON.stringify(result, null, 2), '```'].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
