/**
 * LDI-10D Phase 3A replay tests.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildPhase3aTimeline,
  detectStandstillSequences,
  verifyPhase3aPreflight,
} from '../../../../../scripts/ops/ldi10d-phase3a-temporal-events.lib';
import { loadLdi08Artifacts } from '../../../../../scripts/ops/ldi09-accel-decel-signal-forensics.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3A', () => {
  it('passes preflight and baseline', () => {
    const p = verifyPhase3aPreflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.baseline.groups).toBe(32);
    expect(p.baseline.gpsPresent).toBe(346);
  });

  it('builds timeline with 32 maneuver-linked events', () => {
    const t = buildPhase3aTimeline(repoRoot);
    const linked = t.events.filter((e) => e.linkedManeuverGroupId != null);
    expect(linked.length).toBe(32);
  });

  it('does not use ROW_ABSENT rows as GPS in standstill detection', () => {
    const { snapshot } = loadLdi08Artifacts(repoRoot);
    const events = detectStandstillSequences(snapshot.rows);
    for (const e of events) {
      for (const b of e.gpsBuckets) {
        expect(b.gpsAvailability).toBe('PRESENT');
        expect(b.lat).not.toBeNull();
      }
    }
  });

  it('uses only confirmed junction nodes for JUNCTION_APPROACH', () => {
    const t = buildPhase3aTimeline(repoRoot);
    const junctions = t.events.filter((e) => e.eventType === 'JUNCTION_APPROACH');
    for (const e of junctions) {
      expect(e.uncertainty.reasons.some((r) => r.includes('ambiguous_nodes_excluded'))).toBe(true);
      expect(e.roadRefs.junctionNodeId).not.toBeNull();
    }
  });

  it('writes timeline artifact when runner executed', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3A_EVENT_TIMELINE.json',
    );
    expect(fs.existsSync(p)).toBe(true);
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { maneuverGroupsUnchanged: number };
    expect(j.maneuverGroupsUnchanged).toBe(32);
  });
});
