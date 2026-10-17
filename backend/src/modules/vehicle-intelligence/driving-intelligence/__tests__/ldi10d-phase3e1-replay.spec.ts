/**
 * LDI-10D Phase 3E.1 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXPECTED_OSM_SNAPSHOT_SHA256 } from '../../../../../scripts/ops/ldi10d-phase2a-unknown-root-cause.lib';
import {
  PHASE3E_EXPECTED_EVENT_COUNT,
  TESLA_OSM_SNAPSHOT_FILENAME,
  verifyPhase3e1Preflight,
  runPhase3e1Analysis,
  LDI08_OSM_FILENAME,
  EVIDENCE_DIR_REL,
} from '../../../../../scripts/ops/ldi10d-phase3e1-tesla-osm-spatial.lib';
import { runPhase3dAnalysis } from '../../../../../scripts/ops/ldi10d-phase3d-gps-evidence-quality.lib';
import { sha256File } from '../../../../../scripts/ops/ldi10a-longitudinal-candidate-forensics.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.1', () => {
  it('passes preflight and preserves LDI-08 OSM snapshot', () => {
    const p = verifyPhase3e1Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.fixtureBuckets).toBe(1136);
    expect(p.phase3eEventCount).toBe(PHASE3E_EXPECTED_EVENT_COUNT);
    expect(p.ldi08OsmSha256).toBe(EXPECTED_OSM_SNAPSHOT_SHA256);
    const ldi08Path = path.join(repoRoot, EVIDENCE_DIR_REL, LDI08_OSM_FILENAME);
    expect(fs.existsSync(ldi08Path)).toBe(true);
  });

  it('replays 66 contextual events with Tesla OSM without L3 drift', async () => {
    const teslaPath = path.join(repoRoot, EVIDENCE_DIR_REL, TESLA_OSM_SNAPSHOT_FILENAME);
    expect(fs.existsSync(teslaPath)).toBe(true);
    const a = await runPhase3e1Analysis(repoRoot, {
      headSha: 'test',
      allowLiveFetch: false,
    });
    expect(a.replayedEvents.length).toBe(PHASE3E_EXPECTED_EVENT_COUNT);
    expect(a.l3BaselineDrift).toBe('NONE');
    expect(a.associationCounts.roadAssociated).toBeGreaterThan(100);
    const p3ePath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E_CONTEXTUAL_EVENTS.json');
    const p3eSha = sha256File(p3ePath);
    expect(p3eSha).toBeTruthy();
  });

  it('phase 3D metrics unchanged', () => {
    const d = runPhase3dAnalysis(repoRoot);
    expect(d.observability.trustedSpeed).toBe(775);
    expect(d.l3BaselineDrift).toBe('NONE');
  });
});
