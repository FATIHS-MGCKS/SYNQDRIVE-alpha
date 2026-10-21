import { buildCandidateIdentityKey } from './raw-refuel-candidate-identity-key';

describe('raw-refuel-candidate-identity-key', () => {
  it('is stable for same inputs', () => {
    const input = {
      vehicleId: 'veh-1',
      detectionVersion: 'rfrf-v1',
      signalChannel: 'ABSOLUTE_LITERS' as const,
      prePlateauBucket: 7,
      riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    };
    expect(buildCandidateIdentityKey(input)).toBe(buildCandidateIdentityKey(input));
  });

  it('changes when rise onset crosses 5-minute bucket boundary', () => {
    const base = {
      vehicleId: 'veh-1',
      detectionVersion: 'rfrf-v1',
      signalChannel: 'ABSOLUTE_LITERS' as const,
      prePlateauBucket: 7,
    };
    const k1 = buildCandidateIdentityKey({
      ...base,
      riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    });
    const k2 = buildCandidateIdentityKey({
      ...base,
      riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
    });
    expect(k1).not.toBe(k2);
  });
});
