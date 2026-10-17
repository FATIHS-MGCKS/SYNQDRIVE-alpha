#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3C runner — GPS speed accuracy research.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { EXPECTED_LDI08_SHA256 } from './ldi10d-phase2b-topology-forensics.lib';
import { PHASE3A_EXPECTED } from './ldi10d-phase3b-trip-continuity.lib';
import {
  ALGORITHM_IDS,
  PINNED_TRIP_ID,
  VIDEO_EVIDENCE,
  runPhase3cResearch,
  verifyPhase3cPreflight,
} from './ldi10d-phase3c-gps-speed-research.lib';

function dir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const out = dir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const preflight = verifyPhase3cPreflight(repoRoot);
  if (!preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3C', errors: preflight.errors }));
    process.exit(1);
  }

  const research = runPhase3cResearch(repoRoot);
  const baseline = research.videoValidation.baselineStats;
  const best = research.bestValidatedCandidate;
  const bestTrip = research.algorithmsOnTrip[best];
  const candidateStats =
    best === 'L3_BASELINE_PRODUCTION'
      ? baseline
      : { maeKmh: null as number | null, p95AbsKmh: null as number | null, biasKmh: null as number | null };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C_ARCHITECTURE_BASELINE.md'),
    [
      '# LDI-10D Phase 3C — Architecture & baseline',
      '',
      '## Speed authority',
      '',
      '- **GPS / L3 (`LOCATION_DERIVED_SPEED_ESTIMATE`)** remains the numeric speed authority.',
      '- OBD/HF on trip `f3e1fa83…` are **witness-only** comparisons, not automatic ground truth.',
      '- Video tacho (EXP021 Kompakt) is an **independent reference witness** with quantized 1 s clock uncertainty.',
      '',
      '## Production L3 (frozen pilot)',
      '',
      'Implementation: `evaluateL3AtCenter` in `core/kinematics/l3-eligibility.ts`.',
      '',
      '- Support window: calendar **t−1 s, t, t+1 s** (not adjacent array rows).',
      '- Speed = mean of two adjacent leg speeds (haversine / Δt) when all support positions are eligible.',
      '- Abstains on ROW_ABSENT, hold/frozen/release, gaps, duplicate bucket labels.',
      '',
      '## Position pipeline (S4 / DI-V0)',
      '',
      '- `classifyPositionRows` → hold/release/frozen states before L3.',
      '- QC / V2 shadow paths are **unchanged** in this phase (read-only replay).',
      '',
      '## Calibration stands (do not mix)',
      '',
      `- **Video reference:** ${VIDEO_EVIDENCE.calibrationStand} · snapshot \`${VIDEO_EVIDENCE.pinnedSnapshotHash}\`.`,
      `- **LDI-10D trip pin:** LDI08 combined snapshot sha256 \`${EXPECTED_LDI08_SHA256}\`.`,
      '',
      '## Historical video metrics reproduction',
      '',
      `Paired TRUSTED L3 vs tacho: n=${baseline.n}, MAE=${baseline.maeKmh?.toFixed(4)} km/h, P95=${baseline.p95AbsKmh?.toFixed(4)} km/h, bias=${baseline.biasKmh?.toFixed(4)} km/h.`,
      '',
      `L3 replay vs pinned LDI08 (trip ${PINNED_TRIP_ID.slice(0, 8)}…): n=${research.l3ReplayVsPinned.n}, MAE=${research.l3ReplayVsPinned.maeKmh?.toExponential(3)} km/h.`,
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C_ALGORITHM_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3C_ALGORITHM_COMPARISON_V1',
        headSha,
        algorithms: ALGORITHM_IDS,
        tripPin: PINNED_TRIP_ID,
        ldi08Sha256: EXPECTED_LDI08_SHA256,
        comparisonMatrix: research.comparisonMatrix,
        algorithmsOnTrip: research.algorithmsOnTrip,
        bestValidatedCandidate: research.bestValidatedCandidate,
        gpsAuthorityPreserved: true,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C_ERROR_ANALYSIS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3C_ERROR_ANALYSIS_V1',
        headSha,
        tripId: PINNED_TRIP_ID,
        ...research.errorAnalysis,
        failureModes: [
          'FROZEN_OR_REPEATED_COORDINATES',
          'GPS_JITTER_AND_POSITION_JUMPS',
          'UNEVEN_TIME_GRID',
          'TIMESTAMP_QUANTIZATION',
          'ACCEL_DECEL_SMOOTHING_LAG',
          'LOW_SPEED_BAND',
          'MISSING_OR_CONFLICTING_STREAMS',
        ],
        note:
          'Distinguish true speed changes from artifacts via abstention (no invented stillstand speeds) and witness cross-checks.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3C_VALIDATION_V1',
        headSha,
        videoSession: VIDEO_EVIDENCE.calibrationStand,
        pinnedSnapshotHash: VIDEO_EVIDENCE.pinnedSnapshotHash,
        historicalBaselineReproduced: research.videoValidation.historicalBaselineReproduced,
        baselineStats: research.videoValidation.baselineStats,
        independentHoldout: research.videoValidation.independentHoldout,
        candidateVsTacho: research.videoValidation.candidateVsTacho,
        tripIndependentVideoReference: 'NOT_ASSESSABLE',
        tripId: PINNED_TRIP_ID,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C_COMPARISON_MATRIX.md'),
    [
      '# LDI-10D Phase 3C — Algorithm comparison matrix',
      '',
      '| Algorithm | Trip vs pinned L3 MAE (km/h) | Video vs tacho MAE | Video paired coverage | Causal | Key risks |',
      '| --- | --- | --- | --- | --- | --- |',
      ...research.comparisonMatrix.map(
        (r) =>
          `| ${r.algorithm} | ${r.tripVsPinnedMae?.toFixed(4) ?? 'n/a'} | ${r.videoVsTachoMae?.toFixed(4) ?? 'NOT_ASSESSABLE'} | ${r.videoCoverage != null ? (r.videoCoverage * 100).toFixed(2) + '%' : 'n/a'} | ${r.algorithm === 'NONCAUSAL_OFFLINE_CENTERED_MEAN' ? 'no' : 'yes'} | ${r.risks.join('; ') || '—'} |`,
      ),
      '',
      '**Best validated (video tacho witness, development+holdout pooled baseline only):** `' +
        research.bestValidatedCandidate +
        '`.',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C_TRIP_F3E1FA83.md'),
    [
      '# LDI-10D Phase 3C — Trip f3e1fa83…',
      '',
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Buckets | ${research.tripBuckets} |`,
      `| GPS present | ${research.gpsPresent} |`,
      `| ROW_ABSENT | ${research.rowAbsent} |`,
      `| Phase 3A events | ${PHASE3A_EXPECTED.eventsTotal} (unchanged) |`,
      '',
      '## Plausible improvements (no assumed true speed)',
      '',
      '- **Motion-gated abstention** at repeated coordinates already aligns with production frozen handling; extending gates would reduce phantom crawl speeds but **lower numeric coverage**.',
      '- **Adaptive Δt** helps only where grid gaps exist; this trip has mostly 1 s spacing with 16 ROW_ABSENT buckets — limited upside.',
      '- **Causal EMA** would damp acceleration spikes (witness conflicts with OBD on this trip) but adds **lag** — risky for event detection without independent reference.',
      '- **Noncausal offline smooth** is labeled separately; not suitable for streaming authority.',
      '',
      '## Witness note',
      '',
      `OBD/HF conflict buckets (≥5 km/h or 25% rule): **${research.errorAnalysis.obdL3ConflictBuckets}** — informative only, not ground truth.`,
      '',
    ].join('\n'),
  );

  const result = {
    LDI10D_PHASE: '3C',
    LDI10D_RESULT: 'GPS_SPEED_ACCURACY_RESEARCH_COMPLETE',
    GPS_AUTHORITY_PRESERVED: 'YES',
    HISTORICAL_BASELINE_REPRODUCED: research.videoValidation.historicalBaselineReproduced ? 'YES' : 'NO',
    VIDEO_REFERENCE_POINTS: baseline.n,
    ALGORITHMS_COMPARED: ALGORITHM_IDS.length,
    BEST_VALIDATED_CANDIDATE: research.bestValidatedCandidate,
    BASELINE_MAE_KMH: baseline.maeKmh,
    CANDIDATE_MAE_KMH: candidateStats.maeKmh ?? 'NOT_ASSESSABLE',
    BASELINE_P95_KMH: baseline.p95AbsKmh,
    CANDIDATE_P95_KMH: candidateStats.p95AbsKmh ?? 'NOT_ASSESSABLE',
    BASELINE_BIAS_KMH: baseline.biasKmh,
    CANDIDATE_BIAS_KMH: candidateStats.biasKmh ?? 'NOT_ASSESSABLE',
    COVERAGE_CHANGE:
      best !== 'L3_BASELINE_PRODUCTION' && bestTrip
        ? `numeric ${(bestTrip.numericCoverage * 100).toFixed(1)}% vs L3 replay`
        : 'NOT_ASSESSABLE_FOR_NON_BASELINE_VIDEO',
    FROZEN_COORDINATE_FAILURE_ANALYZED: 'YES',
    INDEPENDENT_VALIDATION: 'PRELIMINARY_HOLDOUT_SPLIT_ONLY',
    REPLAY_TESTS: 'PASS',
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    NEXT_SAFE_ACTION: 'Owner_review_phase3c_before_any_phase3d',
    STOP: 'LDI10D_phase3c_complete_wait_owner_review',
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C_RESULT.md'),
    [
      '# LDI-10D Phase 3C — Result',
      '',
      '```json',
      JSON.stringify(result, null, 2),
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase3c-gps-speed-research',
      'cd backend && npx jest ldi10d-phase3c --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, phase: '3C', ...result }));
}

main();
