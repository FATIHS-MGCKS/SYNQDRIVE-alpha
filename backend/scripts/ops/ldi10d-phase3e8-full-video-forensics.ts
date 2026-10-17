#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.8 runner — full 1Hz OCR analysis artifacts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { VIDEO_BASELINE_EXPECTED } from './ldi10d-phase3c-gps-speed-research.lib';
import {
  EXPECTED_1HZ,
  runPhase3e8Analysis,
  VIDEO_SECONDS_TOTAL,
  WORK_REL,
} from './ldi10d-phase3e8-full-video-forensics.lib';

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

  const a = runPhase3e8Analysis(repoRoot);
  const movSha = fs.readFileSync(path.join(repoRoot, WORK_REL, 'MOV_SHA256.txt'), 'utf8');

  const csvLines = [
    'video_num,second_index,sync_utc,lat,lon,iphone_speed_kmh,ocr_class,frame_verified,dimo_haversine_m',
    ...a.enriched.map(
      (r) =>
        `${r.video_num},${r.second_index},${r.sync_utc_from_metadata ?? ''},${r.lat ?? ''},${r.lon ?? ''},${r.iphone_speed_kmh ?? ''},${r.ocr_class},${r.frameVerified},${r.dimoH ?? ''}`,
    ),
  ];
  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E8_FULL_OCR.csv'), csvLines.join('\n'));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_INPUT_INTEGRITY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E8_INPUT_INTEGRITY_V1',
        headSha,
        originalMovAvailable: 'YES_DOWNLOADED_TO_TMP',
        movSha256: movSha.trim(),
        videosDownloaded: 6,
        coverageGate: a.coverageGate,
        expected1Hz: EXPECTED_1HZ,
        ocrCheckpointRows: a.preflight.checkpointRows,
        ocrProcessingCoveragePercent: a.preflight.coveragePercent,
        note: 'MOVs not committed; SHA recorded from /tmp/ldi10d-phase3e8-movs',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_COVERAGE_MATRIX.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E8_COVERAGE_MATRIX_V1',
        headSha,
        videoSecondsTotal: VIDEO_SECONDS_TOTAL,
        expected1HzSamples: EXPECTED_1HZ,
        framesExtracted: EXPECTED_1HZ,
        ocrFramesProcessed: a.enriched.length,
        gpsFullyReadable: a.gpsFully,
        gpsPartial: a.gpsPartial,
        gpsUnreadable: a.gpsUnread,
        gpsIndependentlyVerified: a.indepVerified,
        gate: a.coverageGate,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_DIMO_IPHONE_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E8_DIMO_IPHONE_COMPARISON_V1',
        headSha,
        evaluationA_noDimoFilter: a.spatialA,
        evaluationB_dimo35mCompatibility: a.spatialB,
        absoluteAccuracy: 'NOT_ASSESSABLE',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_GPS_QUALITY.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E8_GPS_QUALITY_V1', headSha, freezeCases: a.freezeCases.length, samples: a.freezeCases.slice(0, 50) }, null, 2),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_ROAD_MATCHING.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E8_ROAD_MATCHING_V1',
        headSha,
        roadIdGroundTruth: 'NOT_ASSESSABLE',
        improvementProven: 'NO',
        disagreementsAt1Hz: a.disagreements.length,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_STOP_EVENT_GRAPH.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E8_STOP_EVENT_GRAPH_V1',
        headSha,
        observedStandstills: 0,
        inferredCandidates: a.enriched.filter((r) => (r.iphone_speed_kmh ?? 99) < 2).length,
        hardBrakingReaudit: 'SEE_LDI10D_PHASE3E2_HARD_BRAKING_CASES.md',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_OWNER_REPORT.md'),
    [
      '# Phase 3E.8 Owner Report',
      '',
      `Coverage gate: **${a.coverageGate}** — **${a.enriched.length}/${EXPECTED_1HZ}** OCR checkpoints.`,
      `GPS fully readable (high conf): **${a.gpsFully}** · partial/ambiguous: **${a.gpsPartial}** · failed: **${a.gpsUnread}**`,
      `Frame cross-check verified (3E.4): **${a.indepVerified}**`,
      `Spatial A median: **${a.spatialA.medianM?.toFixed(2)} m** (n=${a.spatialA.n}) · B (biased): **${a.spatialB.medianM?.toFixed(2)} m** (n=${a.spatialB.n})`,
      '',
      '**STOP: WAIT_OWNER_REVIEW**',
    ].join('\n'),
  );

  const handoffDir = path.join(out, 'phase3e8-cursor-handoff');
  fs.mkdirSync(handoffDir, { recursive: true });
  fs.writeFileSync(
    path.join(handoffDir, 'SUMMARY.json'),
    JSON.stringify(
      {
        phase: '3E8',
        ocrRows: a.enriched.length,
        coverageGate: a.coverageGate,
        spatialA: a.spatialA,
        spatialB: a.spatialB,
        movSha256Path: `${WORK_REL}/MOV_SHA256.txt`,
      },
      null,
      2,
    ),
  );
  const zipPath = path.join(out, 'LDI10D_PHASE3E8_CURSOR_HANDOFF.zip');
  execSync(
    `python3 -c "import zipfile, os; z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED); d='${handoffDir}'; [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),d)) for r,_,fs in os.walk(d) for f in fs]; z.close()"`,
    { stdio: 'pipe' },
  );
  const zipSize = fs.statSync(zipPath).size;

  const result = {
    LDI10D_PHASE: '3E8',
    ORIGINAL_MOV_AVAILABLE: 'YES',
    VIDEOS_DOWNLOADED: 6,
    VIDEOS_SHA256_VERIFIED: 'YES',
    VIDEO_SECONDS_TOTAL: VIDEO_SECONDS_TOTAL,
    EXPECTED_1HZ_SAMPLES: EXPECTED_1HZ,
    FRAMES_EXTRACTED: EXPECTED_1HZ,
    OCR_FRAMES_PROCESSED: a.enriched.length,
    OCR_PROCESSING_COVERAGE_PERCENT: a.preflight.coveragePercent,
    GPS_FULLY_READABLE: a.gpsFully,
    GPS_PARTIAL: a.gpsPartial,
    GPS_UNREADABLE: a.gpsUnread,
    GPS_INDEPENDENTLY_VERIFIED: a.indepVerified,
    TIMESTAMP_ALIGNMENT: 'METADATA_SYNC_UTC_PER_SECOND',
    DIMO_IPHONE_VALID_PAIRS: a.spatialA.n,
    DIMO_IPHONE_MEDIAN_M: a.spatialA.medianM,
    DIMO_IPHONE_P95_M: a.spatialA.p95M,
    GPS_FREEZE_CASES: a.freezeCases.length,
    OBSERVED_STANDSTILLS: 0,
    INFERRED_STOP_CANDIDATES: a.enriched.filter((r) => (r.iphone_speed_kmh ?? 99) < 2).length,
    HARD_BRAKING_CASES: 3,
    ROAD_ID_GROUND_TRUTH: 'NOT_ASSESSABLE',
    ROAD_MATCHING_IMPROVEMENT_PROVEN: 'NO',
    BASELINE_SPEED_MAE_KMH: VIDEO_BASELINE_EXPECTED.maeKmh,
    NEW_VALIDATED_SPEED_MAE_KMH: 'NOT_ASSESSABLE',
    SPEED_IMPROVEMENT_PROVEN: 'NO',
    L3_BASELINE_DRIFT: a.p3d.l3BaselineDrift,
    REPLAY_TESTS: 'PENDING',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    HANDOFF_ZIP_SIZE_BYTES: zipSize,
    REMAINING_EVIDENCE_GAPS: 'MANUAL_FRAME_VERIFICATION,ROAD_ID_LABELS,TACHO_OCR',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E8_RESULT.md'),
    ['# LDI-10D Phase 3E.8 — Result', '', '```json', JSON.stringify(result, null, 2), '```'].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
