#!/usr/bin/env ts-node
/**
 * LDI-09 — acceleration, deceleration & signal conflict forensics (offline LDI-08).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  analyzeAccelDecelForensics,
  analyzeCadence,
  buildConflictClassification,
  buildLdi09ResultLines,
  computeCoverageIntegrity,
  loadLdi08Artifacts,
  LDI09_TRIP_ID,
  LDI09_VEHICLE_ID,
} from './ldi09-accel-decel-signal-forensics.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-09');
  }
  return path.resolve(argv[i + 1]);
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI09_REPO_ROOT
    ? path.resolve(process.env.LDI09_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const { snapshot, candidates, nativeOverlap } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const coverage = computeCoverageIntegrity(rows);
  const accelDecel = analyzeAccelDecelForensics(rows, candidates);
  const conflicts = buildConflictClassification(rows);
  const cadence = analyzeCadence(rows as import('./ldi04-fusion-forensics.lib').Ldi03Row[]);

  const corners = (nativeOverlap.corneringOverlap as unknown[]) ?? [];

  fs.writeFileSync(
    path.join(outDir, 'LDI09_ACCEL_DECEL_FORENSICS.json'),
    JSON.stringify({ headSha, tripId: LDI09_TRIP_ID, vehicleId: LDI09_VEHICLE_ID, ...accelDecel }, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, 'LDI09_CONFLICT_CLASSIFICATION.json'),
    JSON.stringify({ headSha, tripId: LDI09_TRIP_ID, ...conflicts }, null, 2),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI09_COVERAGE_INTEGRITY.md'),
    [
      '# LDI09 — Coverage integrity',
      '',
      `**Source:** frozen \`LDI08_COMBINED_SNAPSHOT.json\` · **Trip:** \`${LDI09_TRIP_ID}\``,
      '',
      '## QC trust buckets (denominator = shadow grid rows)',
      '',
      '| Class | Buckets | % of grid |',
      '|-------|---------|-----------|',
      `| **TRUSTED** (strict) | ${coverage.trustedOnly.buckets} | ${(coverage.trustedOnly.fraction * 100).toFixed(2)}% |`,
      `| **TRUSTED_LIMITED** | ${coverage.trustedOrLimited.buckets - coverage.trustedOnly.buckets} | ${(((coverage.trustedOrLimited.buckets - coverage.trustedOnly.buckets) / coverage.shadowGridDenominator) * 100).toFixed(2)}% |`,
      `| **TRUSTED ∪ TRUSTED_LIMITED** | ${coverage.trustedOrLimited.buckets} | ${(coverage.trustedOrLimited.fraction * 100).toFixed(2)}% |`,
      `| **UNTRUSTED** | ${coverage.untrusted.buckets} | ${(coverage.untrusted.fraction * 100).toFixed(2)}% |`,
      `| **ROW_ABSENT** (GPS) | ${coverage.rowAbsent.buckets} | ${(coverage.rowAbsent.fraction * 100).toFixed(2)}% |`,
      `| **UNKNOWN QC** | ${coverage.unknownQc.buckets} | ${(coverage.unknownQc.fraction * 100).toFixed(2)}% |`,
      '',
      '## Fusion-assessable seconds (28 in LDI-08)',
      '',
      coverage.fusionAssessable.definition,
      '',
      `- **Denominator:** ${coverage.fusionAssessable.denominator} (= ${coverage.shadowGridDenominator} rows)`,
      `- **Numerator:** **${coverage.fusionAssessable.buckets}** buckets meeting all conjunctive stream predicates`,
      `- **Fraction:** ${(coverage.fusionAssessable.fractionOfShadowGrid * 100).toFixed(2)}%`,
      '',
      '<details><summary>Assessable bucket labels (UTC)</summary>',
      '',
      coverage.fusionAssessable.bucketLabelsUtc.map((b) => `- \`${b}\``).join('\n'),
      '',
      '</details>',
      '',
      '## HF cadence (context)',
      '',
      `- Median Δt HF numeric buckets: **${cadence.observedMedianDeltaMs ?? 'n/a'}** ms`,
      `- Strict 1 Hz: **${cadence.supportsStrict1Hz ? 'yes' : 'no'}**`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI09_NEXT_CAPTURE_REQUIREMENTS.md'),
    [
      '# LDI09 — Next capture requirements',
      '',
      '1. **Event matrix trip:** need S4 pin **and** native accel/brake events on same vehicle (LDI-06/07 gap on `a682d3df…`).',
      '2. **Dense GPS:** 7s waypoint cadence invalidates strict 1 Hz QC on historical trips without provider re-fetch (no interpolation).',
      `3. **Fusion assessable surface:** only **${coverage.fusionAssessable.buckets}** s on this pin — expand with trips where HF/OBD numeric buckets align with trusted L3 each second.`,
      `4. **Conflicts:** ${conflicts.unresolved} UNRESOLVED L3/OBD conflicts need owner policy or independent witness — not auto-merge.`,
      '5. **Cornering:** 2 provider corner events — bearing witness descriptive only; video or independent IMU not in pin.',
      '6. **Brake pedal / regen:** not available in frozen pin — do not infer from deceleration candidates.',
      '',
      'No production mutations, provider calls, or threshold changes in this workstream.',
    ].join('\n'),
  );

  const resultLines = buildLdi09ResultLines({
    strictTrustedPct: coverage.trustedOnly.fraction * 100,
    trustedLimitedPct: coverage.trustedOrLimited.fraction * 100,
    fusionAssessable: coverage.fusionAssessable.buckets,
    accelCandidates: accelDecel.accelerationCount,
    accelHigh: accelDecel.highConfidenceAcceleration,
    decelCandidates: accelDecel.decelerationCount,
    decelHigh: accelDecel.highConfidenceDeceleration,
    conflictsTotal: conflicts.total,
    conflictsExplained: conflicts.explained,
    conflictsUnresolved: conflicts.unresolved,
    nativeCorners: corners.length,
  });
  fs.writeFileSync(path.join(outDir, 'LDI09_RESULT.txt'), resultLines.join('\n') + '\n');

  console.log(JSON.stringify({ ok: true, fusionAssessable: coverage.fusionAssessable.buckets, conflicts: conflicts.total }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
