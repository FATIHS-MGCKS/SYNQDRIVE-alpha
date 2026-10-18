import { HV_CHARGING_COUNTER_AVAILABILITY } from './hv-charging-counter-evidence.constants.v1';
import { computeHvChargingCounterObservationSetFingerprintV1 } from './hv-charging-counter-evidence.fingerprint.v1';

describe('reduced coverage fingerprint semantics', () => {
  it('changes observation-set fingerprint when a prior bucket slot is omitted', () => {
    const bucketA = {
      bucketStartAt: new Date('2026-10-16T13:15:02.931Z'),
      bucketEndAt: new Date('2026-10-16T13:16:02.931Z'),
      valueKwh: 1,
      minKwh: 1,
      maxKwh: 1,
      availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
    };
    const bucketB = {
      bucketStartAt: new Date('2026-10-16T13:16:02.931Z'),
      bucketEndAt: new Date('2026-10-16T13:17:02.931Z'),
      valueKwh: 2,
      minKwh: 2,
      maxKwh: 2,
      availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
    };
    const full = computeHvChargingCounterObservationSetFingerprintV1([bucketA, bucketB]);
    const reduced = computeHvChargingCounterObservationSetFingerprintV1([bucketA]);
    expect(reduced).not.toBe(full);
  });
});
