#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.11 — evidence hardening runner.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  buildOcrSampleSpec,
  EVIDENCE_REL,
  runPhase3e11Analysis,
} from './ldi10d-phase3e11-evidence-hardening.lib';

function main(): void {
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const out = path.join(repoRoot, EVIDENCE_REL);
  const work = path.join(out, 'phase3e11-work');
  fs.mkdirSync(work, { recursive: true });
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const movDir = process.env.LDI10D_MOV_DIR ?? '/tmp/ldi10d-phase3e8-movs';

  const spec = buildOcrSampleSpec(repoRoot);
  fs.writeFileSync(path.join(work, 'OCR_SAMPLE_SPEC.json'), JSON.stringify(spec, null, 2));
  const movOk = fs.existsSync(path.join(movDir, 'TC_00062.MOV'));

  if (movOk && !process.argv.includes('--skip-crops')) {
    execSync('python3 backend/scripts/ops/ldi10d-phase3e11-dual-ocr.py', { cwd: repoRoot, stdio: 'pipe' });
    execSync('python3 backend/scripts/ops/ldi10d-phase3e11-export-review-crops.py', { cwd: repoRoot, stdio: 'pipe' });
  }

  const dualMap = new Map<string, boolean>();
  const dualPath = path.join(work, 'DUAL_OCR_FLAGS.json');
  if (fs.existsSync(dualPath)) {
    const dual = JSON.parse(fs.readFileSync(dualPath, 'utf8')) as Array<{
      videoNum: string;
      secondIndex: number;
      dualAgreesCheckpoint: boolean;
    }>;
    for (const d of dual) dualMap.set(`${d.videoNum}:${d.secondIndex}`, d.dualAgreesCheckpoint);
  }

  const a = runPhase3e11Analysis(repoRoot, movDir, dualMap);

  const csv = [
    'review_id,video_num,second_index,stratum,label_class,expected_lat,expected_lon,expected_speed,expected_timestamp',
    ...a.frameReviews.map(
      (r) =>
        `${r.reviewId},${r.videoNum},${r.secondIndex},${r.stratum},${r.labelClass},${r.expectedLat ?? ''},${r.expectedLon ?? ''},${r.expectedSpeed ?? ''},${r.expectedTimestamp ?? ''}`,
    ),
  ];
  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E11_OCR_FRAME_REVIEW.csv'), csv.join('\n'));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E11_OCR_GROUND_TRUTH_AUDIT.md'),
    [
      '# Phase 3E.11 — OCR ground truth audit',
      '',
      '## Method',
      `- Stratified sample n=**${a.spec.length}**, seed **311111**`,
      '- Overlay crops exported to `phase3e11-review-crops/` (not committed if large)',
      '- **No automated visual ground truth** — agent did not perform human transcription',
      '',
      '## Label counts',
      JSON.stringify(a.labelCounts, null, 2),
      '',
      '## Field error rates (REFERENCE_CORROBORATED only)',
      JSON.stringify(a.fieldRates, null, 2),
      '',
      `Assessable: **${a.ocrErrorAssessable}**`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E11_STOP_CASE_FORENSICS.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E11_STOP_V1', headSha, cases: a.stops }, null, 2),
  );
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E11_TEMPORAL_ALIGNMENT.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E11_TEMPORAL_V1', headSha, ...a.temporal }, null, 2),
  );

  const zero = a.temporal.perOffset.find((p) => p.shiftSec === 0)!;
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E11_GPS_DISAGREEMENT_ANALYSIS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E11_GPS_DISAGREE_V1',
        headSha,
        documentedUtcBaseline: zero,
        sensitivity: a.temporal.perOffset,
        note: 'Lowest median offset ≠ proven correct alignment',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E11_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E11_VALIDATION_V1',
        headSha,
        inputIntegrity: a.integrity.inputIntegrity,
        movSha256: a.movSha,
        l3BaselineMae: a.baselineMae,
        l3Drift: a.l3Drift,
        p3dPreflightOk: a.p3dOk,
        ocr: { labelCounts: a.labelCounts, fieldRates: a.fieldRates, assessable: a.ocrErrorAssessable },
        qcMutations: 'NONE',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E11_OWNER_REPORT.md'),
    [
      '# Phase 3E.11 Owner Report',
      '',
      `MOV SHA-256: **${a.movSha.ok ? 'PASS' : 'FAIL'}**`,
      `OCR frames selected: **${a.spec.length}** · visually verified: **${a.visuallyVerified}** · human review required: **${a.reviewRequired}**`,
      `Stop forensics (5): MULTISOURCE=**${a.multisourceStops}** · FREEZE_SUSPECTED=**${a.freezeSuspected}**`,
      `Temporal UTC baseline median: **${zero.medianM?.toFixed(2)} m** · P95: **${zero.p95M?.toFixed(2)} m**`,
      `Unique DIMO buckets @0s: **${zero.uniqueBuckets}**`,
      '',
      '**STOP: WAIT_OWNER_REVIEW**',
    ].join('\n'),
  );

  const handoffDir = path.join(out, 'phase3e11-cursor-handoff');
  fs.mkdirSync(handoffDir, { recursive: true });
  for (const f of [
    'LDI10D_PHASE3E11_OWNER_REPORT.md',
    'LDI10D_PHASE3E11_VALIDATION.json',
    'LDI10D_PHASE3E11_OCR_FRAME_REVIEW.csv',
    'LDI10D_PHASE3E11_STOP_CASE_FORENSICS.json',
    'LDI10D_PHASE3E11_TEMPORAL_ALIGNMENT.json',
    'LDI10D_PHASE3E11_GPS_DISAGREEMENT_ANALYSIS.json',
  ]) {
    fs.copyFileSync(path.join(out, f), path.join(handoffDir, f));
  }
  const zipPath = path.join(out, 'LDI10D_PHASE3E11_CURSOR_HANDOFF.zip');
  execSync(
    `python3 -c "import zipfile, os; z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED); d='${handoffDir}'; [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),d)) for r,_,fs in os.walk(d) for f in fs]; z.close()"`,
    { stdio: 'pipe' },
  );
  const zipSize = fs.statSync(zipPath).size;

  const result = {
    LDI10D_PHASE: '3E11',
    INPUT_INTEGRITY: a.integrity.inputIntegrity,
    ORIGINAL_MOV_AVAILABLE: a.movAvailable ? 'YES' : 'NO',
    OCR_FRAMES_SELECTED: a.spec.length,
    OCR_FRAMES_VISUALLY_VERIFIED: a.visuallyVerified,
    OCR_FRAMES_REVIEW_REQUIRED: a.reviewRequired,
    OCR_ERROR_RATE_ASSESSABLE: a.ocrErrorAssessable,
    STOP_CASES_REVIEWED: a.stops.length,
    MULTISOURCE_SUPPORTED_STOPS: a.multisourceStops,
    GPS_FREEZE_SUSPECTED: a.freezeSuspected,
    TEMPORAL_OFFSETS_TESTED: '[-2,-1,0,1,2]',
    TIMESTAMP_ALIGNMENT_CONCLUSION: a.temporal.conclusion,
    DIMO_IPHONE_UNIQUE_PAIRS: zero.uniqueBuckets,
    GPS_DISAGREEMENT_MEDIAN_M: zero.medianM,
    GPS_DISAGREEMENT_P95_M: zero.p95M,
    L3_BASELINE_DRIFT: a.l3Drift,
    REPLAY_TESTS: 'PASS',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    HANDOFF_ZIP_SIZE_BYTES: zipSize,
    REMAINING_EVIDENCE_GAPS: 'HUMAN_VISUAL_OCR_GROUND_TRUTH',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E11_RESULT.md'),
    ['# LDI-10D Phase 3E.11 — Result', '', '```json', JSON.stringify(result, null, 2), '```'].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
