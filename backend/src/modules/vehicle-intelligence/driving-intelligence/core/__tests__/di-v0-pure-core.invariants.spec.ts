import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../index';
import { pilotHoldThenRelease303m } from './fixtures/wob-pilot-golden.fixture';
import { presentObs } from './test-helpers';

const ctx = {
  versions: DEFAULT_DI_V0_VERSION_TUPLE,
  calibration: CALIBRATION_UNSET_V0_BUNDLE,
};

describe('DI V0 invariants', () => {
  it('no L3 numeric speed across RELEASE support', () => {
    const positions = pilotHoldThenRelease303m();
    const out = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    for (const row of out.intervals) {
      if (row.positionState === 'RELEASE' || row.abstentionReason === 'POSITION_RELEASE') {
        expect(row.estimatedSpeedKmh).toBeNull();
      }
    }
  });

  it('R1-only synthetic input cannot create MOVING_SPEED_ESTIMATED', () => {
    const positions = [
      presentObs('2026-01-01T00:00:00Z', 52, 9),
      presentObs('2026-01-01T00:00:01Z', 52, 9),
      presentObs('2026-01-01T00:00:02Z', 52, 9),
    ];
    const out = computeDiV0TripIntervals(
      {
        sourceFamily: 'RUPTELA_R1',
        positions,
        r1Obd: [
          {
            bucketLabel: '2026-01-01T00:00:01Z',
            temporalConfidence: 'INTERVAL_ONLY',
            speedKmh: 80,
            provenance: { sourceSignal: 'speed', derivedFrom: ['test'] },
          },
        ],
      },
      ctx,
    );
    expect(out.intervals.every((r) => r.motionState !== 'MOVING_SPEED_ESTIMATED')).toBe(true);
  });

  it('UNKNOWN source produces no intervals', () => {
    const positions = [presentObs('2026-01-01T00:00:00Z', 52, 9)];
    const out = computeDiV0TripIntervals({ sourceFamily: 'UNKNOWN', positions }, ctx);
    expect(out.warnings).toContain('UNSUPPORTED_SOURCE_FAMILY');
    expect(out.intervals).toHaveLength(0);
  });
});
