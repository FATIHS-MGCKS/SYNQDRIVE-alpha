import { FuelStationEnrichmentRecoveryScheduler } from './fuel-station-enrichment-recovery.scheduler';
import { EnergyEventKind } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

describe('FuelStationEnrichmentRecoveryScheduler', () => {
  const config = {
    enabled: true,
    recoveryEnabled: true,
    recoveryIntervalMs: 300_000,
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

  const createScheduler = (overrides: Record<string, unknown> = {}) =>
    new FuelStationEnrichmentRecoveryScheduler(
      { ...config, ...overrides } as never,
      { v2OwnershipCutoverAt: config.cutoverAt } as never,
      prisma as never,
      producer as never,
      leaderGuard as never,
      undefined,
    );

  let scheduler: FuelStationEnrichmentRecoveryScheduler;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    scheduler = createScheduler();
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    leaderGuard.shouldRun.mockReturnValue(true);
    producer.enqueueAfterPersistFromEvent.mockResolvedValue('job-1');
    prisma.vehicleEnergyEvent.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.useRealTimers();
  });

  it('does not start timer when feature disabled', () => {
    const disabled = createScheduler({ enabled: false });
    const intervalSpy = jest.spyOn(global, 'setInterval');

    disabled.onModuleInit();

    expect(intervalSpy).not.toHaveBeenCalled();
    disabled.onModuleDestroy();
  });

  it('does not start timer when recovery disabled', () => {
    const noRecovery = createScheduler({ recoveryEnabled: false });
    const intervalSpy = jest.spyOn(global, 'setInterval');

    noRecovery.onModuleInit();

    expect(intervalSpy).not.toHaveBeenCalled();
    noRecovery.onModuleDestroy();
  });

  it('does not start timer when cutover missing', () => {
    const missingCutover = createScheduler({
      cutoverAt: null,
      cutoverState: 'missing',
    });
    const intervalSpy = jest.spyOn(global, 'setInterval');

    missingCutover.onModuleInit();

    expect(intervalSpy).not.toHaveBeenCalled();
    missingCutover.onModuleDestroy();
  });

  it('does not start timer when cutover invalid', () => {
    const invalidCutover = createScheduler({
      cutoverAt: null,
      cutoverState: 'invalid',
    });
    const intervalSpy = jest.spyOn(global, 'setInterval');

    invalidCutover.onModuleInit();

    expect(intervalSpy).not.toHaveBeenCalled();
    invalidCutover.onModuleDestroy();
  });

  it('starts timer when enabled, recovery enabled, and cutover valid', () => {
    const intervalSpy = jest.spyOn(global, 'setInterval');

    scheduler.onModuleInit();

    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(scheduler.shouldStartRecoveryTimer()).toBe(true);
  });

  it('does not recover when feature disabled', async () => {
    const disabled = createScheduler({ enabled: false });

    const recovered = await disabled.recoverMissedEnrichments();
    expect(recovered).toBe(0);
    expect(prisma.vehicleEnergyEvent.findMany).not.toHaveBeenCalled();
  });

  it('fails closed at runtime when recovery enabled but cutover missing', async () => {
    const missingCutover = createScheduler({
      cutoverAt: null,
      cutoverState: 'missing',
    });

    const recovered = await missingCutover.recoverMissedEnrichments();
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
});
