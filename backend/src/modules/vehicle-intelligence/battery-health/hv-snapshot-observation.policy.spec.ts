import { evaluateHvSnapshotObservation } from './hv-snapshot-observation.policy';

const ORG = 'org-1';
const VEHICLE = 'veh-1';
const SOURCE = 'DIMO';

const SOC_T1 = '2026-07-16T12:59:35.000Z';
const SOC_T2 = '2026-07-16T13:01:05.000Z';
const ENERGY_T1 = '2026-07-16T12:59:14.000Z';
const POLL_A = '2026-07-16T13:00:08.000Z';
const POLL_B = '2026-07-16T13:00:38.000Z';

describe('evaluateHvSnapshotObservation', () => {
  const baseLast = {
    socPercent: 73.82,
    energyUsedKwh: 41.38,
    energyObservedAt: new Date(ENERGY_T1),
    isCharging: false,
    chargingCableConnected: false,
    providerSohPercent: null,
    recordedAt: new Date(SOC_T1),
    providerReceivedAt: new Date(POLL_A),
    idempotencyKey: 'hv-snap:test',
  };

  it.each([
    {
      name: 'first observation persists',
      input: {
        organizationId: ORG,
        vehicleId: VEHICLE,
        providerSource: SOURCE,
        receivedAt: new Date(POLL_A),
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        isCharging: false,
        signalObservedAt: {
          soc: new Date(SOC_T1),
          currentEnergyKwh: new Date(ENERGY_T1),
        },
        lastSnapshot: null,
      },
      shouldPersist: true,
      reason: 'FIRST_OBSERVATION',
    },
    {
      name: 'identical poll is skipped',
      input: {
        organizationId: ORG,
        vehicleId: VEHICLE,
        providerSource: SOURCE,
        receivedAt: new Date(POLL_B),
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        isCharging: false,
        signalObservedAt: {
          soc: new Date(SOC_T1),
          currentEnergyKwh: new Date(ENERGY_T1),
        },
        lastSnapshot: baseLast,
      },
      shouldPersist: false,
      skipReason: 'UNCHANGED_POLL',
    },
    {
      name: 'new provider timestamp persists',
      input: {
        organizationId: ORG,
        vehicleId: VEHICLE,
        providerSource: SOURCE,
        receivedAt: new Date(POLL_B),
        socPercent: 74.1,
        currentEnergyKwh: 41.55,
        isCharging: false,
        signalObservedAt: {
          soc: new Date(SOC_T2),
          currentEnergyKwh: new Date(SOC_T2),
        },
        lastSnapshot: baseLast,
      },
      shouldPersist: true,
      reason: 'NEW_PROVIDER_TIMESTAMP',
    },
    {
      name: 'charging state change persists despite duplicate SOC',
      input: {
        organizationId: ORG,
        vehicleId: VEHICLE,
        providerSource: SOURCE,
        receivedAt: new Date(POLL_B),
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        isCharging: true,
        signalObservedAt: {
          soc: new Date(SOC_T1),
          currentEnergyKwh: new Date(ENERGY_T1),
          isCharging: new Date(SOC_T1),
        },
        lastSnapshot: baseLast,
      },
      shouldPersist: true,
      reason: 'CHARGING_STATE_CHANGE',
    },
  ])('$name', ({ input, shouldPersist, reason, skipReason }) => {
    const decision = evaluateHvSnapshotObservation(input);
    expect(decision.shouldPersist).toBe(shouldPersist);
    if (shouldPersist) {
      expect(decision.persistReasons).toContain(reason);
      expect(decision.idempotencyKey).toEqual(expect.any(String));
    } else {
      expect(decision.skipReason).toBe(skipReason);
    }
  });

  it('100 identical polls allow at most one persisted decision key', () => {
    let lastSnapshot: typeof baseLast | null = null;
    const keys = new Set<string>();

    for (let i = 0; i < 100; i += 1) {
      const receivedAt = new Date(new Date(POLL_A).getTime() + i * 30_000);
      const decision = evaluateHvSnapshotObservation({
        organizationId: ORG,
        vehicleId: VEHICLE,
        providerSource: SOURCE,
        receivedAt,
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        isCharging: false,
        signalObservedAt: {
          soc: new Date(SOC_T1),
          currentEnergyKwh: new Date(ENERGY_T1),
        },
        lastSnapshot,
      });

      if (decision.shouldPersist && decision.idempotencyKey) {
        keys.add(decision.idempotencyKey);
        lastSnapshot = {
          ...baseLast,
          providerReceivedAt: receivedAt,
          idempotencyKey: decision.idempotencyKey,
        };
      }
    }

    expect(keys.size).toBe(1);
  });
});
