/**
 * LDI-10D Phase 3E.7 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runPhase3e7Analysis,
  verifyPhase3e7Preflight,
} from '../../../../../scripts/ops/ldi10d-phase3e7-partial-audit.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.7', () => {
  it('passes integrity preflight on partial pack', () => {
    const p = verifyPhase3e7Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.frameManifestCount).toBe(1028);
    expect(p.ocrSampleCount).toBe(69);
    expect(p.movPresent).toBe(false);
  });

  it('does not claim full 1Hz OCR', () => {
    const a = runPhase3e7Analysis(repoRoot);
    expect(a.parsed.length).toBe(69);
    expect(a.preflight.frameManifestCount).toBeGreaterThan(a.parsed.length);
  });

  it('result artifact and cursor zip under 1.8MB', () => {
    const resultPath = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E7_RESULT.md',
    );
    expect(fs.existsSync(resultPath)).toBe(true);
    const zip = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E7_CURSOR_HANDOFF.zip',
    );
    expect(fs.existsSync(zip)).toBe(true);
    expect(fs.statSync(zip).size).toBeLessThan(1.8 * 1024 * 1024);
  });
});
