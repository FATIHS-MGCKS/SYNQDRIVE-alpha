import {
  buildLvStandbyTransmissionEvidenceWhere,
  VSI_LV_STANDBY_MAX_ROWS,
} from './vsi-lv-standby-transmission-evidence.loader';

describe('vsi-lv-standby-transmission-evidence.loader', () => {
  it('builds provider-time bounded LIVE_VOLTAGE VALID query', () => {
    const vehicleId = 'veh-1';
    const windowStart = new Date('2026-09-01T00:00:00.000Z');
    const decisionAt = new Date('2026-10-01T00:00:00.000Z');
    expect(buildLvStandbyTransmissionEvidenceWhere(vehicleId, windowStart, decisionAt)).toEqual({
      vehicleId,
      type: 'LIVE_VOLTAGE',
      quality: 'VALID',
      providerTimestamp: { not: null, gte: windowStart, lte: decisionAt },
      observedAt: { lte: decisionAt },
    });
  });

  it('documents bounded row cap for database safety', () => {
    expect(VSI_LV_STANDBY_MAX_ROWS).toBe(4_000);
  });
});
