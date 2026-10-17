/**
 * LDI-10D Phase 3C replay.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPhase3aTimeline } from '../../../../../scripts/ops/ldi10d-phase3a-temporal-events.lib';
import { PHASE3A_EXPECTED } from '../../../../../scripts/ops/ldi10d-phase3b-trip-continuity.lib';
import {
  reproduceVideoBaselineMetrics,
  VIDEO_BASELINE_EXPECTED,
  loadVideoComparison,
  verifyPhase3cPreflight,
  runPhase3cResearch,
} from '../../../../../scripts/ops/ldi10d-phase3c-gps-speed-research.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3C', () => {
  it('passes full preflight including Phase 3B chain', () => {
    const p = verifyPhase3cPreflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.phase3aDrift).toBe('NONE');
  });

  it('reproduces frozen EXP021 video baseline MAE/P95/bias', () => {
    const rows = loadVideoComparison(repoRoot);
    const stats = reproduceVideoBaselineMetrics(rows);
    expect(stats.n).toBe(VIDEO_BASELINE_EXPECTED.pairedN);
    expect(stats.maeKmh).not.toBeNull();
    expect(Math.abs(stats.maeKmh! - VIDEO_BASELINE_EXPECTED.maeKmh)).toBeLessThanOrEqual(
      VIDEO_BASELINE_EXPECTED.toleranceMae,
    );
    expect(Math.abs(stats.p95AbsKmh! - VIDEO_BASELINE_EXPECTED.p95Kmh)).toBeLessThanOrEqual(
      VIDEO_BASELINE_EXPECTED.toleranceP95,
    );
    expect(Math.abs(stats.biasKmh! - VIDEO_BASELINE_EXPECTED.biasKmh)).toBeLessThanOrEqual(
      VIDEO_BASELINE_EXPECTED.toleranceBias,
    );
  });

  it('Phase 3A replay unchanged', () => {
    const t = buildPhase3aTimeline(repoRoot);
    expect(t.events.length).toBe(PHASE3A_EXPECTED.eventsTotal);
  });

  it('L3 position replay matches pinned LDI08 speeds closely', () => {
    const r = runPhase3cResearch(repoRoot);
    expect(r.l3ReplayVsPinned.n).toBeGreaterThan(200);
    expect(r.l3ReplayVsPinned.maeKmh).not.toBeNull();
    expect(r.l3ReplayVsPinned.maeKmh!).toBeLessThan(0.05);
  });

  it('phase 3c result artifact exists after runner', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3C_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
