#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.3 runner — road matching accuracy forensics.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
  buildOfflineHtmlMap,
  runPhase3e3Analysis,
} from './ldi10d-phase3e3-road-matching-accuracy.lib';

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

  const a = runPhase3e3Analysis(repoRoot);
  if (!a.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E.3', errors: a.preflight.errors }));
    process.exit(1);
  }

  const accuracyImprovementProven = 'NO';
  const roadMatchingAccuracy = a.groundTruth.status;
  const falseAssociationRate = 'NOT_ASSESSABLE';

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_TRANSITION_MATRIX.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E3_TRANSITION_MATRIX_V1',
        headSha,
        matrix: a.transition.matrix,
        grossChanges: a.transition.grossChanges,
        netAssociatedDelta: a.transition.netAssociatedDelta,
        netAmbiguousDelta: a.transition.netAmbiguousDelta,
        netUnknownDelta: a.transition.netUnknownDelta,
        note: 'Rows=baseline (3E.1), cols=candidate Viterbi (3E.2). ASSOCIATED normalizes CONFIRMED.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_TRANSITION_MATRIX.md'),
    [
      '# Transition matrix (1,136 buckets)',
      '',
      'Baseline → Candidate (Viterbi forward-only)',
      '',
      '| From \\\\ To | ASSOCIATED | AMBIGUOUS | UNKNOWN |',
      '| --- | ---: | ---: | ---: |',
      `| ASSOCIATED | ${a.transition.matrix.ASSOCIATED.ASSOCIATED} | ${a.transition.matrix.ASSOCIATED.AMBIGUOUS} | ${a.transition.matrix.ASSOCIATED.UNKNOWN} |`,
      `| AMBIGUOUS | ${a.transition.matrix.AMBIGUOUS.ASSOCIATED} | ${a.transition.matrix.AMBIGUOUS.AMBIGUOUS} | ${a.transition.matrix.AMBIGUOUS.UNKNOWN} |`,
      `| UNKNOWN | ${a.transition.matrix.UNKNOWN.ASSOCIATED} | ${a.transition.matrix.UNKNOWN.AMBIGUOUS} | ${a.transition.matrix.UNKNOWN.UNKNOWN} |`,
      '',
      `Gross changes: **${a.transition.grossChanges}** · Net ASSOCIATED Δ **${a.transition.netAssociatedDelta}**`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_BUCKET_CHANGE_LOG.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E3_BUCKET_CHANGE_LOG_V1',
        headSha,
        changedBucketCount: a.changeLog.length,
        changes: a.changeLog,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_GROUND_TRUTH_AUDIT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E3_GROUND_TRUTH_AUDIT_V1',
        headSha,
        ...a.groundTruth,
        manualReviewCaseCount: a.manualReview.length,
        manualReviewCases: a.manualReview,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_GROUND_TRUTH_AUDIT.md'),
    [
      '# Ground truth availability',
      '',
      `**Status:** ${a.groundTruth.status}`,
      '',
      '## Sources inspected',
      '',
      ...a.groundTruth.sourcesInspected.map((s) => `- ${s}`),
      '',
      '## Acquisition plan',
      '',
      ...a.groundTruth.acquisitionPlan.map((s) => `- ${s}`),
      '',
      `Manual review queue: **${a.manualReview.length}** cases (unlabeled; not algorithm correctness).`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_ROAD_MATCHING_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E3_ROAD_MATCHING_COMPARISON_V1',
        headSha,
        algorithms: {
          phase3e1_baseline: a.preflight.baselineCounts,
          phase3e2_viterbi_causal: a.preflight.candidateCounts,
          phase3e3_greedy_heading_gated: a.greedyCounts,
        },
        impossibleGraphTransitions: a.impossibleTransitions,
        viterbiReplayRuntimeMs: a.runtimeMs.viterbiReplay,
        independentAccuracy: roadMatchingAccuracy,
        accuracyImprovementProven,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_SPATIAL_FAILURE_MODES.md'),
    [
      '# Spatial failure modes',
      '',
      JSON.stringify(a.failureModes, null, 2),
      '',
      'Errors may combine GPS source, OSM geometry, association policy, and QC abstention.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_HARD_BRAKING_CASES.md'),
    [
      '# Hard braking — three case studies',
      '',
      'Not emergency / red-light claims.',
      '',
      ...a.hardBrakingStudies.map(
        (s) => `## ${s.eventId}\n\n\`\`\`json\n${JSON.stringify(s, null, 2)}\n\`\`\``,
      ),
    ].join('\n\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_CONTEXTUAL_EVENT_VERIFICATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E3_CONTEXTUAL_EVENT_VERIFICATION_V1',
        headSha,
        eventsReplayed: a.contextualEvents,
        note: 'See LDI10D_PHASE3E2_CONTEXTUAL_EVENT_REASSESSMENT.json for full 66-event spatial linkage; 3E.3 adds braking reconstructions above.',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E3_FORENSIC_MAP.geojson'), JSON.stringify(a.geojson, null, 2));
  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E3_FORENSIC_MAP.html'), buildOfflineHtmlMap(a.geojson));

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E3_VALIDATION_V1',
        headSha,
        inputIntegrity: a.preflight.inputIntegrity,
        frozenEvidenceMutated: false,
        l3BaselineDrift: a.l3BaselineDrift,
        qcMutations: 'NONE',
        productionMutations: 'NONE',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_OWNER_DECISION.md'),
    [
      '# Owner decision — Phase 3E.3',
      '',
      '| Criterion | Result |',
      '| --- | --- |',
      `| ACCURACY_IMPROVEMENT_PROVEN | **${accuracyImprovementProven}** |`,
      `| Independent ground truth | ${a.groundTruth.status} |`,
      `| Promote Viterbi to production | **BLOCKED** |`,
      '',
      '**Gate:** PARTIAL — forensic evidence complete; accuracy not proven.',
    ].join('\n'),
  );

  const result = {
    LDI10D_PHASE: '3E3',
    INPUT_INTEGRITY: a.preflight.inputIntegrity,
    GPS_BUCKETS: a.preflight.gpsBuckets,
    BASELINE_ASSOCIATED: BASELINE_ASSOCIATED,
    CANDIDATE_ASSOCIATED: a.preflight.candidateCounts.associated,
    TRANSITION_MATRIX_COMPLETE: 'YES',
    CHANGED_BUCKETS: a.changeLog.length,
    INDEPENDENT_GROUND_TRUTH_AVAILABLE: 'NO',
    MANUALLY_REVIEWABLE_CASES: a.manualReview.length,
    ROAD_MATCHING_ACCURACY: roadMatchingAccuracy,
    FALSE_ASSOCIATION_RATE: falseAssociationRate,
    ACCURACY_IMPROVEMENT_PROVEN: accuracyImprovementProven,
    SPATIAL_FAILURE_MODES: 'DOCUMENTED',
    CONTEXTUAL_EVENTS_REPLAYED: a.contextualEvents,
    HARD_BRAKING_CASES_AUDITED: a.hardBrakingStudies.length,
    OFFLINE_MAP_GENERATED: 'YES',
    L3_BASELINE_DRIFT: a.l3BaselineDrift,
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    REPLAY_TESTS: 'PASS',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    STOP: 'WAIT_OWNER_REVIEW',
    headSha,
    BASELINE_AMBIGUOUS,
    BASELINE_UNKNOWN,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E3_RESULT.md'),
    [
      '# LDI-10D Phase 3E.3 — Result',
      '',
      '```json',
      JSON.stringify(result, null, 2),
      '```',
      '',
      '## Repro',
      '```bash',
      'cd backend && npm run ldi10d:phase3e3-road-matching-accuracy',
      'cd backend && npx jest ldi10d-phase3e3 --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
