import { PhysicalRefuelReconciliationRecoveryScheduler } from './physical-refuel-reconciliation-recovery.scheduler';

describe('PhysicalRefuelReconciliationRecoveryScheduler (F7-P10 lifecycle)', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function buildScheduler(
    config: {
      enabled: boolean;
      recoveryEnabled: boolean;
      recoveryIntervalMs?: number;
    },
    runtime?: {
      emitRecoveryBacklogMetrics?: jest.Mock;
      runRecoveryBatch?: jest.Mock;
    },
  ): PhysicalRefuelReconciliationRecoveryScheduler {
    const metrics = {
      setRecoveryEnabled: jest.fn(),
      setRecoveryBacklogFromRepository: jest.fn(),
      setRecoveryBacklog: jest.fn(),
      recordRecoveryRun: jest.fn(),
      recordRecoveryRecovered: jest.fn(),
    };
    return new PhysicalRefuelReconciliationRecoveryScheduler(
      {
        enabled: config.enabled,
        recoveryEnabled: config.recoveryEnabled,
        recoveryIntervalMs: config.recoveryIntervalMs ?? 45_000,
      } as never,
      {
        emitRecoveryBacklogMetrics:
          runtime?.emitRecoveryBacklogMetrics ?? jest.fn().mockResolvedValue(undefined),
        runRecoveryBatch:
          runtime?.runRecoveryBatch ??
          jest.fn().mockResolvedValue({
            processedVehicles: 1,
            enqueuedEventIds: [],
            recoveredReasons: { orphan_refuel: 1 },
          }),
      } as never,
      metrics as never,
    );
  }

  it('F7-P10a disabled G2 — shouldStartRecoveryTimer false and tick is no-op', async () => {
    const scheduler = buildScheduler({ enabled: false, recoveryEnabled: true });
    expect(scheduler.shouldStartRecoveryTimer()).toBe(false);
    await expect(scheduler.runRecoveryTick()).resolves.toBe(0);
  });

  it('F7-P10b recovery disabled — shouldStartRecoveryTimer false and tick is no-op', async () => {
    const scheduler = buildScheduler({ enabled: true, recoveryEnabled: false });
    expect(scheduler.shouldStartRecoveryTimer()).toBe(false);
    await expect(scheduler.runRecoveryTick()).resolves.toBe(0);
  });

  it('F7-P10c configured recovery interval is used when timer starts', () => {
    jest.useFakeTimers();
    const scheduler = buildScheduler({
      enabled: true,
      recoveryEnabled: true,
      recoveryIntervalMs: 45_000,
    });
    const tickSpy = jest.spyOn(scheduler, 'runRecoveryTick').mockResolvedValue(0);

    scheduler.onModuleInit();
    expect(tickSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(44_999);
    expect(tickSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(tickSpy).toHaveBeenCalledTimes(1);

    scheduler.onModuleDestroy();
  });

  it('F7-P10d same-process overlapping tick is prevented', async () => {
    let releaseBatch!: () => void;
    const batchGate = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    const runRecoveryBatch = jest.fn(async () => {
      await batchGate;
      return { processedVehicles: 1, enqueuedEventIds: [], recoveredReasons: {} };
    });
    const scheduler = buildScheduler(
      { enabled: true, recoveryEnabled: true },
      { runRecoveryBatch },
    );

    const first = scheduler.runRecoveryTick();
    const second = await scheduler.runRecoveryTick();
    expect(second).toBe(0);
    expect(runRecoveryBatch).toHaveBeenCalledTimes(1);

    releaseBatch();
    await expect(first).resolves.toBe(1);
  });

  it('F7-P10e thrown runRecoveryBatch does not permanently kill future ticks', async () => {
    const runRecoveryBatch = jest
      .fn()
      .mockRejectedValueOnce(new Error('recovery batch failed'))
      .mockResolvedValueOnce({
        processedVehicles: 2,
        enqueuedEventIds: [],
        recoveredReasons: { orphan_refuel: 2 },
      });
    const scheduler = buildScheduler(
      { enabled: true, recoveryEnabled: true },
      { runRecoveryBatch },
    );

    await expect(scheduler.runRecoveryTick()).resolves.toBe(0);
    await expect(scheduler.runRecoveryTick()).resolves.toBe(2);
    expect(runRecoveryBatch).toHaveBeenCalledTimes(2);
  });

  it('F7-P10f clean module destroy cancels future ticks', () => {
    jest.useFakeTimers();
    const scheduler = buildScheduler({
      enabled: true,
      recoveryEnabled: true,
      recoveryIntervalMs: 30_000,
    });
    const tickSpy = jest.spyOn(scheduler, 'runRecoveryTick').mockResolvedValue(0);

    scheduler.onModuleInit();
    scheduler.onModuleDestroy();

    jest.advanceTimersByTime(120_000);
    expect(tickSpy).not.toHaveBeenCalled();
  });
});
