import { FuelStationEnrichmentRecoveryScheduler } from './fuel-station-enrichment-recovery.scheduler';
import { EnergyEventKind } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

describe('FuelStationEnrichmentRecoveryScheduler', () => {
  const config = {
    enabled: true,
    recoveryEnabled: true,
    recoveryBatchSize: 10,
    cutoverAt: new Date('2026-09-01T00:00:00.000Z'),
    cutoverState: 'valid' as const,
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
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([]);
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

  it('does not recover when recovery disabled', async () => {
    const noRecovery = new FuelStationEnrichmentRecoveryScheduler(
      { ...config, recoveryEnabled: false } as never,
      prisma as never,
      producer as never,
      leaderGuard as never,
    );

    const recovered = await noRecovery.recoverMissedEnrichments();
    expect(recovered).toBe(0);
    expect(prisma.vehicleEnergyEvent.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when recovery enabled but cutover missing', async () => {
    const missingCutover = new FuelStationEnrichmentRecoveryScheduler(
      {
        ...config,
        cutoverAt: null,
        cutoverState: 'missing',
      } as never,
      prisma as never,
      producer as never,
      leaderGuard as never,
    );

    const recovered = await missingCutover.recoverMissedEnrichments();
    expect(recovered).toBe(0);
    expect(prisma.vehicleEnergyEvent.findMany).not.toHaveBeenCalled();
    expect(producer.enqueueAfterPersistFromEvent).not.toHaveBeenCalled();
  });

  it('fails closed when recovery enabled but cutover invalid', async () => {
    const invalidCutover = new FuelStationEnrichmentRecoveryScheduler(
      {
        ...config,
        cutoverAt: null,
        cutoverState: 'invalid',
      } as never,
      prisma as never,
      producer as never,
      leaderGuard as never,
    );

    const recovered = await invalidCutover.recoverMissedEnrichments();
    expect(recovered).toBe(0);
    expect(prisma.vehicleEnergyEvent.findMany).not.toHaveBeenCalled();
    expect(producer.enqueueAfterPersistFromEvent).not.toHaveBeenCalled();
  });

  it('queries only post-cutover REFUEL events by startTime', async () => {
    await scheduler.recoverMissedEnrichments();

    expect(prisma.vehicleEnergyEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: EnergyEventKind.REFUEL,
          startTime: { gte: config.cutoverAt },
        }),
        orderBy: { startTime: 'asc' },
      }),
    );
  });

  it('does not include FAILED rows in recovery eligibility', async () => {
    await scheduler.recoverMissedEnrichments();

    const where = prisma.vehicleEnergyEvent.findMany.mock.calls[0][0].where;
    const enrichmentOr = where.OR[1].fuelStationEnrichment.is.OR;
    const statuses = enrichmentOr.map(
      (clause: { processingStatus?: string }) => clause.processingStatus,
    );
    expect(statuses).toEqual(expect.arrayContaining(['PENDING', 'PROCESSING']));
    expect(statuses).not.toContain('FAILED');
  });

  it('re-enqueues post-cutover missed events', async () => {
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([
      {
        id: 'evt-post',
        kind: EnergyEventKind.REFUEL,
        startTime: new Date('2026-09-02T00:00:00.000Z'),
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    ]);

    const recovered = await scheduler.recoverMissedEnrichments();

    expect(recovered).toBe(1);
    expect(producer.enqueueAfterPersistFromEvent).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue FAILED rows on subsequent recovery sweeps', async () => {
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([]);

    await scheduler.recoverMissedEnrichments();
    await scheduler.recoverMissedEnrichments();

    expect(producer.enqueueAfterPersistFromEvent).not.toHaveBeenCalled();
    const where = prisma.vehicleEnergyEvent.findMany.mock.calls[0][0].where;
    const enrichmentOr = where.OR[1].fuelStationEnrichment.is.OR;
    expect(enrichmentOr.some((clause: { processingStatus?: string }) => clause.processingStatus === 'FAILED')).toBe(
      false,
    );
  });
});
