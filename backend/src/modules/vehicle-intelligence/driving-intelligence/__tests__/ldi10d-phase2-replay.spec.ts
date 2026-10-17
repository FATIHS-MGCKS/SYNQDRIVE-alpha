/**
 * LDI-10D Phase 2 — frozen OSM replay integrity.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  associateGroup,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  parseOverpassElements,
  runIntegrityChecks,
  verifyPhase2Inputs,
} from '../../../../../scripts/ops/ldi10d-phase2-osm-road-context.lib';
import { loadLdi08Artifacts } from '../../../../../scripts/ops/ldi09-accel-decel-signal-forensics.lib';
import { loadLdi10bGroups } from '../../../../../scripts/ops/ldi10c-spatial-trip-reconstruction.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 2', () => {
  it('verifies LDI input counts', () => {
    const v = verifyPhase2Inputs(repoRoot);
    expect(v.ok).toBe(true);
    expect(v.counts.groups).toBe(32);
    expect(v.counts.gpsPresent).toBe(346);
  });

  it('builds 32 associations from frozen OSM snapshot', () => {
    const snapPath = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_OSM_FROZEN_SNAPSHOT.json',
    );
    expect(fs.existsSync(snapPath)).toBe(true);
    const frozen = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as { overpassResponse: unknown };
    const parsed = parseOverpassElements(frozen.overpassResponse as { elements?: Array<Record<string, unknown>> });
    const signalNodes = parsed.nodes.filter((n) => n.kind === 'traffic_signals' || n.kind === 'crossing');
    const { snapshot } = loadLdi08Artifacts(repoRoot);
    const groups = loadLdi10bGroups(repoRoot);
    const associations = groups.map((g) =>
      associateGroup({
        group: g,
        rows: snapshot.rows,
        ways: parsed.ways,
        signalNodes,
        uncertaintyRadiusM: DEFAULT_UNCERTAINTY_RADIUS_M,
      }),
    );
    expect(
      runIntegrityChecks(associations.map((a) => ({ associationOutcome: String(a.associationOutcome) }))),
    ).toEqual([]);
  });
});
