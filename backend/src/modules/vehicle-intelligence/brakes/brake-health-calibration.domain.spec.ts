import {
  calibrateBrakeKFactorForComponent,
} from './brake-health-calibration.domain';

describe('brake-health-calibration.domain', () => {
  it('preserves k when predicted wear is below minimum threshold', () => {
    const result = calibrateBrakeKFactorForComponent(
      'FRONT_PADS',
      1.0,
      10,
      9.9,
      9.5,
      1,
    );
    expect(result.applied).toBe(false);
    expect(result.newK).toBe(1.0);
  });

  it('adjusts k toward measured wear with EMA', () => {
    const result = calibrateBrakeKFactorForComponent(
      'FRONT_PADS',
      1.0,
      10,
      8,
      7,
      1,
    );
    expect(result.applied).toBe(true);
    expect(result.newK).toBeGreaterThan(1);
    expect(result.newK).toBeLessThanOrEqual(1.35);
  });

  it('clamps disc k-factor within disc bounds', () => {
    const result = calibrateBrakeKFactorForComponent(
      'FRONT_DISCS',
      1.0,
      28,
      20,
      10,
      1,
    );
    expect(result.applied).toBe(true);
    expect(result.newK).toBeLessThanOrEqual(1.3);
    expect(result.newK).toBeGreaterThanOrEqual(0.75);
  });
});
