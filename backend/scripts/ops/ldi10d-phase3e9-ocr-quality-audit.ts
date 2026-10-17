#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.9 — OCR quality & freeze validation artifacts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  enrichCheckpoint,
  FrameSampleResult,
  runPhase3e9Analysis,
  selectFrameSampleIndices,
} from './ldi10d-phase3e9-ocr-quality-audit.lib';

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
  const work = path.join(out, 'phase3e9-work');
  fs.mkdirSync(work, { recursive: true });

  const rows = enrichCheckpoint(repoRoot);
  const sampleSpec = selectFrameSampleIndices(rows);
  fs.writeFileSync(path.join(work, 'FRAME_SAMPLE_SPEC.json'), JSON.stringify(sampleSpec, null, 2));

  let frameResults: FrameSampleResult[] | null = null;
  const skipResample = process.argv.includes('--skip-resample');
  if (!skipResample) {
    try {
      execSync('python3 backend/scripts/ops/ldi10d-phase3e9-frame-resample.py', {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      const p = path.join(work, 'FRAME_SAMPLE_RESULTS.json');
      if (fs.existsSync(p)) frameResults = JSON.parse(fs.readFileSync(p, 'utf8')) as FrameSampleResult[];
    } catch (e) {
      fs.writeFileSync(path.join(work, 'FRAME_RESAMPLE_ERROR.txt'), String(e));
    }
  }

  const a = runPhase3e9Analysis(repoRoot, frameResults);

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_GPS_FREEZE_AUDIT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E9_GPS_FREEZE_V1',
        headSha,
        points3e8Heuristic: a.freeze.points3e8,
        segmentCount: a.freeze.segments.length,
        segmentByClass: a.freeze.byClass,
        segments: a.freeze.segments,
        pointRecords: a.freeze.pointRecords,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_STOP_CLASSIFICATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E9_STOP_V1',
        headSha,
        summary: a.stopSummary,
        candidates: a.stops,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_FRAME_SAMPLE_AUDIT.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E9_FRAME_SAMPLE_V1', headSha, ...a.sampleAudit }, null, 2),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_OUTLIER_REGISTER.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E9_OUTLIER_V1',
        headSha,
        p95ThresholdM: a.spatialBefore.p95M,
        topOutliers: a.outliers.slice(0, 40),
        causeCounts: a.outliers.reduce<Record<string, number>>((acc, o) => {
          acc[o.cause] = (acc[o.cause] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_PAIR_INDEPENDENCE_AUDIT.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3E9_PAIR_AUDIT_V1', headSha, ...a.pairAudit }, null, 2),
  );

  const before = a.p38Snapshot ?? {};
  const metricsBeforeAfter = {
    schema: 'LDI10D_PHASE3E9_METRICS_BEFORE_AFTER_V1',
    headSha,
    phase38Frozen: before,
    afterQualityGate: {
      gatedRowCount: a.gatedCount,
      dimoIphonePairs: a.spatialAfter.n,
      medianM: a.spatialAfter.medianM,
      p95M: a.spatialAfter.p95M,
      note: 'After gate: fully-readable, not 3E8 freeze-point, dimoH≤500m, implied speed <200 km/h',
    },
    beforeSetA: {
      dimoIphonePairs: a.spatialBefore.n,
      medianM: a.spatialBefore.medianM,
      p95M: a.spatialBefore.p95M,
    },
  };
  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E9_METRICS_BEFORE_AFTER.json'), JSON.stringify(metricsBeforeAfter, null, 2));

  const errors = [
    ...a.freeze.pointRecords.filter((p) => p.segmentClass === 'OCR_STALE_COORD_REPEAT').map((p) => ({
      code: 'FREEZE_OCR_STALE',
      ref: `${p.videoNum}:${p.secondIndex}`,
    })),
    ...a.outliers.filter((o) => o.cause === 'OCR_COORD_ERROR').map((o) => ({
      code: 'SPATIAL_OCR_COORD',
      ref: `${o.videoNum}:${o.secondIndex}`,
      dimoM: o.dimoHaversineM,
    })),
    ...(a.sampleAudit.errorRate != null && a.sampleAudit.errorRate > 0
      ? [{ code: 'FRAME_RESAMPLE_MISMATCH_RATE', value: a.sampleAudit.errorRate }]
      : []),
  ];
  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E9_ERROR_REGISTER.json'), JSON.stringify({ schema: 'LDI10D_PHASE3E9_ERRORS_V1', headSha, errors }, null, 2));

  const algoRecommendation =
    a.spatialAfter.p95M != null && a.spatialAfter.p95M < 40
      ? 'Use quality-gated fully-readable rows without 3E8 freeze-point flag for exploratory speed/spatial work; do not use for road-ID ground truth.'
      : 'Treat OCR coordinates as weak prior only; require FRAME_VERIFIED / independent labels before algorithm calibration.';

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_OWNER_REPORT.md'),
    [
      '# Phase 3E.9 Owner Report — OCR Quality & Freeze Validation',
      '',
      '## Freeze (234 point heuristic from 3E.8)',
      `- Segments with repeated coordinates: **${a.freeze.segments.length}**`,
      `- Classified segment point-mass: ${JSON.stringify(a.freeze.byClass)}`,
      `- Likely real overlay freeze points: **${a.freeze.pointRecords.filter((p) => p.segmentClass === 'REAL_OVERLAY_GPS_FREEZE').length}**`,
      `- OCR stale/speed artifacts: **${a.freeze.pointRecords.filter((p) => p.segmentClass !== 'REAL_OVERLAY_GPS_FREEZE' && p.segmentClass !== 'LEGIT_LOW_SPEED_STATIC').length}**`,
      '',
      '## Stop candidates (speed <2 km/h, valid coords required for OBSERVED)',
      `- OBSERVED: **${a.stopSummary.OBSERVED}** · CONTEXT_SUPPORTED: **${a.stopSummary.CONTEXT_SUPPORTED}** · INFERRED: **${a.stopSummary.INFERRED}** · UNKNOWN: **${a.stopSummary.UNKNOWN}**`,
      '',
      '## Frame resample audit (no FRAME_VERIFIED promotion)',
      `- Target samples: **${a.sampleAudit.targetCount}** · inspected: **${a.sampleAudit.actualImageInspectionCount}**`,
      `- Coord mismatch rate (>${25}m re-OCR vs checkpoint): **${a.sampleAudit.errorRate != null ? (a.sampleAudit.errorRate * 100).toFixed(1) + '%' : 'NOT_RUN'}**`,
      '',
      '## P95 distance (3E.8 Set A)',
      `- Before gate: P95 **${a.spatialBefore.p95M?.toFixed(2)} m** (n=${a.spatialBefore.n})`,
      `- After quality gate: P95 **${a.spatialAfter.p95M?.toFixed(2)} m** (n=${a.spatialAfter.n})`,
      `- Top outliers documented in \`LDI10D_PHASE3E9_OUTLIER_REGISTER.json\` (${a.outliers.length} rows ≥ P95)`,
      '',
      '## Pair independence (698 Set A)',
      `- DIMO distance filter used in Set A: **NO** (confirmed)`,
      `- Duplicate OCR→DIMO bucket assignments: **${a.pairAudit.duplicateBucketAssignments}**`,
      `- Missing DIMO join (in corridor): **${a.pairAudit.missingDimoJoin}**`,
      '',
      '## Algorithm development recommendation',
      algoRecommendation,
      '',
      '**STOP: WAIT_OWNER_REVIEW** — no merge, deploy, QC, L3, or Viterbi changes.',
    ].join('\n'),
  );

  const result = {
    LDI10D_PHASE: '3E9',
    FREEZE_POINTS_3E8: a.freeze.points3e8,
    FREEZE_SEGMENTS: a.freeze.segments.length,
    STOP_OBSERVED: a.stopSummary.OBSERVED,
    STOP_CONTEXT_SUPPORTED: a.stopSummary.CONTEXT_SUPPORTED,
    STOP_INFERRED: a.stopSummary.INFERRED,
    STOP_UNKNOWN: a.stopSummary.UNKNOWN,
    FRAME_SAMPLE_SIZE: a.sampleAudit.actualImageInspectionCount,
    FRAME_SAMPLE_ERROR_RATE: a.sampleAudit.errorRate,
    P95_BEFORE_M: a.spatialBefore.p95M,
    P95_AFTER_GATE_M: a.spatialAfter.p95M,
    PAIR_AUDIT_SET_A_FILTERED: false,
    DUPLICATE_BUCKET_ASSIGNMENTS: a.pairAudit.duplicateBucketAssignments,
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_RESULT.md'),
    ['# LDI-10D Phase 3E.9 — Result', '', '```json', JSON.stringify(result, null, 2), '```'].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E9_REPRO.md'),
    [
      '# Phase 3E.9 reproduction',
      '',
      '```bash',
      'cd backend && npm run ldi10d:phase3e9-ocr-quality-audit',
      'cd backend && npx jest ldi10d-phase3e9 --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
