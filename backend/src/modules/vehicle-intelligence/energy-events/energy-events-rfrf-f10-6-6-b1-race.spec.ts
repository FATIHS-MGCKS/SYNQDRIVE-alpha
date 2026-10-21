import { EnergyEventsService } from './energy-events.service';

describe('EnergyEventsService detectEnergyEvents ordering (F10.6.6-B.1)', () => {
  it('persists refuel then fire-and-forgets reconciliation before RFRF scan in same invocation', async () => {
    const callOrder: string[] = [];
    let reconcileResolve: (() => void) | undefined;
    const reconcileStarted = new Promise<void>((resolve) => {
      reconcileResolve = resolve;
    });

    const physicalRefuelReconciliationRuntime = {
      isEnabled: () => true,
      reconcileAndEnqueueAfterPersist: jest.fn(async () => {
        callOrder.push('reconcile_start');
        await reconcileStarted;
        callOrder.push('reconcile_end');
      }),
    };

    const rawFuelRefuelFallbackRuntime = {
      scanIfEnabled: jest.fn(async () => {
        callOrder.push('rfrf_scan');
        return { invoked: true };
      }),
    };

    const refuelRow = {
      id: 'vee-1',
      kind: 'REFUEL',
      vehicleId: 'veh-1',
      startTime: new Date('2026-09-19T16:00:00.000Z'),
      endTime: new Date('2026-09-19T16:30:00.000Z'),
      durationSeconds: 1800,
      detectionMechanism: 'refuel',
      confidence: 'MEDIUM',
    };

    const prisma = {
      vehicle: {
        findUnique: jest.fn(async () => ({
          id: 'veh-1',
          organizationId: 'org-1',
          fuelType: 'GASOLINE',
          dimoVehicle: { tokenId: 1, powertrainType: 'ICE', fuelType: 'GASOLINE' },
        })),
      },
      vehicleEnergyEvent: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => refuelRow),
        update: jest.fn(),
        findMany: jest.fn(async () => []),
      },
    };

    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn(async () => ({
        outcomes: [
          {
            mechanism: 'refuel',
            status: 'SUCCESS',
            windowFrom: '2026-09-19T15:00:00.000Z',
            windowTo: '2026-09-19T18:00:00.000Z',
            segments: [],
          },
        ],
        segments: [
          {
            segmentId: 'seg-1',
            mechanism: 'refuel',
            startTime: '2026-09-19T16:00:00.000Z',
            endTime: '2026-09-19T16:30:00.000Z',
            isOngoing: false,
            startedBeforeRange: false,
            durationSeconds: 1800,
            startLatitude: 1,
            startLongitude: 1,
            endLatitude: 1,
            endLongitude: 1,
            odometerStartKm: 1,
            odometerEndKm: 1,
            fuelStartLiters: 5,
            fuelEndLiters: 18,
            fuelDeltaLiters: 13,
            fuelStartPercent: null,
            fuelEndPercent: null,
            fuelDeltaPercent: null,
            socStartPercent: null,
            socEndPercent: null,
            socDeltaPercent: null,
            energyStartKwh: null,
            energyEndKwh: null,
            energyDeltaKwh: null,
          },
        ],
      })),
      fetchFuelLevelSamples: jest.fn(async () => []),
    };

    const service = new EnergyEventsService(
      prisma as never,
      dimoSegments as never,
      undefined,
      undefined,
      physicalRefuelReconciliationRuntime as never,
      rawFuelRefuelFallbackRuntime as never,
    );

    const detectPromise = service.detectEnergyEvents('veh-1', {
      from: new Date('2026-09-19T15:00:00.000Z'),
      to: new Date('2026-09-19T18:00:00.000Z'),
    });

    for (let attempt = 0; attempt < 50 && !callOrder.includes('rfrf_scan'); attempt++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(callOrder).toContain('reconcile_start');
    expect(callOrder).not.toContain('reconcile_end');
    expect(callOrder).toContain('rfrf_scan');

    reconcileResolve?.();
    await detectPromise;
    expect(callOrder.indexOf('rfrf_scan')).toBeLessThan(callOrder.indexOf('reconcile_end'));
  });
});
