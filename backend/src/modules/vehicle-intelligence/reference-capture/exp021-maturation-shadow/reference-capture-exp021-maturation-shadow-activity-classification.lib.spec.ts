import { classifyActivityForGeometry } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';

describe('classifyActivityForGeometry', () => {
  it('classifies sustained movement as ACTIVE_MOTION', () => {
    const result = classifyActivityForGeometry(60_000, {
      speedKmh: 40,
      speedSignalFresh: true,
    });
    expect(result.class).toBe('ACTIVE_MOTION');
  });

  it('classifies parked fresh telemetry as ACTIVE_IDLE', () => {
    const result = classifyActivityForGeometry(90_000, {
      speedKmh: 0,
      speedSignalFresh: true,
      vehicleTelemetryFresh: true,
    });
    expect(result.class).toBe('ACTIVE_IDLE');
  });

  it('fails closed to UNKNOWN_ACTIVITY when authority insufficient', () => {
    const result = classifyActivityForGeometry(60_000, {});
    expect(result.class).toBe('UNKNOWN_ACTIVITY');
  });
});
