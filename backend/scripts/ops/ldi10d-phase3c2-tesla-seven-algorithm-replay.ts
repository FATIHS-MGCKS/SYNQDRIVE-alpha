#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3C.2 — seven-algorithm replay on committed Tesla fixture.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { FIXTURE_REL, runSevenAlgorithmReplay } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';

function evidenceDir(repoRoot: string): string {
  return path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
}

function main(): void {
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const fixtureDir = path.join(repoRoot, FIXTURE_REL);
  const gridPath = path.join(fixtureDir, 'TESLA_POSITION_GRID.json');
  if (!fs.existsSync(gridPath)) {
    console.error(JSON.stringify({ ok: false, error: 'fixture missing; run recover first' }));
    process.exit(1);
  }

  const provenance = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, 'PROVENANCE_MANIFEST.json'), 'utf8'),
  ) as { recoveredPositionPayloadSha256: string };
  const hashParity = provenance.recoveredPositionPayloadSha256 === POSITION_PAYLOAD_SHA256;

  const replay = runSevenAlgorithmReplay(repoRoot);
  const baseline = replay.baseline;
  const best = replay.results.find((r) => r.algorithm === replay.bestCandidate)!;

  const out = evidenceDir(repoRoot);
  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C2_ALGORITHM_REPLAY.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3C2_ALGORITHM_REPLAY_V1',
        headSha,
        fixture: FIXTURE_REL,
        hashParity,
        singleTripNote:
          'Single-trip witness validation only — not independent multi-trip validation.',
        algorithms: replay.results,
        bestCandidate: replay.bestCandidate,
        accuracyImprovementProven: replay.accuracyImprovementProven,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C2_COMPARISON_MATRIX.md'),
    [
      '# LDI-10D Phase 3C.2 — Seven-algorithm comparison (Tesla GPS fixture)',
      '',
      'Witness: video tacho on synchronized 1 s bucket labels. **Not** OBD ground truth.',
      '',
      '| Algorithm | Trusted-pair n | MAE | P95 | Bias | Numeric coverage |',
      '| --- | --- | --- | --- | --- | --- |',
      ...replay.results.map(
        (r) =>
          `| ${r.algorithm} | ${r.trustedWitnessPairs.n} | ${r.trustedWitnessPairs.maeKmh?.toFixed(4) ?? 'n/a'} | ${r.trustedWitnessPairs.p95AbsKmh?.toFixed(4) ?? 'n/a'} | ${r.trustedWitnessPairs.biasKmh?.toFixed(4) ?? 'n/a'} | ${(r.numericCoverage * 100).toFixed(2)}% |`,
      ),
      '',
      `**Best on trusted tacho pairs:** \`${replay.bestCandidate}\` · improvement proven: **${replay.accuracyImprovementProven ? 'YES' : 'NO'}**`,
      '',
    ].join('\n'),
  );

  const result = {
    POSITION_RECOVERY_STATUS: 'COMMITTED_FIXTURE',
    GPS_FIXTURE_COMMITTED: 'YES',
    RECORDS_RECOVERED: JSON.parse(fs.readFileSync(gridPath, 'utf8')).bucketCount,
    HASH_PARITY: hashParity ? 'YES' : 'NO',
    ALGORITHMS_REPLAYED: 'YES',
    VIDEO_REFERENCE_MATCHES: baseline.trustedWitnessPairs.n,
    BASELINE_MAE: baseline.trustedWitnessPairs.maeKmh,
    BEST_CANDIDATE_MAE: best.trustedWitnessPairs.maeKmh,
    BASELINE_P95: baseline.trustedWitnessPairs.p95AbsKmh,
    BEST_CANDIDATE_P95: best.trustedWitnessPairs.p95AbsKmh,
    BIAS_COMPARISON: {
      baseline: baseline.trustedWitnessPairs.biasKmh,
      best: best.trustedWitnessPairs.biasKmh,
    },
    COVERAGE_COMPARISON: replay.results.map((r) => ({
      algorithm: r.algorithm,
      numericCoverage: r.numericCoverage,
    })),
    ACCURACY_IMPROVEMENT_PROVEN: replay.accuracyImprovementProven ? 'YES' : 'NO',
    NEXT_SAFE_ACTION: 'Owner_review_phase3c2_before_any_algorithm_activation',
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C2_RESULT.md'),
    [
      '# LDI-10D Phase 3C.2 — Result',
      '',
      '```json',
      JSON.stringify(result, null, 2),
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase3c2-tesla-seven-algorithm-replay',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, phase: '3C.2', ...result }));
}

main();
