/**
 * LDI-10D F4-B replay guards — ambiguous promotion audit.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  F4B_EXPECTED_AMBIG_TO_UNKNOWN,
  F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE,
  F4B_EXPECTED_PROMOTIONS,
} from '../../../../../scripts/ops/ldi10d-f4b-ambiguous-promotion-audit.lib';
import { verifyPhase3e3Preflight } from '../../../../../scripts/ops/ldi10d-phase3e3-road-matching-accuracy.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

const evidenceDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');

describe('LDI-10D F4-B ambiguous promotion audit', () => {
  it('passes 3E.3 preflight (fixtures + transition matrix pins)', () => {
    const p = verifyPhase3e3Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.baselineCounts.associated).toBe(F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE);
    expect(p.candidateCounts.associated).toBe(300);
    const matrix = JSON.parse(
      fs.readFileSync(path.join(evidenceDir, 'LDI10D_PHASE3E3_TRANSITION_MATRIX.json'), 'utf8'),
    ) as { matrix: { AMBIGUOUS: { ASSOCIATED: number; UNKNOWN: number }; ASSOCIATED: { ASSOCIATED: number } } };
    expect(matrix.matrix.AMBIGUOUS.ASSOCIATED).toBe(F4B_EXPECTED_PROMOTIONS);
    expect(matrix.matrix.AMBIGUOUS.UNKNOWN).toBe(F4B_EXPECTED_AMBIG_TO_UNKNOWN);
    expect(matrix.matrix.ASSOCIATED.ASSOCIATED).toBe(F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE);
  });

  it('pinned F4-B promotion artifact matches reproducibility gates', () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(evidenceDir, 'LDI10D_F4B_AMBIGUOUS_PROMOTIONS.json'), 'utf8'),
    ) as {
      reproducibility: {
        promotionCount: number;
        ambiguousToUnknown: number;
        baselineAssociatedUnchanged: number;
        baselineAssociatedRowStable: boolean;
      };
      promotions: unknown[];
      impossibleTransitions: unknown[];
      classDistribution: Record<string, number>;
    };
    expect(doc.reproducibility.promotionCount).toBe(F4B_EXPECTED_PROMOTIONS);
    expect(doc.reproducibility.ambiguousToUnknown).toBe(F4B_EXPECTED_AMBIG_TO_UNKNOWN);
    expect(doc.reproducibility.baselineAssociatedUnchanged).toBe(F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE);
    expect(doc.reproducibility.baselineAssociatedRowStable).toBe(true);
    expect(doc.promotions).toHaveLength(F4B_EXPECTED_PROMOTIONS);
    expect(doc.impossibleTransitions).toHaveLength(5);
    const sum = Object.values(doc.classDistribution).reduce((a, b) => a + b, 0);
    expect(sum).toBe(F4B_EXPECTED_PROMOTIONS);
  });

  it('F4-B CSV and summary exist after runner', () => {
    expect(fs.existsSync(path.join(evidenceDir, 'LDI10D_F4B_AMBIGUOUS_PROMOTIONS.csv'))).toBe(true);
    expect(fs.existsSync(path.join(evidenceDir, 'LDI10D_F4B_RESULT.md'))).toBe(true);
  });
});
