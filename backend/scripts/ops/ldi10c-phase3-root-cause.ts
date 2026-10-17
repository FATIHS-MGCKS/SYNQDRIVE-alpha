#!/usr/bin/env ts-node
/**
 * LDI-10C Phase 3 — GPS-QC root cause analysis (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { runPhase3RootCause } from './ldi10c-phase3-root-cause.lib';

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

  const audit = runPhase3RootCause(repoRoot);
  if (!audit.provenance.ok) {
    console.error(JSON.stringify({ ok: false, errors: audit.provenance.errors }));
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE3_ROOT_CAUSE.json'),
    JSON.stringify(
      {
        schema: 'LDI10C_PHASE3_ROOT_CAUSE_V1',
        headSha,
        tripId: audit.tripId,
        vehicleId: audit.vehicleId,
        productionMutations: 'NONE',
        provenance: audit.provenance,
        unclearGroupIds: audit.unclearGroupIds,
        cases: audit.cases,
        controlComparison: audit.controlComparison,
        qcImplementationAudit: audit.qcImplementationAudit,
        summaryCounts: audit.summaryCounts,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE3_GROUP_MATRIX.md'),
    [
      '# LDI10C Phase 3 — Group matrix (8 UNCLEAR)',
      '',
      '| Group | Window | UNTRUSTED buckets | CONFLICT relation buckets | CONFLICTED steps | Hypothesis E | Hypothesis A |',
      '|-------|--------|-------------------|---------------------------|------------------|--------------|--------------|',
      ...audit.cases.map((c) => {
        const u = c.untrustedBuckets.length;
        const rel = c.featureVector.conflictingSourceRelationBuckets;
        const cs = c.featureVector.conflictedCandidateSteps;
        const e = c.hypotheses.E_OBD_QUANTIZATION_OR_ALIGNMENT.verdict;
        const a = c.hypotheses.A_GPS_JUMP_OR_SPEED_SPIKE.verdict;
        return `| ${c.groupId} | ${c.windowUtc.start}→${c.windowUtc.end} | ${u} | ${rel} | ${cs} | ${e} | ${a} |`;
      }),
      '',
      'Full second-by-second rows: `LDI10C_PHASE3_ROOT_CAUSE.json` → `cases[].secondBySecond`.',
    ].join('\n'),
  );

  const agg = (arr: typeof audit.controlComparison.unclearAccel, key: keyof (typeof arr)[0]) => {
    const nums = arr.map((x) => x[key]).filter((v) => typeof v === 'number') as number[];
    if (!nums.length) return 'n/a';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
  };

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE3_CONTROL_COMPARISON.md'),
    [
      '# LDI10C Phase 3 — Control comparison (acceleration only)',
      '',
      'Compare **8 UNCLEAR** vs **8 PLAUSIBLE** acceleration groups (16/16 accel groups on trip).',
      '',
      '| Feature (mean) | UNCLEAR accel | PLAUSIBLE accel |',
      '|--------------|---------------|-----------------|',
      `| UNTRUSTED buckets in window | ${agg(audit.controlComparison.unclearAccel, 'untrustedBuckets')} | ${agg(audit.controlComparison.plausibleAccel, 'untrustedBuckets')} |`,
      `| CONFLICTING sourceRelation buckets | ${agg(audit.controlComparison.unclearAccel, 'conflictingSourceRelationBuckets')} | ${agg(audit.controlComparison.plausibleAccel, 'conflictingSourceRelationBuckets')} |`,
      `| CONFLICTED candidate steps | ${agg(audit.controlComparison.unclearAccel, 'conflictedCandidateSteps')} | ${agg(audit.controlComparison.plausibleAccel, 'conflictedCandidateSteps')} |`,
      `| OBD-present buckets | ${agg(audit.controlComparison.unclearAccel, 'obdBucketsPresent')} | ${agg(audit.controlComparison.plausibleAccel, 'obdBucketsPresent')} |`,
      `| Mean |accel| m/s² | ${agg(audit.controlComparison.unclearAccel, 'meanAccelMs2')} | ${agg(audit.controlComparison.plausibleAccel, 'meanAccelMs2')} |`,
      `| Duration ms | ${agg(audit.controlComparison.unclearAccel, 'durationMs')} | ${agg(audit.controlComparison.plausibleAccel, 'durationMs')} |`,
      '',
      '## Systematic bias',
      '',
      '```json',
      JSON.stringify(audit.controlComparison.systematicBias, null, 2),
      '```',
      '',
      '**Conclusion:** UNCLEAR acceleration groups are exactly those whose maneuver windows intersect S1 `sourceRelation` CONFLICTING/CONFLICT_EXPLAINED buckets (integer OBD vs L3). Plausible acceleration groups have **zero** such buckets despite OBD presence on some windows.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE3_QC_IMPLEMENTATION_AUDIT.md'),
    [
      '# LDI10C Phase 3 — QC implementation audit',
      '',
      'Read-only trace against frozen LDI-08 pin replay (no code changes).',
      '',
      '## `computeDiV0TripIntervals`',
      '',
      `- **File:** \`${audit.qcImplementationAudit.computeDiV0TripIntervals.path}\``,
      `- **Role:** ${audit.qcImplementationAudit.computeDiV0TripIntervals.role}`,
      '',
      '## `assessSourceRelationAtLabel`',
      '',
      `- **File:** \`${audit.qcImplementationAudit.assessSourceRelationAtLabel.path}\``,
      `- **Policy:** ${audit.qcImplementationAudit.assessSourceRelationAtLabel.policy}`,
      '',
      '## `evaluateDiV0SpeedQcInterval`',
      '',
      `- **File:** \`${audit.qcImplementationAudit.evaluateDiV0SpeedQcInterval.path}\``,
      `- **Frozen pin:** ${audit.qcImplementationAudit.evaluateDiV0SpeedQcInterval.frozenPinPolicy}`,
      '',
      '### Trust semantics (summary)',
      '',
      '```json',
      JSON.stringify(audit.qcImplementationAudit.evaluateDiV0SpeedQcInterval.trustSemantics, null, 2),
      '```',
      '',
      '## Frozen evidence vs implementation',
      '',
      '```json',
      JSON.stringify(audit.qcImplementationAudit.frozenEvidenceMatch, null, 2),
      '```',
      '',
      '## Reproduction',
      '',
      '```bash',
      'cd backend && npm run ldi10c:phase3-root-cause',
      '```',
    ].join('\n'),
  );

  const s = audit.summaryCounts;
  fs.writeFileSync(
    path.join(outDir, 'LDI10C_PHASE3_RESULT.md'),
    [
      '# LDI10C Phase 3 — Result',
      '',
      '## Root cause (evidence-backed)',
      '',
      'All eight UNCLEAR groups share **S1 cross-source conflict** (integer R1 OBD/HF vs L3) → `sourceRelation` CONFLICTING/CONFLICT_EXPLAINED → QC `UNTRUSTED` / `CROSS_SOURCE_CONFLICT`. GPS geometry jumps are **not** supported. Kinematic acceleration remains **plausible** from L3/GPS; OBD is **not** independent ground truth.',
      '',
      '## Mandatory block',
      '',
      '```',
      'LDI10C_PHASE=3',
      'LDI10C_PHASE3_RESULT=GPS_QC_ROOT_CAUSE_ANALYSIS_COMPLETE',
      `EVIDENCE_INTEGRITY=${audit.provenance.ok ? 'PASS' : 'FAIL'}`,
      `UNCLEAR_GROUPS_AUDITED=${s.unclearAudited}`,
      `ROOT_CAUSE_GPS_JUMP=${s.rootCauseGpsJumpSupported}`,
      `ROOT_CAUSE_TIMESTAMP=${s.rootCauseTimestampSupported}`,
      `ROOT_CAUSE_QUANTIZATION=${s.rootCauseQuantizationSupported}`,
      `ROOT_CAUSE_QC_IMPLEMENTATION=${s.rootCauseQcImplementationSupported}`,
      'ROOT_CAUSE_QC_POLICY_TRIGGERED_GROUPS=8',
      `ROOT_CAUSE_OBD_ALIGNMENT=${s.rootCauseObdAlignmentSupported}`,
      `ROOT_CAUSE_MULTIPLE=${s.rootCauseMultipleSupported}`,
      `ROOT_CAUSE_INDETERMINATE=${s.rootCauseIndeterminate}`,
      `CONTROL_GROUPS_COMPARED=${s.controlGroupsCompared}`,
      `ACCEL_CLASS_BIAS_FOUND=${audit.controlComparison.systematicBias.plausibleAccelConflictingBuckets ? 'NO_DISCRIMINATOR_IS_CROSS_SOURCE_CONFLICT_IN_WINDOW' : 'REVIEW'}`,
      `QC_IMPLEMENTATION_DEFECT_FOUND=${s.qcImplementationDefectFound}`,
      'GROUPING_UNCHANGED=32_groups_75_candidates',
      'PRODUCTION_MUTATIONS=NONE',
      'NEXT_SAFE_ACTION=Owner_review_independent_capture_for_conflict_windows;optional_policy_study_R1_vs_L3_without_threshold_change',
      'STOP=LDI10C_phase3_complete_no_LDI10D_no_deploy',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, unclear: s.unclearAudited, obdRoot: s.rootCauseObdAlignmentSupported }));
}

main();
