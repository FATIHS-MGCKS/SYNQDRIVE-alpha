#!/usr/bin/env ts-node
/**
 * LDI-10D F4-B runner — ambiguous promotion evidence audit.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  promotionsToCsvRows,
  runF4bAmbiguousPromotionAudit,
  F4B_EXPECTED_AMBIG_TO_UNKNOWN,
  F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE,
  F4B_EXPECTED_PROMOTIONS,
} from './ldi10d-f4b-ambiguous-promotion-audit.lib';

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

  const a = runF4bAmbiguousPromotionAudit(repoRoot);
  if (!a.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: 'F4B', errors: a.preflight.errors }));
    process.exit(1);
  }

  const reproOk =
    a.reproducibility.promotionCount === F4B_EXPECTED_PROMOTIONS &&
    a.reproducibility.ambiguousToUnknown === F4B_EXPECTED_AMBIG_TO_UNKNOWN &&
    a.reproducibility.baselineAssociatedUnchanged === F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE &&
    a.reproducibility.baselineAssociatedRowStable;

  if (!reproOk || a.promotions.length !== F4B_EXPECTED_PROMOTIONS) {
    console.error(
      JSON.stringify({
        ok: false,
        phase: 'F4B',
        reproducibility: a.reproducibility,
        promotionRecords: a.promotions.length,
      }),
    );
    process.exit(1);
  }

  const payload = {
    schema: 'LDI10D_F4B_AMBIGUOUS_PROMOTIONS_V1',
    headSha,
    mode: 'OFFLINE_RESEARCH_ONLY',
    reproducibility: a.reproducibility,
    classDistribution: a.classDistribution,
    competitorsWithin5mHistogram: a.competitorsWithin5mHistogram,
    impossibleTransitions: a.impossibleTransitions,
    recurringAmbiguityCauses: a.recurringAmbiguityCauses,
    candidateCollapseAssessment: a.candidateCollapseAssessment,
    roadIdAccuracy: a.roadIdAccuracy,
    promotions: a.promotions,
  };

  fs.writeFileSync(path.join(out, 'LDI10D_F4B_AMBIGUOUS_PROMOTIONS.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(out, 'LDI10D_F4B_AMBIGUOUS_PROMOTIONS.csv'), promotionsToCsvRows(a.promotions));

  const md = [
    '# LDI-10D F4-B — Ambiguous promotion evidence audit',
    '',
    `Head: \`${headSha}\``,
    '',
    '## Reproducibility (A)',
    '',
    `| Check | Expected | Observed |`,
    `| --- | ---: | ---: |`,
    `| AMBIGUOUS→ASSOCIATED promotions | ${F4B_EXPECTED_PROMOTIONS} | ${a.reproducibility.promotionCount} |`,
    `| AMBIGUOUS→UNKNOWN | ${F4B_EXPECTED_AMBIG_TO_UNKNOWN} | ${a.reproducibility.ambiguousToUnknown} |`,
    `| Baseline ASSOCIATED stable | ${F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE} | ${a.reproducibility.baselineAssociatedUnchanged} |`,
    `| No ASSOCIATED demotions | yes | ${a.reproducibility.baselineAssociatedRowStable ? 'yes' : 'no'} |`,
    '',
    '## Decision classes (C)',
    '',
    `| Class | Count |`,
    `| --- | ---: |`,
    `| TOPOLOGY_PLAUSIBLE | ${a.classDistribution.TOPOLOGY_PLAUSIBLE} |`,
    `| STILL_AMBIGUOUS | ${a.classDistribution.STILL_AMBIGUOUS} |`,
    `| STRUCTURALLY_CONTRADICTED | ${a.classDistribution.STRUCTURALLY_CONTRADICTED} |`,
    `| INSUFFICIENT_EVIDENCE | ${a.classDistribution.INSUFFICIENT_EVIDENCE} |`,
    '',
    '## Competitors within 5 m (promotions)',
    '',
    '```json',
    JSON.stringify(a.competitorsWithin5mHistogram, null, 2),
    '```',
    '',
    '## Impossible graph transitions (Viterbi ASSOCIATED chain)',
    '',
    `Count: **${a.impossibleTransitions.length}**`,
    '',
    ...a.impossibleTransitions.map(
      (t) =>
        `- \`${t.bucketLabelUtc}\`: ${t.prevWayId} (${t.prevHighway}) → ${t.curWayId} (${t.curHighway}) — ${t.reviewNote}`,
    ),
    '',
    '## Recurring ambiguity causes',
    '',
    ...a.recurringAmbiguityCauses.slice(0, 12).map((r) => `- ${r.cause}: ${r.promotionHits} promotion buckets`),
    '',
    '## Candidate collapse & F4 next step',
    '',
    `- **Justified:** ${a.candidateCollapseAssessment.justified}`,
    `- **GO/NO-GO:** ${a.candidateCollapseAssessment.goNoGo}`,
    `- ${a.candidateCollapseAssessment.riskSummary}`,
    '',
    ...a.candidateCollapseAssessment.rationale.map((r) => `- ${r}`),
    '',
    '## Road-ID accuracy',
    '',
    '**NOT_ASSESSABLE** — no independent driven-road ground truth in fixtures.',
    '',
    '## Artifacts',
    '',
    '- `LDI10D_F4B_AMBIGUOUS_PROMOTIONS.json`',
    '- `LDI10D_F4B_AMBIGUOUS_PROMOTIONS.csv`',
  ].join('\n');

  fs.writeFileSync(path.join(out, 'LDI10D_F4B_RESULT.md'), md);

  console.log(
    JSON.stringify({
      ok: true,
      phase: 'F4B',
      promotions: a.promotions.length,
      classDistribution: a.classDistribution,
      impossibleTransitions: a.impossibleTransitions.length,
      goNoGo: a.candidateCollapseAssessment.goNoGo,
      outDir: out,
    }),
  );
}

main();
