/**
 * LDI-10D Phase 2A — integrity + UNKNOWN count.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXPECTED_OSM_SNAPSHOT_SHA256,
  verifyPhase2aIntegrity,
} from '../../../../../scripts/ops/ldi10d-phase2a-unknown-root-cause.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 2A', () => {
  it('passes input integrity and replay drift checks', () => {
    const v = verifyPhase2aIntegrity(repoRoot);
    expect(v.inputIntegrity).toBe('PASS');
    expect(v.osmSnapshotSha256).toBe(EXPECTED_OSM_SNAPSHOT_SHA256);
  });

  it('audited 18 UNKNOWN groups in frozen association', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_MANEUVER_ROAD_ASSOCIATION.json',
    );
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      associations: Array<{ associationOutcome: string }>;
    };
    const unknown = j.associations.filter((a) => a.associationOutcome === 'UNKNOWN').length;
    expect(unknown).toBe(18);
    expect(j.associations.length).toBe(32);
  });
});
