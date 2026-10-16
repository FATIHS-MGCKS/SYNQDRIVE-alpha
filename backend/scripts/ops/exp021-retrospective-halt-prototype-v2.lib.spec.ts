import {
  analyzeGapCandidateV2,
  buildGapBrackets,
  RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
} from './exp021-retrospective-halt-prototype-v2.lib';
import type { GapRun, PresentPoint } from './exp021-retrospective-halt-prototype.lib';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';

describe('exp021-retrospective-halt-prototype-v2', () => {
  it('exports v0_2 version id', () => {
    expect(RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION).toContain('V0_2');
  });

  it('does not classify long gap with small chord as LIKELY_MOVING_WITH_GAP from bracket means alone', () => {
    const present: PresentPoint[] = [
      { bucketLabelUtc: '2026-10-16T03:40:17Z', lat: 48.1, lon: 11.5, positionState: null },
      { bucketLabelUtc: '2026-10-16T03:40:18Z', lat: 48.10005, lon: 11.50005, positionState: null },
      { bucketLabelUtc: '2026-10-16T03:40:51Z', lat: 48.10008, lon: 11.50008, positionState: null },
      { bucketLabelUtc: '2026-10-16T03:40:52Z', lat: 48.1002, lon: 11.5002, positionState: null },
    ];
    const posByLabel = new Map<string, DiV0SpeedQcPositionSample>();
    for (const p of present) {
      posByLabel.set(p.bucketLabelUtc, {
        bucketLabel: p.bucketLabelUtc,
        availability: 'PRESENT',
        latitude: p.lat,
        longitude: p.lon,
        positionState: null,
      } as DiV0SpeedQcPositionSample);
    }
    const gap: GapRun = {
      fromUtc: '2026-10-16T03:40:19Z',
      toUtc: '2026-10-16T03:40:50Z',
      durationSec: 32,
      labels: ['2026-10-16T03:40:19Z'],
    };
    const brackets = buildGapBrackets(gap, present, posByLabel);
    expect(brackets.calendarAdjacentBefore?.bucketLabelUtc).toBe('2026-10-16T03:40:18Z');
    expect(brackets.calendarAdjacentAfter?.bucketLabelUtc).toBe('2026-10-16T03:40:51Z');
    const analysis = analyzeGapCandidateV2(gap, present, posByLabel, new Map());
    expect(analysis.explanation).not.toBe('LIKELY_MOVING_WITH_GAP');
  });
});
