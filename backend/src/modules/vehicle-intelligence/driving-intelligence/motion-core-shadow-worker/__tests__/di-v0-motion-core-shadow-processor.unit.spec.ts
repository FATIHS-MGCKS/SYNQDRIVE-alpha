import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  computeC4AdaptiveL3,
  detectMotionManoeuvreEvents,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  runMotionFsm,
  type MotionCorePositionBucket,
} from '../../core';

const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const DIMO_RO =
  process.env.EXP021_DIMO_READONLY ?? '/opt/cursor/artifacts/exp021-motion-core-design/inputs/dimo_readonly';

function loadGrid(tripKey: string): MotionCorePositionBucket[] {
  const p = path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8')).buckets as MotionCorePositionBucket[];
}

function loadSparse(n: number) {
  const p = path.join(DIMO_RO, `TRIP_${n}_dimo_speed_location_1s.json`);
  if (!fs.existsSync(p)) return [];
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as { rows: Array<{ timestamp: string; speedAvg: number | null }> };
  return doc.rows
    .filter((r) => r.speedAvg != null)
    .map((r) => ({ label: r.timestamp.replace('.000Z', 'Z'), speedKmh: r.speedAvg as number }));
}

/** Offline adapter replay parity — same stack as `processDiV0MotionCoreShadowTrip` on grid+sparse inputs. */
function replayRecommendedStack(grid: MotionCorePositionBucket[], sparse: ReturnType<typeof loadSparse>) {
  const c4 = computeC4AdaptiveL3(grid);
  const fsm = runMotionFsm(
    grid,
    c4,
    'RETROSPECTIVE',
    sparse,
    MOTION_FSM_PARAMS_V0_2_DEV,
    MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  );
  const events = detectMotionManoeuvreEvents(
    0,
    c4,
    'C4_ADAPTIVE_L3',
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  );
  const episodes = extractMotionFsmStopEpisodes(0, fsm, 'RETROSPECTIVE');
  return { c4, fsm, events, episodes };
}

describe('di-v0-motion-core-shadow processor parity', () => {
  it('documents C4 full finalization horizon t+6 in contract constants', () => {
    expect(MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S).toBe(6);
  });

  it('matches Fable-review Tesla TRIP_1 counts when fixtures are present', () => {
    const grid = loadGrid('TRIP_1');
    if (grid.length === 0) return;
    const { events, episodes, fsm } = replayRecommendedStack(grid, loadSparse(1));
    expect(fsm.length).toBe(grid.length);
    expect(episodes.length).toBe(3);
    expect(events.filter((e) => e.quality === 'ARTEFACT_SUSPECT').length).toBe(1);
    expect(fsm.filter((l) => l.evidenceQuality === 'DIRECT').length).toBe(66);
  });

  it('matches Fable-review Tesla TRIP_2 counts when fixtures are present', () => {
    const grid = loadGrid('TRIP_2');
    if (grid.length === 0) return;
    const { events, episodes, fsm } = replayRecommendedStack(grid, loadSparse(2));
    expect(fsm.length).toBe(grid.length);
    expect(episodes.length).toBe(5);
    expect(fsm.filter((l) => l.evidenceQuality === 'DIRECT').length).toBe(171);
  });
});
