/**
 * LDI-10D Phase 3E.2 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
  EXPECTED_TESLA_OSM_SHA256,
  verifyPhase3e2Preflight,
} from '../../../../../scripts/ops/ldi10d-phase3e2-spatial-forensics.lib';
import { runPhase3dAnalysis } from '../../../../../scripts/ops/ldi10d-phase3d-gps-evidence-quality.lib';
import { sha256File } from '../../../../../scripts/ops/ldi10a-longitudinal-candidate-forensics.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.2', () => {
  it('passes preflight with pinned Tesla OSM and 3E.1 baseline counts', () => {
    const p = verifyPhase3e2Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.teslaOsmSha256).toBe(EXPECTED_TESLA_OSM_SHA256);
    expect(p.baselineCounts.roadAssociated).toBe(BASELINE_ASSOCIATED);
    expect(p.baselineCounts.roadAmbiguous).toBe(BASELINE_AMBIGUOUS);
    expect(p.baselineCounts.roadUnknown).toBe(BASELINE_UNKNOWN);
  });

  it('does not mutate frozen Tesla OSM snapshot', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json',
    );
    expect(sha256File(p)).toBe(EXPECTED_TESLA_OSM_SHA256);
  });

  it('preserves Phase 3E.1 result artifact', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E1_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });

  it('L3 baseline unchanged', () => {
    const d = runPhase3dAnalysis(repoRoot);
    expect(d.l3BaselineDrift).toBe('NONE');
  });

  it('phase 3E.2 result exists after runner', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E2_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
