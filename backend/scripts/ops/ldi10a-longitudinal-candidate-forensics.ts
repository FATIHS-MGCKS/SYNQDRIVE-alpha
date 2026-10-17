#!/usr/bin/env ts-node
/**
 * LDI-10A — longitudinal candidate forensics (offline LDI-08/09).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  LDI08_TRIP_ID,
  LDI08_VEHICLE_ID,
  runLdi10aAudit,
} from './ldi10a-longitudinal-candidate-forensics.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10A_REPO_ROOT
    ? path.resolve(process.env.LDI10A_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const audit = runLdi10aAudit(repoRoot);

  fs.writeFileSync(
    path.join(outDir, 'LDI10A_CANDIDATE_AUDIT.json'),
    JSON.stringify(
      {
        schema: 'LDI10A_CANDIDATE_AUDIT_V1',
        headSha,
        tripId: LDI08_TRIP_ID,
        vehicleId: LDI08_VEHICLE_ID,
        provenance: audit.provenance,
        coverageDenominator: audit.coverage.shadowGridDenominator,
        strictTrustedCoveragePct: (audit.coverage.trustedOnly.fraction * 100).toFixed(2),
        trustedOrLimitedCoveragePct: (audit.coverage.trustedOrLimited.fraction * 100).toFixed(2),
        fusionAssessableSeconds: audit.coverage.fusionAssessable.buckets,
        forensicsSummary: audit.forensicsSummary,
        analytics: audit.analytics,
        candidates: audit.candidateAudit,
      },
      null,
      2,
    ),
  );

  const groups = audit.maneuver.groups;
  fs.writeFileSync(
    path.join(outDir, 'LDI10A_MANEUVER_GROUPING.md'),
    [
      '# LDI10A — Maneuver grouping',
      '',
      `**Trip:** \`${LDI08_TRIP_ID}\``,
      '',
      '## Counting modes',
      '',
      `- **Independent 1s-step candidates:** **${audit.maneuver.independentCandidateCount}** (40 accel + 35 decel pairwise transitions)`,
      `- **Chained physical maneuvers** (consecutive candidates where endUtc of step n equals startUtc of step n+1, same kind): **${audit.maneuver.groupedManeuverCount}** groups`,
      '',
      'Chaining does **not** imply a single driver intent label — only temporal adjacency on the L3 grid.',
      '',
      '## Groups',
      '',
      '| Group | Kind | Steps | Window |',
      '|-------|------|-------|--------|',
      ...groups.map(
        (g) =>
          `| \`${g.groupId}\` | ${g.kind} | ${g.candidateIds.length} | \`${g.startUtc}\` → \`${g.endUtc}\` |`,
      ),
      '',
      '### Candidate IDs per group',
      '',
      ...groups.map((g) => `- **${g.groupId}:** ${g.candidateIds.map((id) => `\`${id}\``).join(', ')}`),
    ].join('\n'),
  );

  const conflictList = (audit.conflicts.conflicts as Array<Record<string, unknown>>) ?? [];
  fs.writeFileSync(
    path.join(outDir, 'LDI10A_SIGNAL_CONFLICTS.md'),
    [
      '# LDI10A — Signal conflicts & artifact screening',
      '',
      '## L3/OBD conflicts (from frozen LDI-09)',
      '',
      `Total **${conflictList.length}** documented conflicts; dispositions preserved in \`LDI09_CONFLICT_CLASSIFICATION.json\`.`,
      '',
      '## Candidate-level screening (no interpolation)',
      '',
      `- GPS jump flags: **${audit.analytics.gpsJumpFlagged}** candidates`,
      `- Unrealistic |a| > 6 m/s² (descriptive screen only): **${audit.analytics.unrealisticAccelSpike}**`,
      `- Quantized integer OBD/HF speeds at endpoints: see per-candidate \`quantizedObdOrHf\``,
      `- Missing buckets: candidates require consecutive 1s indices; non-1000ms Δt → UNKNOWN/CONFLICTED in LDI-09`,
      '',
      '## High-confidence review (not ground truth)',
      '',
      `### Acceleration (${audit.analytics.highConfidenceAccelReview.count}/40)`,
      '',
      `- OBD corroboration both ends: **${audit.analytics.highConfidenceAccelReview.obdCorroborated}**`,
      `- L3-primary only: **${audit.analytics.highConfidenceAccelReview.l3Only}**`,
      `- **High confidence ≠ independent validation** — shared DIMO/R1 lineage`,
      '',
      `### Deceleration (${audit.analytics.highConfidenceDecelReview.count}/35)`,
      '',
      `- OBD corroboration both ends: **${audit.analytics.highConfidenceDecelReview.obdCorroborated}**`,
      `- L3-primary only: **${audit.analytics.highConfidenceDecelReview.l3Only}**`,
      `- **Deceleration ≠ brake pedal or regen** — no pedal/HV channel in pin`,
      '',
      '## Error classes',
      '',
      '| Class | Meaning |',
      '|-------|---------|',
      '| `CROSS_SOURCE_CONFLICT` | L3 QC untrusted due to OBD disagreement at bucket |',
      '| `INTERVAL_ONLY` | OBD/HF bucket label ≠ point sample |',
      '| `GPS_JUMP_SUSPECT` | Path speed >> L3 band between endpoints |',
      '| `SPARSE_HF_OBD` | Witness channels absent on most grid seconds |',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10A_RESULT.md'),
    [
      '# LDI10A — Result',
      '',
      '## Provenance',
      '',
      `- LDI08 snapshot SHA-256: \`${audit.provenance.ldi08CombinedSnapshotSha256}\``,
      `- LDI08 candidates SHA-256: \`${audit.provenance.ldi08AccelDecelCandidatesSha256}\``,
      `- Pin hash: \`${audit.provenance.pinnedSnapshotHash}\` (LDI-06 expected: **${audit.provenance.pinHashMatchesLdi06Expected ? 'match' : 'MISMATCH'}**)`,
      `- Candidate reproducibility from snapshot rows: **${audit.provenance.reproducibility.byteIdenticalSequence ? 'PASS' : 'FAIL'}** (${audit.provenance.reproducibility.recomputedAccel} accel / ${audit.provenance.reproducibility.recomputedDecel} decel)`,
      '',
      '## Coverage (explicit denominator)',
      '',
      `- Shadow grid denominator: **${audit.coverage.shadowGridDenominator}** seconds`,
      `- Strict TRUSTED: **${(audit.coverage.trustedOnly.fraction * 100).toFixed(1)}%**`,
      `- TRUSTED ∪ TRUSTED_LIMITED: **${(audit.coverage.trustedOrLimited.fraction * 100).toFixed(1)}%**`,
      `- Fusion-assessable seconds: **${audit.coverage.fusionAssessable.buckets}**`,
      '',
      '## Candidates',
      '',
      `- Accel / decel: **${audit.forensicsSummary.accelerationCount}** / **${audit.forensicsSummary.decelerationCount}**`,
      `- Independent steps: **${audit.maneuver.independentCandidateCount}**; grouped maneuvers: **${audit.maneuver.groupedManeuverCount}**`,
      `- Confidence: HIGH **${audit.analytics.tierCounts.HIGH_CONFIDENCE}**, LIMITED **${audit.analytics.tierCounts.LIMITED}**, CONFLICTED **${audit.analytics.tierCounts.CONFLICTED}**, UNKNOWN **${audit.analytics.tierCounts.UNKNOWN}**`,
      `- Cross-source: L3-only **${audit.analytics.crossSource.l3PrimaryOnly}**, OBD witness **${audit.analytics.crossSource.obdWitnessBothEnds}**, HF witness **${audit.analytics.crossSource.hfWitnessBothEnds}** (not independent lineage)`,
      '',
      '## Blockers',
      '',
      '1. No native accel/brake on this pin — longitudinal candidates are L3-kinematic only.',
      '2. HF/OBD sparse — most candidates lack second-channel corroboration.',
      '3. Independent test drive needed: video/IMU/pedal logging + dense GPS + owner-approved S4 pin on event-rich trip (`a682d3df…` or successor).',
      '',
      '## Repro',
      '',
      '```bash',
      'cd backend && npm run ldi10a:longitudinal-candidate-forensics',
      '```',
      '',
      '## Result block',
      '',
      '```',
      'LDI10A_RESULT=OFFLINE_LONGITUDINAL_AUDIT_COMPLETE',
      `TRIP=${LDI08_TRIP_ID}`,
      `SNAPSHOT_SHA256=${audit.provenance.ldi08CombinedSnapshotSha256}`,
      `CANDIDATE_REPRO=${audit.provenance.reproducibility.byteIdenticalSequence ? 'PASS' : 'FAIL'}`,
      `COVERAGE_DENOMINATOR=${audit.coverage.shadowGridDenominator}`,
      `STRICT_TRUSTED_PCT=${(audit.coverage.trustedOnly.fraction * 100).toFixed(1)}`,
      `CANDIDATES_INDEPENDENT=${audit.maneuver.independentCandidateCount}`,
      `MANEUVERS_GROUPED=${audit.maneuver.groupedManeuverCount}`,
      `HIGH_CONF_ACCEL=${audit.forensicsSummary.highConfidenceAcceleration}`,
      `HIGH_CONF_DECEL=${audit.forensicsSummary.highConfidenceDeceleration}`,
      `L3_ONLY_CANDIDATES=${audit.analytics.crossSource.l3PrimaryOnly}`,
      `OBD_WITNESS_CANDIDATES=${audit.analytics.crossSource.obdWitnessBothEnds}`,
      'PRODUCTION_MUTATIONS=NONE',
      'STOP=LDI10A_complete_no_LDI10B_no_deploy',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, candidates: audit.candidateAudit.length, maneuvers: audit.maneuver.groupedManeuverCount }));
}

main();
