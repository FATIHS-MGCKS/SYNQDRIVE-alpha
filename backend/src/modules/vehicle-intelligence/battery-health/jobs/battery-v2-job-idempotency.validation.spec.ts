import { validateBatteryV2JobIdempotencyKey } from './battery-v2-job-idempotency.validation';

describe('validateBatteryV2JobIdempotencyKey', () => {
  it('accepts observation prefixes', () => {
    expect(() =>
      validateBatteryV2JobIdempotencyKey(
        'BATTERY_OBSERVATION_CLASSIFY',
        'battery-obs:org:veh:signal:DIMO:123:12.4',
      ),
    ).not.toThrow();
    expect(() =>
      validateBatteryV2JobIdempotencyKey('BATTERY_OBSERVATION_CLASSIFY', 'hv-snap:veh:123'),
    ).not.toThrow();
  });

  it('rejects wrong prefix per job type', () => {
    expect(() =>
      validateBatteryV2JobIdempotencyKey('BATTERY_ASSESSMENT_RECOMPUTE', 'pub:bad'),
    ).toThrow(/assess:/);
  });
});
