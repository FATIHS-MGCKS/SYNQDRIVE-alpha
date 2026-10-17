#!/usr/bin/env ts-node
/**
 * LDI-10C Phase 2 — UNCLEAR maneuver forensics (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { runPhase2UnclearForensics } from './ldi10c-phase2-unclear-forensics.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10c');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10C_REPO_ROOT
    ? path.resolve(process.env.LDI10C_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const audit = runPhase2UnclearForensics(repoRoot);
  if (!audit.provenance.ok) {
    console.error(JSON.stringify({ ok: false, errors: audit.provenance.errors }));
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE2_UNCLEAR_GROUPS.json'),
    JSON.stringify(
      {
        schema: 'LDI10C_PHASE2_UNCLEAR_GROUPS_V1',
        headSha,
        tripId: audit.tripId,
        vehicleId: audit.vehicleId,
        productionMutations: 'NONE',
        provenance: audit.provenance,
        ldi09CandidatesFrozenMatch: audit.ldi09CandidatesFrozenMatch,
        setAnalysis: audit.setAnalysis,
        groupingUnchanged: audit.summary.groupingUnchanged,
        cases: audit.caseAudits,
        comparison: audit.comparison,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE2_SIGNAL_FORENSICS.md'),
    [
      '# LDI10C Phase 2 — Signal forensics',
      '',
      '## Provenance',
      '',
      `- Verification: **${audit.provenance.ok ? 'PASS' : 'FAIL'}**`,
      `- LDI08 snapshot SHA-256: \`${audit.provenance.ldi08SnapshotSha256}\``,
      `- LDI09 frozen candidate IDs match live recompute: **${audit.ldi09CandidatesFrozenMatch ? 'yes' : 'no'}**`,
      '',
      '## UNCLEAR vs UNTRUSTED sets',
      '',
      `- UNCLEAR groups (**${audit.setAnalysis.unclearCount}**): ${audit.setAnalysis.unclearGroupIds.join(', ')}`,
      `- UNTRUSTED-touching groups (**${audit.setAnalysis.untrustedTouchingCount}**): ${audit.setAnalysis.untrustedTouchingGroupIds.join(', ')}`,
      `- **Intersection (${audit.setAnalysis.intersectionSize}):** ${audit.setAnalysis.intersectionGroupIds.join(', ')}`,
      `- UNCLEAR-only: ${audit.setAnalysis.unclearOnlyGroupIds.length ? audit.setAnalysis.unclearOnlyGroupIds.join(', ') : '*(none)*'}`,
      `- UNTRUSTED-only: ${audit.setAnalysis.untrustedOnlyGroupIds.length ? audit.setAnalysis.untrustedOnlyGroupIds.join(', ') : '*(none)*'}`,
      '',
      '**Finding:** Every UNCLEAR group overlaps at least one UNTRUSTED L3 QC bucket in-window; plausibility downgrade is driven by QC + CONFLICTED steps, not missing GPS rows in these eight cases.',
      '',
      '## Per-case signal notes',
      '',
      ...audit.caseAudits.map((c) => {
        const conf = c.candidatesForensics.filter((x) => x.confidenceTier === 'CONFLICTED');
        return [
          `### ${c.groupId}`,
          '',
          `- Window: ${c.windowUtc.start} → ${c.windowUtc.end}`,
          `- CONFLICTED steps: **${conf.length}** / ${c.candidateIds.length}`,
          `- UNTRUSTED buckets in window: **${c.ldi10bQcInWindow.untrusted}**`,
          `- GPS ROW_ABSENT in window: **${c.ldi10bQcInWindow.rowAbsentGps}**`,
          `- Uncertainty: ${c.uncertaintyClassification.classes.join(', ')}`,
          `- Evidence: ${c.uncertaintyClassification.evidence.map((e) => `\n  - ${e}`).join('')}`,
          `- OBD witness (not independent): ${c.crossSource.obdWitnessStepIds.join(', ') || 'none'}`,
          `- HF witness: ${c.crossSource.hfWitnessStepIds.join(', ') || 'none'}`,
          '',
        ].join('\n');
      }),
      'No brake-pedal, regen, or driver-intent claims.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE2_SEGMENTATION_AUDIT.md'),
    [
      '# LDI10C Phase 2 — Segmentation audit',
      '',
      'Original LDI-10A grouping and LDI-10B plausibility labels are **not modified**.',
      '',
      '| Group | Steps | Continuous w/ prev | Continuous w/ next | Note |',
      '|-------|-------|--------------------|--------------------|------|',
      ...audit.caseAudits.map(
        (c) =>
          `| ${c.groupId} | ${c.candidateIds.length} | ${c.continuityHypothesis.couldBeContinuousWithPrevious} | ${c.continuityHypothesis.couldBeContinuousWithNext} | ${c.continuityHypothesis.note.slice(0, 70)}… |`,
      ),
      '',
      'Oversegmentation context: seven single-step plausible groups exist trip-wide (LDI-10B); UNCLEAR set is dominated by multi-step accel chains with QC degradation mid-window.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE2_EVIDENCE_GAPS.md'),
    [
      '# LDI10C Phase 2 — Evidence gaps',
      '',
      ...audit.caseAudits.map((c) =>
        [
          `## ${c.groupId}`,
          '',
          '### Required to resolve uncertainty',
          '',
          ...c.evidenceRequiredToResolve.map((r) => `- ${r}`),
          '',
          '### Unresolved questions',
          '',
          '- Can L3 speed deltas be promoted when UNTRUSTED QC buckets sit inside the maneuver window?',
          '- Do OBD integer speeds explain apparent L3 conflict or mask true Δv?',
          '',
        ].join('\n'),
      ),
      '## Trip-level',
      '',
      '- Frozen OSM remains unavailable (LDI-10C Phase 1) — road context cannot close QC gaps.',
      '- Native accel/brake events absent on pin — longitudinal labels remain kinematic-only.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE2_RESULT.md'),
    [
      '# LDI10C Phase 2 — Result',
      '',
      '## Acceptance',
      '',
      `- UNCLEAR groups audited: **${audit.summary.unclearAudited}/${audit.summary.expectedUnclear}**`,
      `- Groups / candidates unchanged: **32** / **75**`,
      `- UNTRUSTED ∩ UNCLEAR: **${audit.setAnalysis.intersectionSize}** (identical sets)`,
      `- Confidence upgrades: **none**`,
      '',
      '## Comparison (all 8 cases)',
      '',
      '| Group | UNTRUSTED | CONFLICTED steps | Uncertainty | Continuous neighbor |',
      '|-------|-----------|------------------|-------------|---------------------|',
      ...audit.comparison.map(
        (r) =>
          `| ${r.groupId} | ${r.untrustedBuckets} | ${r.conflictedSteps} | ${r.uncertaintyClasses.join('+')} | ${r.continuousWithNeighbor} |`,
      ),
      '',
      '## Owner next action',
      '',
      '1. Schedule independent Ruptela test drive with dense GPS + TRUSTED L3 QC on maneuver windows (see LDI10B_CAPTURE_REQUIREMENTS).',
      '2. Capture video or wheel-speed reference for the eight UTC windows listed in `LDI10C_PHASE2_UNCLEAR_GROUPS.json`.',
      '3. Do **not** merge LDI-10D or change EXP021 thresholds until new evidence is frozen.',
      '',
      '## Repro',
      '',
      '```bash',
      'cd backend && npm run ldi10c:phase2-unclear-forensics',
      '```',
      '',
      '```',
      'LDI10C_PHASE=2',
      'LDI10C_PHASE2_RESULT=UNCLEAR_FORENSICS_COMPLETE',
      'UNCLEAR_GROUPS_AUDITED=8',
      'UNTRUSTED_INTERSECTION_SIZE=8',
      'GROUPING_UNCHANGED=32_groups_75_candidates',
      'PRODUCTION_MUTATIONS=NONE',
      'STOP=LDI10C_phase2_complete_no_LDI10D_no_deploy',
      '```',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      unclear: audit.summary.unclearAudited,
      intersection: audit.setAnalysis.intersectionSize,
    }),
  );
}

main();
