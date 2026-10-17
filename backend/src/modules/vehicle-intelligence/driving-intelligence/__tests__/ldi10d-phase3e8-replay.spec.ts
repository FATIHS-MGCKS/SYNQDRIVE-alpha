/**
 * LDI-10D Phase 3E.8 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXPECTED_1HZ,
  runPhase3e8Analysis,
  verifyPhase3e8Preflight,
} from '../../../../../scripts/ops/ldi10d-phase3e8-full-video-forensics.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.8', () => {
  it('full 1Hz OCR checkpoint complete', () => {
    const p = verifyPhase3e8Preflight(repoRoot);
    expect(p.checkpointRows).toBe(EXPECTED_1HZ);
    expect(p.coveragePercent).toBe(100);
    expect(p.inputIntegrity).toBe('PASS');
  });

  it('coverage gate PASS', () => {
    expect(runPhase3e8Analysis(repoRoot).coverageGate).toBe('PASS');
  });

  it('handoff zip under 2MB', () => {
    const zip = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E8_CURSOR_HANDOFF.zip');
    expect(fs.existsSync(zip)).toBe(true);
    expect(fs.statSync(zip).size).toBeLessThan(2 * 1024 * 1024);
  });
});
