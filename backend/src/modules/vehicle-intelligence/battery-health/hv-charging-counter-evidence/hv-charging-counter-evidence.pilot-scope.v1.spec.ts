import { selectHvChargingCounterPilotSessionsV1 } from './hv-charging-counter-evidence.pilot-scope.v1';
import type { HvChargeSessionPersistResult } from '../hv-charge-session/hv-charge-session.types';

function row(id: string, changed: boolean, startMs: number): HvChargeSessionPersistResult {
  return {
    changed,
    changeKind: changed ? 'provider_refresh' : 'no_op',
    created: false,
    session: {
      id,
      organizationId: 'org',
      vehicleId: 'veh',
      segmentFingerprint: `fp-${id}`,
      source: 'DIMO_RECHARGE_SEGMENT',
      startAt: new Date(startMs),
      endAt: new Date(startMs + 3600_000),
      isOngoing: false,
      energyAddedKwh: 1,
      startSocPercent: null,
      endSocPercent: null,
      startEnergyKwh: null,
      endEnergyKwh: null,
      deltaSocPercent: null,
      providerObservedAt: null,
      dimoSegmentId: null,
      measurementSessionId: null,
      quality: null,
      idempotencyKey: id,
      metadata: {},
      receivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe('selectHvChargingCounterPilotSessionsV1', () => {
  it('selects exactly one session preferring changed rows', () => {
    const { selected, deferredCount } = selectHvChargingCounterPilotSessionsV1([
      row('a', false, 100),
      row('b', true, 50),
      row('c', false, 200),
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0].session.id).toBe('b');
    expect(deferredCount).toBe(2);
  });
});
