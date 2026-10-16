#!/usr/bin/env ts-node
/**
 * LDI-10B — longitudinal maneuver physics & integrity (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { LDI08_TRIP_ID, LDI08_VEHICLE_ID } from './ldi10a-longitudinal-candidate-forensics.lib';
import { runLdi10bAudit } from './ldi10b-maneuver-physics-audit.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10B_REPO_ROOT
    ? path.resolve(process.env.LDI10B_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const audit = runLdi10bAudit(repoRoot);

  fs.writeFileSync(
    path.join(outDir, 'LDI10B_MANEUVER_PHYSICS.json'),
    JSON.stringify({ schema: 'LDI10B_MANEUVER_PHYSICS_V1', headSha, tripId: LDI08_TRIP_ID, vehicleId: LDI08_VEHICLE_ID, ...audit }, null, 2),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10B_GROUPING_INTEGRITY.md'),
    [
      '# LDI10B — Grouping integrity',
      '',
      `**Trip:** \`${LDI08_TRIP_ID}\` · **Groups reproduced:** **${audit.reproduction.groupCount}** (LDI-10A: ${audit.reproduction.matchesLdi10aGrouping ? 'match' : 'DRIFT'})`,
      '',
      '## Reproduction',
      '',
      `- Candidates: **${audit.reproduction.candidateCount}**`,
      `- LDI08 snapshot SHA-256: \`${audit.reproduction.hashes.ldi08CombinedSnapshotSha256}\``,
      `- LDI10A audit SHA-256: \`${audit.reproduction.hashes.ldi10aCandidateAuditSha256}\``,
      '',
      '## Size distribution (steps per group)',
      '',
      '| Steps | Groups |',
      '|-------|--------|',
      ...Object.entries(audit.groupSizeDistribution)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => `| ${k} | ${v} |`),
      '',
      '## Segmentation review',
      '',
      '- **Oversegmentation:** single-step groups (`oversplitRisk` in JSON) — short Δv chains split by ±3 km/h gate.',
      '- **Undersegmentation:** multi-step chains (4+ steps) — continuous accel/decel on 1 Hz L3 grid.',
      '- **Sign changes:** not merged across kinds — accel and decel groups remain separate (no mixed-sign single group).',
      '- **Pauses / gaps:** `gapToNextGridSecondMs` after group end; no interpolation across missing buckets.',
      '',
      '## Sensitivity (not activated)',
      '',
      '```json',
      JSON.stringify(audit.sensitivityAnalysis, null, 2),
      '```',
      '',
      '## Boundary impact (UNTRUSTED / ROW_ABSENT)',
      '',
      `- UNTRUSTED buckets (trip): **${audit.boundaryImpact.untrustedBucketCount}** — groups touching: **${audit.boundaryImpact.groupsWithAnyUntrustedBucketInWindow}**`,
      `- ROW_ABSENT GPS buckets: **${audit.boundaryImpact.rowAbsentBucketCount}** — groups touching: **${audit.boundaryImpact.groupsWithAnyRowAbsentInWindow}**`,
      '',
      audit.boundaryImpact.interpretabilityNote,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10B_CROSS_SOURCE_AUDIT.md'),
    [
      '# LDI10B — Cross-source audit',
      '',
      `**Lineage:** ${audit.crossSource.sharedLineage}`,
      '',
      '## OBD witness candidates (3)',
      '',
      'Corroboration = speed agreement within existing provisional band at **both** step endpoints. **Not** independent ground truth.',
      '',
      '| Candidate | Window | OBD offset start/end ms |',
      '|-----------|--------|-------------------------|',
      ...audit.crossSource.obdWitnessCandidates.map(
        (c) =>
          `| \`${c.candidateId}\` | ${c.startUtc}→${c.endUtc} | ${c.temporalOffsetObdStartMs}/${c.temporalOffsetObdEndMs} |`,
      ),
      '',
      '## HF witness',
      '',
      `HF witness steps: **${audit.crossSource.hfWitnessCandidates.length}** (often same R1 payload as OBD — avoid double-counting as independent confirmations).`,
      '',
      `Distinct witness step IDs (union): **${audit.crossSource.distinctWitnessStepCount}**`,
      '',
      '## High-confidence vs conflicted',
      '',
      `- HIGH confidence candidates: **${audit.highConfidenceCandidateReview.count}** (peaks flagged: **${audit.highConfidenceCandidateReview.unrealisticPeak}**, GPS jump: **${audit.highConfidenceCandidateReview.gpsJump}**)`,
      `- CONFLICTED candidates: **${audit.conflictedCandidates.length}** — see JSON array`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10B_CAPTURE_REQUIREMENTS.md'),
    [
      '# LDI10B — Capture requirements (independent Ruptela test drive)',
      '',
      '## Required',
      '',
      '1. **Dense GPS positions** (≤1 Hz sustained, no 7s waypoint gaps) for L3/QC on event windows.',
      '2. **S4 pin** with POSITION + R1_OBD channels for same trip (owner-approved backfill).',
      '3. **Native TELEMETRY_EVENTS** incl. accel/brake/corner with provider timestamps.',
      '4. **Time sync record** — independent UTC reference (video clap / GNSS log) to bound bucket uncertainty.',
      '',
      '## Optional (not in current pin)',
      '',
      '- Brake pedal / master cylinder pressure (not inferable from decel).',
      '- HV regen torque (not inferable from decel).',
      '- IMU longitudinal accel (independent of DIMO path).',
      '- Dashboard video for human context only.',
      '',
      '## Success criteria',
      '',
      '- Trip with both native accel **and** brake events **and** assessable multi-stream seconds ≫ 28.',
      '- Event-rich historical trip `a682d3df…` or new drive with boundary admission for S4 discovery.',
    ].join('\n'),
  );

  const taxCounts = {
    LONGITUDINAL_ACCELERATION: audit.groups.filter((g) => g.taxonomy === 'LONGITUDINAL_ACCELERATION').length,
    LONGITUDINAL_DECELERATION: audit.groups.filter((g) => g.taxonomy === 'LONGITUDINAL_DECELERATION').length,
    MIXED_LONGITUDINAL_DYNAMICS: audit.groups.filter((g) => g.taxonomy === 'MIXED_LONGITUDINAL_DYNAMICS').length,
    UNCLEAR: audit.groups.filter((g) => g.taxonomy === 'UNCLEAR').length,
  };

  fs.writeFileSync(
    path.join(outDir, 'LDI10B_RESULT.md'),
    [
      '# LDI10B — Result',
      '',
      '## Coverage (denominator 362)',
      '',
      `- Strict TRUSTED: **${audit.coverage.strictTrustedPct}%**`,
      `- TRUSTED ∪ LIMITED: **${audit.coverage.trustedOrLimitedPct}%**`,
      `- UNTRUSTED buckets: **${audit.coverage.untrustedBuckets}**`,
      `- ROW_ABSENT GPS: **${audit.coverage.rowAbsentGpsBuckets}**`,
      '',
      '## Groups',
      '',
      `- Count: **${audit.reproduction.groupCount}**`,
      `- Plausible / implausible peak / unclear: **${audit.plausibilitySummary.plausible}** / **${audit.plausibilitySummary.implausible}** / **${audit.plausibilitySummary.unclear}**`,
      `- Taxonomy: accel **${taxCounts.LONGITUDINAL_ACCELERATION}**, decel **${taxCounts.LONGITUDINAL_DECELERATION}**, mixed **${taxCounts.MIXED_LONGITUDINAL_DYNAMICS}**, unclear **${taxCounts.UNCLEAR}**`,
      '',
      '## Cross-source',
      '',
      `- OBD witness candidate steps: **${audit.crossSource.obdWitnessCandidates.length}**`,
      `- Distinct witness union: **${audit.crossSource.distinctWitnessStepCount}** (correlated lineage)`,
      '',
      '## Repro',
      '',
      '```bash',
      'cd backend && npm run ldi10b:maneuver-physics-audit',
      '```',
      '',
      '```',
      'LDI10B_RESULT=MANEUVER_PHYSICS_AUDIT_COMPLETE',
      `GROUP_COUNT=${audit.reproduction.groupCount}`,
      `CANDIDATE_COUNT=${audit.reproduction.candidateCount}`,
      `GROUP_SIZE_DIST=${JSON.stringify(audit.groupSizeDistribution)}`,
      `PLAUSIBLE_GROUPS=${audit.plausibilitySummary.plausible}`,
      `IMPLAUSIBLE_GROUPS=${audit.plausibilitySummary.implausible}`,
      `UNCLEAR_GROUPS=${audit.plausibilitySummary.unclear}`,
      `CROSS_SOURCE_OBD_WITNESS_STEPS=${audit.crossSource.obdWitnessCandidates.length}`,
      `COVERAGE_DENOMINATOR=${audit.coverage.denominatorShadowGridSeconds}`,
      `STRICT_TRUSTED_PCT=${audit.coverage.strictTrustedPct}`,
      'OPEN_EVIDENCE_GAPS=native_accel_brake_missing;sparse_obd_hf;no_pedal_regen;shared_provider_lineage',
      'PRODUCTION_MUTATIONS=NONE',
      'STOP=LDI10B_complete_no_LDI10C_no_deploy',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, groups: audit.reproduction.groupCount, plausible: audit.plausibilitySummary.plausible }));
}

main();
