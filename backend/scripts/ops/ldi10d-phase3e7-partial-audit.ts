#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.7 runner — partial 1Hz audit + cursor handoff pack.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { VIDEO_BASELINE_EXPECTED } from './ldi10d-phase3c-gps-speed-research.lib';
import { PACK_REL, runPhase3e7Analysis, VIDEO_SECONDS_TOTAL } from './ldi10d-phase3e7-partial-audit.lib';
import { BASELINE_ASSOCIATED } from './ldi10d-phase3e3-road-matching-accuracy.lib';

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

  const a = runPhase3e7Analysis(repoRoot);
  if (!a.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E.7', errors: a.preflight.errors }));
    process.exit(1);
  }

  const mov = a.preflight.movPresent ? 'YES' : 'NO';

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_INPUT_INTEGRITY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_INPUT_INTEGRITY_V1',
        headSha,
        inputIntegrity: a.preflight.inputIntegrity,
        pack: PACK_REL,
        frameManifestRows: a.preflight.frameManifestCount,
        ocr15sSamples: a.preflight.ocrSampleCount,
        originalMovInWorkspace: mov,
        full1HzOcrComplete: 'NO',
        note: '69×15s sparse OCR only; 1028 frames EXTRACTED with hashes, no images in repo',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_OCR_COVERAGE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_OCR_COVERAGE_V1',
        headSha,
        videoSecondsTotal: VIDEO_SECONDS_TOTAL,
        framesAvailable: a.preflight.frameManifestCount,
        ocrFramesProcessed: a.preflight.ocrSampleCount,
        coverageFractionOcr: a.preflight.ocrSampleCount / a.preflight.frameManifestCount,
        cadence: '15s_within_each_mov',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_OCR_QUALITY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_OCR_QUALITY_V1',
        headSha,
        byEvidenceLevel: a.parsed.reduce(
          (acc, r) => {
            acc[r.evidenceLevel] = (acc[r.evidenceLevel] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        samples: a.parsed,
        independentValidationNote: 'INDEPENDENTLY_VALIDATED requires FRAME_VERIFIED + temporal alignment; DIMO not used for validation tier',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_PER_SECOND_TIMELINE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_PER_SECOND_TIMELINE_V1',
        headSha,
        bucketCount: a.perSecond.length,
        buckets: a.perSecond,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_DIMO_IPHONE_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_DIMO_IPHONE_COMPARISON_V1',
        headSha,
        descriptiveOnly: true,
        notIndependentGroundTruth: true,
        validPairs: a.spatial.n,
        haversineM: a.spatial,
        absoluteAccuracy: 'NOT_ASSESSABLE',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_TIMESTAMP_SYNC.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_TIMESTAMP_SYNC_V1',
        headSha,
        status: a.timestampAlignment,
        overlayVsManifestSync: a.parsed.map((r) => ({
          frameId: r.frameId,
          overlayUtc: r.overlayUtc,
          manifestSyncUtc: a.manifest.find((m) => m.videoNum === r.videoNum && m.secondIndex === r.secondIndex)?.syncUtc,
          deltaSec:
            r.overlayUtc && a.manifest.find((m) => m.videoNum === r.videoNum && m.secondIndex === r.secondIndex)
              ? Math.abs(
                  Date.parse(r.overlayUtc) -
                    Date.parse(
                      a.manifest.find((m) => m.videoNum === r.videoNum && m.secondIndex === r.secondIndex)!.syncUtc,
                    ),
                ) / 1000
              : null,
        })),
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_GPS_FREEZE_CASES.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E7_GPS_FREEZE_V1', headSha, cases: a.freezeCases }, null, 2),
  );

  const stopEvents = a.parsed
    .filter((r) => (r.iphoneSpeedKmh ?? 99) < 2)
    .map((r) => ({
      video: r.video,
      intervalUtc: r.overlayUtc,
      classification: r.gpsFreezeSuspected ? 'GPS_FREEZE_SUSPECTED' : 'INFERRED_STOP_CANDIDATE',
      iphoneSpeedKmh: r.iphoneSpeedKmh,
      evidence: ['OCR_15S_SPARSE'],
      uncertainty: 'LOW_SPEED_ONLY_NOT_STANDSTILL_PROOF',
    }));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_STOP_FORENSICS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_STOP_FORENSICS_V1',
        headSha,
        observedStandstills: 0,
        contextSupportedStops: 0,
        inferredStopCandidates: stopEvents.filter((e) => e.classification === 'INFERRED_STOP_CANDIDATE').length,
        events: stopEvents,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_ROAD_MATCHING_AUDIT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_ROAD_MATCHING_AUDIT_V1',
        headSha,
        roadIdGroundTruth: 'NOT_ASSESSABLE',
        improvementProven: 'NO',
        tripPinned: { baselineAssociated: BASELINE_ASSOCIATED, viterbiAssociated: VITERBI_ASSOCIATED },
        disagreementsAtOcr15sSamples: a.disagreements,
        count: a.disagreements.length,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_SPEED_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_SPEED_VALIDATION_V1',
        headSha,
        pinnedL3BaselineMaeKmh: VIDEO_BASELINE_EXPECTED.maeKmh,
        sparseOcrSecondL3VsTacho: a.l3Sparse,
        note: 'Sparse 15s OCR seconds only; not full-trip validation; iPhone overlay speed not used as GT',
        speedImprovementProven: 'NO',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_EVIDENCE_GAPS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E7_EVIDENCE_GAPS_V1',
        headSha,
        gaps: [
          'BLOCKED_MISSING_SOURCE: frame images not in repository',
          'BLOCKED_MISSING_SOURCE: original MOVs not in workspace',
          'NOT_ASSESSABLE: road-ID ground truth',
          'NOT_ASSESSABLE: absolute GPS accuracy without independent reference',
          'NOT_EXECUTED: full 1-Hz OCR on 1028 frames',
        ],
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_OWNER_REPORT.md'),
    [
      '# Phase 3E.7 — Owner Report',
      '',
      'Zwischenstand: **1028** extrahierte 1-Hz-Frames (Hashes), **69** OCR-Proben (15-s), **kein** vollständiger 1-Hz-OCR-Audit.',
      '',
      `| INDEPENDENTLY_VALIDATED | ${a.independentlyValidated.length} |`,
      `| FRAME_VERIFIED+ | ${a.frameVerifiedCount} |`,
      `| DIMO/iPhone Paare (deskriptiv) | ${a.spatial.n} | Median ${a.spatial.medianM?.toFixed(2)} m |`,
      `| GPS-Freeze-Fälle | ${a.freezeCases.length} |`,
      `| Road-ID GT | NOT_ASSESSABLE |`,
      '',
      '**STOP: WAIT_OWNER_REVIEW**',
      '',
      '```bash',
      'cd backend && npm run ldi10d:phase3e7-partial-audit',
      'cd backend && npx jest ldi10d-phase3e7 --runInBand',
      '```',
    ].join('\n'),
  );

  const handoffDir = path.join(out, 'phase3e7-cursor-handoff');
  fs.mkdirSync(handoffDir, { recursive: true });
  const jsonl = a.parsed
    .map((r) =>
      JSON.stringify({
        frameId: r.frameId,
        evidenceLevel: r.evidenceLevel,
        overlayUtc: r.overlayUtc,
        lat: r.lat,
        lon: r.lon,
        dimoM: r.dimoHaversineM,
        freeze: r.gpsFreezeSuspected,
      }),
    )
    .join('\n');
  fs.writeFileSync(path.join(handoffDir, 'ocr_classified.jsonl'), jsonl);
  fs.writeFileSync(
    path.join(handoffDir, 'SUMMARY.md'),
    `# 3E.7 cursor handoff\n\nOCR samples: ${a.parsed.length}\nINDEPENDENTLY_VALIDATED: ${a.independentlyValidated.length}\n`,
  );
  const zipPath = path.join(out, 'LDI10D_PHASE3E7_CURSOR_HANDOFF.zip');
  execSync(
    `python3 -c "import zipfile, os; z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED); d='${handoffDir}'; [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),d)) for r,_,fs in os.walk(d) for f in fs]; z.close()"`,
    { stdio: 'pipe' },
  );
  const zipSize = fs.statSync(zipPath).size;

  const result = {
    LDI10D_PHASE: '3E7',
    INPUT_INTEGRITY: a.preflight.inputIntegrity,
    ORIGINAL_MOV_AVAILABLE: mov,
    VIDEO_SECONDS_TOTAL: VIDEO_SECONDS_TOTAL,
    VIDEO_SECONDS_ACTUALLY_ANALYZED: a.preflight.ocrSampleCount * 15,
    FRAMES_AVAILABLE: a.preflight.frameManifestCount,
    OCR_FRAMES_PROCESSED: a.preflight.ocrSampleCount,
    OCR_GPS_VERIFIED: a.frameVerifiedCount,
    TIMESTAMP_ALIGNMENT: a.timestampAlignment,
    DIMO_IPHONE_VALID_PAIRS: a.spatial.n,
    DIMO_IPHONE_MEDIAN_M: a.spatial.medianM,
    DIMO_IPHONE_P95_M: a.spatial.p95M,
    GPS_FREEZE_CASES: a.freezeCases.length,
    OBSERVED_STANDSTILLS: 0,
    CONTEXT_SUPPORTED_STOPS: 0,
    INFERRED_STOP_CANDIDATES: stopEvents.length,
    ROAD_ID_GROUND_TRUTH: 'NOT_ASSESSABLE',
    ROAD_MATCHING_IMPROVEMENT_PROVEN: 'NO',
    BASELINE_SPEED_MAE_KMH: VIDEO_BASELINE_EXPECTED.maeKmh,
    NEW_VALIDATED_SPEED_MAE_KMH: a.l3Sparse.maeKmh ?? 'NOT_ASSESSABLE',
    SPEED_IMPROVEMENT_PROVEN: 'NO',
    L3_BASELINE_DRIFT: a.p3d.l3BaselineDrift,
    REPLAY_TESTS: 'PENDING',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    CURSOR_PACKAGE_SIZE_BYTES: zipSize,
    REMAINING_EVIDENCE_GAPS: 'FULL_1HZ_OCR,FRAME_IMAGES,MOVS,ROAD_ID_LABELS',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    STOP: 'WAIT_OWNER_REVIEW',
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E7_RESULT.md'),
    ['# LDI-10D Phase 3E.7 — Result', '', '```json', JSON.stringify(result, null, 2), '```'].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
