import {
  buildHvCapacityShadowEvidenceFingerprint,
  isHvCapacityShadowEvidenceCurrent,
} from './hv-capacity-shadow-evidence.policy';

describe('hv-capacity-shadow-evidence.policy (P1-2)', () => {
  const base = {
    startAt: new Date('2026-10-17T19:00:00.000Z'),
    endAt: new Date('2026-10-17T21:00:00.000Z'),
    startSocPercent: 30,
    endSocPercent: 80,
    startEnergyKwh: 21,
    endEnergyKwh: 57,
    energyAddedKwh: 36,
    deltaSocPercent: 50,
    segmentAddedEnergyMinKwh: 0,
  };

  it('detects stale shadow evidence when session end is extended (FABLE G5)', () => {
    const fingerprint = buildHvCapacityShadowEvidenceFingerprint(base);
    const metadata = {
      providerSegmentFingerprint: 'fp',
      durationSeconds: 7200,
      lastReconciledAt: '2026-10-17T21:00:00.000Z',
      reconcileVersion: 2,
      shadowEvidenceFingerprint: fingerprint,
    };

    const extended = {
      ...base,
      endAt: new Date('2026-10-17T22:00:00.000Z'),
      endSocPercent: 85,
      endEnergyKwh: 61,
      energyAddedKwh: 40,
      deltaSocPercent: 55,
    };

    expect(
      isHvCapacityShadowEvidenceCurrent({
        session: extended,
        metadata,
      }),
    ).toBe(false);
  });
});
