import { clusterHvAdminPhysicalChargeEpisodes } from './hv-battery-admin-physical-episode.policy';

describe('clusterHvAdminPhysicalChargeEpisodes', () => {
  const evaluatedAt = new Date('2026-10-22T12:00:00.000Z');

  it('merges overlapping native segments into one physical episode', () => {
    const start = new Date('2026-10-01T10:00:00.000Z');
    const end = new Date('2026-10-01T12:00:00.000Z');
    const clusters = clusterHvAdminPhysicalChargeEpisodes(
      [
        {
          id: 'a',
          source: 'DIMO_RECHARGE_SEGMENT',
          segmentFingerprint: 'fp-a',
          startAt: start,
          endAt: end,
          startSocPercent: 20,
          endSocPercent: 80,
          startEnergyKwh: 10,
          endEnergyKwh: 50,
          energyAddedKwh: 40,
          deltaSocPercent: 60,
          isOngoing: false,
          quality: 'SHADOW',
          metadata: null,
        },
        {
          id: 'b',
          source: 'DIMO_RECHARGE_SEGMENT',
          segmentFingerprint: 'fp-b',
          startAt: new Date('2026-10-01T10:05:00.000Z'),
          endAt: new Date('2026-10-01T11:55:00.000Z'),
          startSocPercent: 22,
          endSocPercent: 78,
          startEnergyKwh: 11,
          endEnergyKwh: 48,
          energyAddedKwh: 37,
          deltaSocPercent: 56,
          isOngoing: false,
          quality: 'SHADOW',
          metadata: null,
        },
      ],
      evaluatedAt,
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].providerSegmentCount).toBe(2);
    expect(clusters[0].sessionIds.sort()).toEqual(['a', 'b']);
  });

  it('keeps distinct time windows as separate episodes', () => {
    const clusters = clusterHvAdminPhysicalChargeEpisodes(
      [
        {
          id: 'a',
          source: 'DIMO_RECHARGE_SEGMENT',
          segmentFingerprint: 'fp-a',
          startAt: new Date('2026-10-01T10:00:00.000Z'),
          endAt: new Date('2026-10-01T11:00:00.000Z'),
          startSocPercent: 20,
          endSocPercent: 50,
          startEnergyKwh: null,
          endEnergyKwh: null,
          energyAddedKwh: null,
          deltaSocPercent: 30,
          isOngoing: false,
          quality: 'SHADOW',
          metadata: null,
        },
        {
          id: 'b',
          source: 'DIMO_RECHARGE_SEGMENT',
          segmentFingerprint: 'fp-b',
          startAt: new Date('2026-10-03T10:00:00.000Z'),
          endAt: new Date('2026-10-03T11:00:00.000Z'),
          startSocPercent: 30,
          endSocPercent: 60,
          startEnergyKwh: null,
          endEnergyKwh: null,
          energyAddedKwh: null,
          deltaSocPercent: 30,
          isOngoing: false,
          quality: 'SHADOW',
          metadata: null,
        },
      ],
      evaluatedAt,
    );

    expect(clusters).toHaveLength(2);
  });
});
