import * as fs from 'fs';
import * as path from 'path';
import {
  ADVERSARIAL_REPLAY_CASES,
  CALIBRATION_PACK_MANIFEST,
} from './settled-post-replay.fixtures';
import { REPLAY_DROP_CAP_CLASSIFICATION } from './settled-post-refuel-plateau.policy';
import {
  assertTerminalRejectionDominatesSettledPost,
  computeAggregateMetrics,
  replayAllCases,
  replayCase,
  runSensitivityGrid,
} from './settled-post-replay.lib';

describe('RFRF settled-post offline replay (design-only)', () => {
  const results = replayAllCases();

  it('calibration pack shape', () => {
    expect(CALIBRATION_PACK_MANIFEST.defensibleNaturalRows).toBe(7);
    expect(CALIBRATION_PACK_MANIFEST.adversarialSemanticCases).toBe(12);
    expect(CALIBRATION_PACK_MANIFEST.adversarialFixtureCount).toBe(13);
    expect(ADVERSARIAL_REPLAY_CASES.map((c) => c.id)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'A7',
      'A8',
      'A9',
      'A10_POS',
      'A10_NEG',
      'A11',
      'A12',
    ]);
  });

  it('replay drop caps remain REPLAY_HYPOTHESIS_ONLY', () => {
    expect(REPLAY_DROP_CAP_CLASSIFICATION).toBe('REPLAY_HYPOTHESIS_ONLY');
  });

  it('TERMINAL_REJECTION_DOMINATES_SETTLED_POST', () => {
    assertTerminalRejectionDominatesSettledPost(results);
  });

  it('every SAFETY_NEGATIVE fixture avoids READY and resurrection', () => {
    const negatives = ADVERSARIAL_REPLAY_CASES.filter(
      (c) => c.expectedSemanticClass === 'SAFETY_NEGATIVE',
    );
    for (const def of negatives) {
      const row = results.find((r) => r.caseId === def.id);
      expect(row).toBeDefined();
      expect(row!.SETTLED_MODEL_RESULT).not.toBe('READY_FOR_PERSIST');
      if (row!.CURRENT_RISE_TERMINAL_REJECTION === 'YES') {
        expect(row!.SETTLED_MODEL_RESULT).toBe('REJECTED');
        expect(row!.SETTLED_EVALUATION_ALLOWED).toBe('NO');
      }
    }
  });

  it('positive controls reach READY under default hypothesis', () => {
    for (const id of ['A8', 'A10_POS']) {
      const row = results.find((r) => r.caseId === id);
      expect(row?.SETTLED_MODEL_RESULT).toBe('READY_FOR_PERSIST');
    }
  });

  it('false-positive regressions derive from fixture metadata only', () => {
    const libSource = fs.readFileSync(path.join(__dirname, 'settled-post-replay.lib.ts'), 'utf8');
    expect(libSource).not.toMatch(/caseId\s*!==\s*['"]A8['"]/);
    expect(libSource).not.toMatch(/caseId\s*!==\s*['"]A10['"]/);
    const metrics = computeAggregateMetrics(results);
    const expectedFp = results.filter((r) => r.falsePositiveRegression).length;
    expect(metrics.fpRegressions).toBe(expectedFp);
  });

  it('sensitivity grid has zero SAFETY_NEGATIVE leaks at default hypothesis', () => {
    const grid = runSensitivityGrid();
    expect(grid.defaultHypothesisPoint?.safetyNegativeUnexpectedReadyCount).toBe(0);
    expect(grid.safetyFrontierNote).toContain('No SAFETY_NEGATIVE false-positive');
  });

  it('KS MS 661 2026-09-30 improves F3 maturity without resurrecting terminal rejects', () => {
    const ks = results.find((r) => r.caseId === 'KS_MS_661_2026_09_30');
    expect(ks?.evidenceQuality).toBe('CRITICAL_PATH_FULL_REPLAY');
    expect(ks?.CURRENT_MODEL_RESULT).toBe('OBSERVED');
    expect(ks?.SETTLED_EVALUATION_ALLOWED).toBe('YES');
    expect(ks?.SETTLED_MODEL_RESULT).toBe('READY_FOR_PERSIST');
  });
});
