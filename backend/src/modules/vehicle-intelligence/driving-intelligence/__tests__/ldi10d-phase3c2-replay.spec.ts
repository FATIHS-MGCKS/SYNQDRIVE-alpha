/**
 * LDI-10D Phase 3C.2 replay (committed fixture).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { POSITION_PAYLOAD_SHA256 } from '../../../../../scripts/ops/ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import {
  FIXTURE_REL,
  loadCommittedFixture,
  runSevenAlgorithmReplay,
} from '../../../../../scripts/ops/ldi10d-phase3c2-tesla-gps-fixture.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3C.2', () => {
  it('has committed Tesla GPS fixture with hash parity', () => {
    const fixture = loadCommittedFixture(repoRoot);
    expect(fixture.bucketCount).toBe(1136);
    expect(fixture.positionPayloadSha256).toBe(POSITION_PAYLOAD_SHA256);
    const prov = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, FIXTURE_REL, 'PROVENANCE_MANIFEST.json'),
        'utf8',
      ),
    ) as { recoveredPositionPayloadSha256: string };
    expect(prov.recoveredPositionPayloadSha256).toBe(POSITION_PAYLOAD_SHA256);
  });

  it('replays seven algorithms with baseline tacho MAE near historical', () => {
    const replay = runSevenAlgorithmReplay(repoRoot);
    expect(replay.results.length).toBe(7);
    const base = replay.baseline.trustedWitnessPairs;
    expect(base.n).toBeGreaterThan(700);
    expect(base.maeKmh).not.toBeNull();
    expect(base.maeKmh!).toBeLessThan(3);
  });

  it('result artifact exists', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3C2_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
