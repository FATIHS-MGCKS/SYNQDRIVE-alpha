/**
 * LDI-10D Phase 3C.1 replay.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TESLA_DIMO_TOKEN,
  TESLA_MANIFEST_REL,
  TESLA_TRIP_ID,
  auditTeslaManifest,
  buildPhase3c1Decision,
  verifyPhase3c1Preflight,
} from '../../../../../scripts/ops/ldi10d-phase3c1-tesla-gps-comparative-replay.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3C.1', () => {
  it('passes Phase 3C preflight chain', () => {
    const p = verifyPhase3c1Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
  });

  it('identifies canonical Tesla manifest and trip 186946', () => {
    const audit = auditTeslaManifest(repoRoot, 'test-head');
    expect(audit.manifestPath).toBe(TESLA_MANIFEST_REL);
    expect(audit.tripId).toBe(TESLA_TRIP_ID);
    expect(audit.dimoTokenId).toBe(TESLA_DIMO_TOKEN);
    expect(audit.checksums.sha256sumsFileVerified).toBe(true);
  });

  it('blocks seven-algorithm GPS replay without position payload in repo', () => {
    const audit = auditTeslaManifest(repoRoot, 'test-head');
    expect(audit.gpsCoordinateAccessibility.fullLatLonUtcInRepo).toBe(false);
    expect(audit.phaseBEligible).toBe(false);
    const d = buildPhase3c1Decision(audit, repoRoot);
    expect(d.ALGORITHMS_REPLAYED).toBe('BASELINE_ONLY');
    expect(d.ACCURACY_IMPROVEMENT_PROVEN).toBe('NOT_ASSESSABLE');
    expect(d.BASELINE_REPRODUCED).toBe('YES');
  });

  it('decision artifact exists after runner', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3C1_DECISION.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
