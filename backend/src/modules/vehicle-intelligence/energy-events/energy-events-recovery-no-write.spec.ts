import { PrismaClient } from '@prisma/client';
import { runEnergyEventsRecoveryDryRun } from './energy-events-recovery-runner';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';

describe('energy-events recovery dry-run zero DB writes', () => {
  it('8. dry-run performs zero VehicleEnergyEvent mutations', async () => {
    const prisma = new PrismaClient();
    const mutationMethods = [
      'create',
      'update',
      'upsert',
      'delete',
      'deleteMany',
      'updateMany',
      'createMany',
    ] as const;

    const spies: jest.SpyInstance[] = [];
    for (const method of mutationMethods) {
      spies.push(
        jest.spyOn(prisma.vehicleEnergyEvent, method).mockImplementation(() => {
          throw new Error(`FORBIDDEN: vehicleEnergyEvent.${method} called during dry-run`);
        }),
      );
    }

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

    const report = await runEnergyEventsRecoveryDryRun(
      [
        {
          vehicleId: 'clveh1234567890123456789012',
          label: 'KS MX 2024',
          tokenId: 187336,
          provider: 'LTE_R1',
          powertrain: 'ICE',
          relativeFuelAvailable: true,
          absoluteFuelAvailable: true,
          rechargeSocAvailable: false,
          dimoAccessAvailable: true,
          existingEvents: [],
        },
      ],
      {
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
            {
              mechanism: 'recharge',
              status: 'SUCCESS_EMPTY',
              segments: [],
              windowFrom: '2026-08-22T00:00:00.000Z',
              windowTo: '2026-08-24T00:00:00.000Z',
              tokenId: 187336,
            },
          ],
        }),
        interRequestDelayMs: 0,
      },
    );

    expect(report.dbWritesPerformed).toBe(false);
    expect(report.summary.WOULD_CREATE).toBeGreaterThanOrEqual(1);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
    for (const spy of spies) spy.mockRestore();
    await prisma.$disconnect();
  });
});
