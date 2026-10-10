import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { measureMaxSettledWindowInternalGapMs } from './rfrf-oq014-r4a-settled-gap-measurement.lib';

describe('R4A settled-window gap measurement', () => {
  it('measures observed inter-sample gaps separately from configured scanner limit', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T00:10:00.000Z');
    const samples = [
      { timestamp: new Date('2026-01-01T00:00:00.000Z') },
      { timestamp: new Date('2026-01-01T00:05:00.000Z') },
      { timestamp: new Date('2026-01-01T00:10:00.000Z') },
    ];
    const measured = measureMaxSettledWindowInternalGapMs(samples, start, end);
    expect(measured.maxSettledWindowInternalGapMs).toBe(5 * 60 * 1000);
    expect(measured.unavailableReason).toBeNull();
    expect(measured.maxSettledWindowInternalGapMs).not.toBe(
      RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.maxSampleGapMs,
    );
  });

  it('returns null with reason when settled window has insufficient samples', () => {
    const measured = measureMaxSettledWindowInternalGapMs(
      [{ timestamp: new Date('2026-01-01T00:00:00.000Z') }],
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:10:00.000Z'),
    );
    expect(measured.maxSettledWindowInternalGapMs).toBeNull();
    expect(measured.unavailableReason).toBe('INSUFFICIENT_SETTLED_WINDOW_SAMPLES');
  });
});
