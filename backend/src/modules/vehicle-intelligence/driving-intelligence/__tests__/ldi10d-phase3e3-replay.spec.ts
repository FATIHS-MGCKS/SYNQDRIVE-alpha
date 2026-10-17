/**
 * LDI-10D Phase 3E.3 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BASELINE_ASSOCIATED,
  EXPECTED_TESLA_OSM_SHA256,
  verifyPhase3e3Preflight,
  buildTransitionMatrix,
  normalizeOutcome,
} from '../../../../../scripts/ops/ldi10d-phase3e3-road-matching-accuracy.lib';
import { runPhase3dAnalysis } from '../../../../../scripts/ops/ldi10d-phase3d-gps-evidence-quality.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.3', () => {
  it('passes preflight and pinned baselines', () => {
    const p = verifyPhase3e3Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.gpsBuckets).toBe(1136);
    expect(p.present).toBe(867);
    expect(p.rowAbsent).toBe(269);
    expect(p.teslaOsmSha256).toBe(EXPECTED_TESLA_OSM_SHA256);
    expect(p.baselineCounts.associated).toBe(BASELINE_ASSOCIATED);
  });

  it('transition matrix sums to 1136', () => {
    const perSec = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E2_PER_SECOND_SPATIAL.json'),
        'utf8',
      ),
    ) as { buckets: Array<{ baselineOutcome: string; candidateOutcome: string }> };
    const bl = perSec.buckets.map((b) => normalizeOutcome(b.baselineOutcome));
    const ca = perSec.buckets.map((c) => normalizeOutcome(c.candidateOutcome));
    const t = buildTransitionMatrix(bl, ca);
    const sum = Object.values(t.matrix).reduce(
      (s, row) => s + Object.values(row).reduce((a, b) => a + b, 0),
      0,
    );
    expect(sum).toBe(1136);
    expect(t.netAssociatedDelta).toBe(36);
  });

  it('L3 unchanged', () => {
    expect(runPhase3dAnalysis(repoRoot).l3BaselineDrift).toBe('NONE');
  });

  it('phase 3E.3 result exists after runner', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E3_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
