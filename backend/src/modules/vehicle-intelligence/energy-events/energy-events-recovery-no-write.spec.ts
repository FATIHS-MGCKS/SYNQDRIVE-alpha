import { PrismaClient } from '@prisma/client';
import {
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
} from './energy-events-recovery-read.repository';
import { runEnergyEventsRecoveryDryRun } from './energy-events-recovery-runner';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from './energy-events-recovery.constants';

describe('energy-events recovery dry-run zero DB writes', () => {
  it('9. dry-run uses read-only repository and performs zero VehicleEnergyEvent mutations', async () => {
    const prisma = createMutationGuardedPrismaClient(new PrismaClient());
    const repository = createPrismaRecoveryReadRepository(prisma);
    jest.spyOn(prisma.vehicle, 'findMany').mockResolvedValue([
      {
        id: 'clveh1234567890123456789012',
        licensePlate: 'KS MX 2024',
        vehicleName: null,
        hardwareType: 'LTE_R1',
        dimoVehicle: { tokenId: 187336 },
        energyEvents: [],
      },
    ] as never);

    const vehicles = await repository.loadVehiclesForRecovery({
      outageStart: new Date(ENERGY_EVENTS_OUTAGE_START_ISO),
      recoveryCutoff: new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO),
    });

    const refuel: DimoEnergyEventSegment = {
      segmentId: 'dimo-refuel-187336-1724427315000',
      mechanism: 'refuel',
      startTime: '2026-08-23T16:15:15.000Z',
      endTime: '2026-08-23T16:23:16.000Z',
      isOngoing: false,
      startedBeforeRange: false,
      durationSeconds: 481,
      startLatitude: 51.31,
      startLongitude: 9.49,
      endLatitude: 51.31,
      endLongitude: 9.49,
      odometerStartKm: 12000,
      odometerEndKm: 12000,
      fuelStartLiters: 8,
      fuelEndLiters: 26,
      fuelDeltaLiters: 18,
      fuelStartPercent: 13,
      fuelEndPercent: 42,
      fuelDeltaPercent: 29,
      socStartPercent: null,
      socEndPercent: null,
      socDeltaPercent: null,
      energyStartKwh: null,
      energyEndKwh: null,
      energyDeltaKwh: null,
    };

    const report = await runEnergyEventsRecoveryDryRun(vehicles, {
      fetchSegments: async () => ({
        segments: [refuel],
        outcomes: [
          {
            mechanism: 'refuel',
            status: 'SUCCESS_WITH_EVENTS',
            segments: [refuel],
            windowFrom: '2026-08-22T00:00:00.000Z',
            windowTo: '2026-08-24T00:00:00.000Z',
            tokenId: 187336,
          },
        ],
        accounting: {
          telemetryGraphqlRequests: 1,
          tokenExchangeRequests: 1,
          mechanismRequests: 1,
          retries: 0,
        },
      }),
      interRequestDelayMs: 0,
      windowsOverride: [
        { from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') },
      ],
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
    });

    expect(report.dbWritesPerformed).toBe(false);
    expect(report.summary.WOULD_CREATE).toBeGreaterThanOrEqual(1);
    expect(() =>
      prisma.vehicleEnergyEvent.create({ data: {} as never }),
    ).toThrow(/FORBIDDEN/);
    await prisma.$disconnect();
  });
});
