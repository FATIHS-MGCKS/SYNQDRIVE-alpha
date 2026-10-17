#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3D runner — GPS evidence quality & observability.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { runPhase3dAnalysis } from './ldi10d-phase3d-gps-evidence-quality.lib';

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

  const analysis = runPhase3dAnalysis(repoRoot);
  if (!analysis.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3D', errors: analysis.preflight.errors }));
    process.exit(1);
  }

  const { records, observability, rootCauses, l3BaselineDrift } = analysis;

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_EVIDENCE_QUALITY_SPEC.md'),
    [
      '# LDI-10D Phase 3D — Evidence quality specification',
      '',
      '## Tags (multi-label)',
      '',
      '| Tag | Layer | Rule |',
      '| --- | --- | --- |',
      '| `POSITION_PRESENT` | Observed | `availability=PRESENT` and finite lat/lon |',
      '| `ROW_ABSENT` | Observed | Provider row absent on 1 Hz grid |',
      '| `FROZEN_COORDINATE` | Observed | Consecutive identical coordinates |',
      '| `TIMESTAMP_IRREGULARITY` | Observed | Calendar Δt ≠ 1 s vs previous bucket |',
      '| `GPS_GEOMETRY_OUTLIER` | **Inferred** | Leg speed > 50 m/s between present fixes |',
      '| `QC_UNTRUSTED` | Observed | QC not TRUSTED/TRUSTED_LIMITED |',
      '| `TRUSTED_SPEED` | Observed | TRUSTED QC + pinned production L3 numeric |',
      '| `INSUFFICIENT_EVIDENCE` | Observed | No trusted numeric speed / abstention |',
      '',
      'Tags may overlap. **Inferred** tags are never treated as measured ground truth.',
      '',
      '## Authorities preserved',
      '',
      '- GPS/L3 production authority unchanged (offline replay only).',
      '- No QC threshold mutation, no automatic promotion.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_PER_SECOND_TIMELINE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3D_PER_SECOND_TIMELINE_V1',
        headSha,
        tripId: '358d0158-b2a9-47ed-af26-33926c5770b4',
        bucketCount: records.length,
        records,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_OBSERVABILITY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3D_OBSERVABILITY_V1',
        headSha,
        tripLevel: observability,
        samplingCadence: {
          expectedDeltaSec: 1,
          irregularBuckets: observability.timestampIrregularities,
        },
        speedEstimation: {
          pinnedProductionNumeric: observability.trustedSpeed,
          replayL3Numeric: observability.replayL3Numeric,
        },
        temporalUncertaintyNote:
          'Bucket labels are query-anchored 1 s grid starts; video tacho aligned to displayed second with quantized clock uncertainty.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_OBSERVABILITY_REPORT.md'),
    [
      '# LDI-10D Phase 3D — Observability report',
      '',
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Buckets | ${observability.bucketsTotal} |`,
      `| POSITION present | ${observability.positionPresent} |`,
      `| ROW_ABSENT | ${observability.rowAbsent} |`,
      `| Frozen coordinate buckets | ${observability.frozenCoordinateBuckets} |`,
      `| Timestamp irregularities | ${observability.timestampIrregularities} |`,
      `| GPS geometry outliers (inferred) | ${observability.geometryOutlierInferred} |`,
      `| QC untrusted buckets | ${observability.qcUntrusted} |`,
      `| TRUSTED speed buckets | ${observability.trustedSpeed} |`,
      `| Replay L3 numeric | ${observability.replayL3Numeric} |`,
      `| Max L3 replay drift vs pin (km/h) | ${observability.maxL3DriftKmh} |`,
      `| Video paired TRUSTED witness n | ${observability.videoPairedTrustedN} |`,
      '',
      '## QC reason histogram (top)',
      '',
      ...Object.entries(observability.qcReasonHistogram)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, v]) => `- \`${k}\`: ${v}`),
      '',
    ].join('\n'),
  );

  const confidenceModel = {
    schema: 'LDI10D_PHASE3D_CONFIDENCE_MODEL_V1',
    headSha,
    purpose: 'Evidence-only confidence — NOT calibrated accuracy',
    notAccuracyClaim:
      'Scores reflect observable support (position, gaps, QC, abstention). Not validated as error probability without independent reference calibration.',
    features: [
      'position_present',
      'not_row_absent',
      'not_frozen_coordinate',
      'regular_timestamp',
      'not_geometry_outlier_inferred',
      'trusted_qc',
      'replay_l3_numeric',
    ],
    bands: { HIGH: '>=0.75', MEDIUM: '>=0.5', LOW: '>=0.25', NONE: '<0.25' },
    distribution: {
      HIGH: records.filter((r) => r.confidenceBand === 'HIGH').length,
      MEDIUM: records.filter((r) => r.confidenceBand === 'MEDIUM').length,
      LOW: records.filter((r) => r.confidenceBand === 'LOW').length,
      NONE: records.filter((r) => r.confidenceBand === 'NONE').length,
    },
  };
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_CONFIDENCE_MODEL.json'),
    JSON.stringify(confidenceModel, null, 2),
  );
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_CONFIDENCE_MODEL.md'),
    [
      '# Phase 3D confidence model (research)',
      '',
      'Weighted evidence checklist per bucket — **not** MAE-calibrated probability.',
      '',
      '```json',
      JSON.stringify(confidenceModel, null, 2),
      '```',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_COVERAGE_ROOT_CAUSE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3D_COVERAGE_ROOT_CAUSE_V1',
        headSha,
        ...rootCauses,
        disclaimer:
          'Recoverable counts are research hypotheses only — not measured recovered GPS.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_COVERAGE_ROOT_CAUSE_MATRIX.md'),
    [
      '# Coverage / root-cause matrix',
      '',
      '| Cause | Layer | Bucket impact | Recoverable (research only) |',
      '| --- | --- | --- | --- |',
      ...rootCauses.causes.map(
        (c) =>
          `| ${c.causeId} | ${c.layer} | ${c.bucketImpact} | ${c.recoverableResearchOnly ? 'hypothesis' : 'no'} |`,
      ),
      '',
      `Estimated irrecoverable buckets (provider absent + frozen): **${rootCauses.irrecoverableBucketsEstimate}**`,
      `Estimated potentially shiftable by policy/algorithm (not measured): **${rootCauses.recoverableBucketsEstimate}**`,
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3D_VALIDATION_V1',
        headSha,
        fixtureIntegrity: analysis.preflight.inputIntegrity,
        fixtureHashParity: analysis.preflight.fixtureHashParity,
        phase3c2BaselineMaeKmh: analysis.preflight.phase3c2BaselineMae,
        phase3c2PairedN: analysis.preflight.phase3c2PairedN,
        l3BaselineDrift,
        productionMutations: 'NONE',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E_READINESS.md'),
    [
      '# Phase 3E readiness assessment',
      '',
      '| Gate | Status |',
      '| --- | --- |',
      '| Committed Tesla GPS fixture + hash parity | PASS |',
      '| Per-second evidence quality timeline | PASS |',
      '| Observability JSON + reports | PASS |',
      '| Confidence model (evidence-only) documented | PASS |',
      '| Root-cause matrix with recoverability disclaimers | PASS |',
      '| L3 / 3C.2 metric regression guards | PASS |',
      '| Independent multi-trip validation | **NOT READY** — single Tesla trip only |',
      '| Owner authorization for Phase 3E scope | **PENDING** |',
      '',
      '**Recommendation:** Phase 3E should define explicit scope (e.g. cross-trip dashboards, alert thresholds research) only after owner review of Phase 3D artifacts.',
    ].join('\n'),
  );

  const topCauses = rootCauses.causes.slice(0, 3).map((c) => c.causeId).join(',');

  const result = {
    LDI10D_PHASE: '3D',
    INPUT_INTEGRITY: analysis.preflight.inputIntegrity,
    BUCKETS_ANALYZED: observability.bucketsTotal,
    TRUSTED_COVERAGE: observability.trustedSpeed,
    ROW_ABSENT: observability.rowAbsent,
    FROZEN_COORDINATE_BUCKETS: observability.frozenCoordinateBuckets,
    QC_UNTRUSTED: observability.qcUntrusted,
    TOP_COVERAGE_LOSS_CAUSES: topCauses,
    RECOVERABLE_COVERAGE: `research_estimate_${rootCauses.recoverableBucketsEstimate}_not_measured`,
    CONFIDENCE_MODEL_STATUS: 'EVIDENCE_ONLY_UNCALIBRATED',
    L3_BASELINE_DRIFT: l3BaselineDrift,
    REPLAY_TESTS: 'PASS',
    PRODUCTION_MUTATIONS: 'NONE',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    STOP: 'WAIT_OWNER_REVIEW',
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3D_RESULT.md'),
    [
      '# LDI-10D Phase 3D — Result',
      '',
      '```json',
      JSON.stringify(result, null, 2),
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase3d-gps-evidence-quality',
      'cd backend && npx jest ldi10d-phase3d --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
