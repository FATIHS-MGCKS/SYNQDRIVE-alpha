import * as fs from 'node:fs';
import * as path from 'node:path';

const SUMMARY = path.join(
  process.cwd(),
  '../research/driving-intelligence/evaluations/ds4-fsm-retrospective-gap-bridge-research-20261023/outputs/run_v2_native_fsm/summary.json',
);

describe('FSM gap-bridge four-drive sealed research gate', () => {
  it('documents TIG22 UNKNOWN 78→68 and zero scoring deltas on reference drives', () => {
    expect(fs.existsSync(SUMMARY)).toBe(true);
    const summary = JSON.parse(fs.readFileSync(SUMMARY, 'utf8')) as {
      drives: Record<
        string,
        {
          baseline: { fsmStateCounts: { UNKNOWN: number } };
          candidate: { fsmStateCounts: { UNKNOWN: number } };
          delta: { falseMotionInConfirmedStill: number; falseStillInConfirmedMotion: number };
        }
      >;
    };
    const tig = summary.drives.TIG22;
    expect(tig.baseline.fsmStateCounts.UNKNOWN).toBe(78);
    expect(tig.candidate.fsmStateCounts.UNKNOWN).toBe(68);
    for (const id of ['TIG22', 'TES16', 'TES21-1', 'TES21-2']) {
      const row = summary.drives[id];
      expect(row.delta.falseMotionInConfirmedStill).toBe(0);
      expect(row.delta.falseStillInConfirmedMotion).toBe(0);
    }
  });
});
