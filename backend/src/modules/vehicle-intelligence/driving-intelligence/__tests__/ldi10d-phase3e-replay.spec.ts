/**
 * LDI-10D Phase 3E replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runPhase3eAnalysis,
  verifyPhase3ePreflight,
} from '../../../../../scripts/ops/ldi10d-phase3e-contextual-events.lib';
import { runPhase3dAnalysis } from '../../../../../scripts/ops/ldi10d-phase3d-gps-evidence-quality.lib';
import { PHASE3A_EXPECTED } from '../../../../../scripts/ops/ldi10d-phase3b-trip-continuity.lib';
import { buildPhase3aTimeline } from '../../../../../scripts/ops/ldi10d-phase3a-temporal-events.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E', () => {
  it('passes preflight with fixture and phase 3D metrics', () => {
    const p = verifyPhase3ePreflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.tesla.buckets).toBe(1136);
    expect(p.tesla.positionPresent).toBe(867);
    expect(p.tesla.rowAbsent).toBe(269);
    expect(p.phase3d.trustedSpeed).toBe(775);
    expect(p.phase3d.qcUntrusted).toBe(347);
    expect(p.ldi08PinResearch.confirmedJunctions).toBe(35);
    expect(p.ldi08PinResearch.ambiguousJunctions).toBe(114);
  });

  it('builds 1136-second timeline and preserves phase 3A baseline', () => {
    const a = runPhase3eAnalysis(repoRoot);
    expect(a.perSecond.length).toBe(1136);
    expect(a.l3BaselineDrift).toBe('NONE');
    expect(a.phase3aPreserved).toBe(true);
    const p3a = buildPhase3aTimeline(repoRoot);
    expect(p3a.events.length).toBe(PHASE3A_EXPECTED.eventsTotal);
  });

  it('does not drift phase 3D observability', () => {
    const d1 = runPhase3dAnalysis(repoRoot);
    const d2 = runPhase3dAnalysis(repoRoot);
    expect(d1.observability.trustedSpeed).toBe(d2.observability.trustedSpeed);
    expect(d1.observability.qcUntrusted).toBe(347);
    expect(d1.l3BaselineDrift).toBe('NONE');
  });

  it('phase 3E result artifact exists after runner', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
