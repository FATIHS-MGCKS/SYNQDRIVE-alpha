import { FuelStationEnrichmentRecoveryScheduler } from './fuel-station-enrichment-recovery.scheduler';
import { EnergyEventKind } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

describe('FuelStationEnrichmentRecoveryScheduler', () => {
  const config = {
    enabled: true,
    recoveryEnabled: true,
    recoveryBatchSize: 10,
    cutoverAt: new Date('2026-08-31T00:00:00.000Z'),
  };

  const prisma = {
    vehicleEnergyEvent: {
      findMany: jest.fn(),
    },
  };

  const producer = {
    enqueueAfterPersistFromEvent: jest.fn(),
  };

  const leaderGuard = {
    shouldRun: jest.fn().mockReturnValue(true),
  };

  const scheduler = new FuelStationEnrichmentRecoveryScheduler(
    config as never,
    prisma as never,
    producer as never,
    leaderGuard as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    leaderGuard.shouldRun.mockReturnValue(true);
    producer.enqueueAfterPersistFromEvent.mockResolvedValue('job-1');
  });

  it('does not recover when feature disabled', async () => {
    const disabled = new FuelStationEnrichmentRecoveryScheduler(
      { ...config, enabled: false } as never,
      prisma as never,
      producer as never,
      leaderGuard as never,
    );

    const recovered = await disabled.recoverMissedEnrichments();
    expect(recovered).toBe(0);
    expect(prisma.vehicleEnergyEvent.findMany).not.toHaveBeenCalled();
  });

  it('queries only post-cutover REFUEL events', async () => {
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([]);

    await scheduler.recoverMissedEnrichments();

    expect(prisma.vehicleEnergyEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: EnergyEventKind.REFUEL,
          createdAt: { gte: config.cutoverAt },
        }),
      }),
    );
  });

  it('re-enqueues post-cutover missed events', async () => {
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([
      { id: 'evt-post', kind: EnergyEventKind.REFUEL, createdAt: new Date('2026-09-01T00:00:00.000Z') },
    ]);

    const recovered = await scheduler.recoverMissedEnrichments();

    expect(recovered).toBe(1);
    expect(producer.enqueueAfterPersistFromEvent).toHaveBeenCalledTimes(1);
  });
});
