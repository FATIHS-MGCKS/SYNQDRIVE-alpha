/**
 * LDI-10D Phase 3D replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runPhase3dAnalysis,
  verifyPhase3dPreflight,
} from '../../../../../scripts/ops/ldi10d-phase3d-gps-evidence-quality.lib';
import { VIDEO_BASELINE_EXPECTED } from '../../../../../scripts/ops/ldi10d-phase3c-gps-speed-research.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3D', () => {
  it('passes preflight with fixture hash parity and 3C.2 baseline', () => {
    const p = verifyPhase3dPreflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.fixtureHashParity).toBe(true);
    expect(p.phase3c2PairedN).toBe(VIDEO_BASELINE_EXPECTED.pairedN);
    expect(p.phase3c2BaselineMae).not.toBeNull();
    expect(Math.abs(p.phase3c2BaselineMae! - VIDEO_BASELINE_EXPECTED.maeKmh)).toBeLessThanOrEqual(0.001);
  });

  it('analyzes 1136 buckets with no L3 replay drift vs pinned production', () => {
    const a = runPhase3dAnalysis(repoRoot);
    expect(a.records.length).toBe(1136);
    expect(a.l3BaselineDrift).toBe('NONE');
    expect(a.observability.rowAbsent).toBe(269);
    expect(a.observability.trustedSpeed).toBeGreaterThan(700);
  });

  it('phase 3D result artifact exists', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3D_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
