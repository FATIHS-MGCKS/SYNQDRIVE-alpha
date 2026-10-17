/**
 * LDI-10D Phase 3E.6 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runPhase3e6Analysis,
  verifyPhase3e6Preflight,
} from '../../../../../scripts/ops/ldi10d-phase3e6-full-video-forensics.lib';
import { VIDEO_BASELINE_EXPECTED } from '../../../../../scripts/ops/ldi10d-phase3c-gps-speed-research.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.6', () => {
  it('passes preflight', () => {
    const p = verifyPhase3e6Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.ocrRowCount).toBe(206);
    expect(p.movPresent).toBe(false);
  });

  it('unfiltered spatial median is not selection-biased low-only', () => {
    const a = runPhase3e6Analysis(repoRoot);
    expect(a.spatialA.n).toBeGreaterThan(a.spatialB.n - 5);
    expect(a.compatVerifiedCount).toBe(137);
    if (a.spatialA.p95M != null && a.spatialB.p95M != null) {
      expect(a.spatialA.p95M).toBeGreaterThanOrEqual(a.spatialB.p95M * 0.5);
    }
  });

  it('L3 drift none and result artifact present', () => {
    expect(runPhase3e6Analysis(repoRoot).p3d.l3BaselineDrift).toBe('NONE');
    const md = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E6_RESULT.md');
    expect(fs.existsSync(md)).toBe(true);
    const result = JSON.parse(fs.readFileSync(md, 'utf8').match(/```json\n([\s\S]*?)\n```/)![1]!) as {
      BASELINE_SPEED_MAE_KMH: number;
    };
    expect(result.BASELINE_SPEED_MAE_KMH).toBeCloseTo(VIDEO_BASELINE_EXPECTED.maeKmh, 4);
  });
});
