import { Test } from '@nestjs/testing';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { M3_3HvH4A3ReconciliationService } from '@modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-reconciliation.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { BatteryHvH4A3ReconciliationScheduler } from './battery-hv-h4-a3-reconciliation.scheduler';

jest.mock(
  '@modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-reconciliation.config',
  () => ({
    isBatteryHvH4A3ReconciliationEnabled: jest.fn(),
    getBatteryHvH4A3ReconciliationIntervalMs: jest.fn(() => 900_000),
  }),
);

import { isBatteryHvH4A3ReconciliationEnabled } from '@modules/vehicle-intelligence/battery-health/hv-h4/m3-3-hv-h4-a3-reconciliation.config';

describe('BatteryHvH4A3ReconciliationScheduler', () => {
  const enabledMock = isBatteryHvH4A3ReconciliationEnabled as jest.Mock;

  let scheduler: BatteryHvH4A3ReconciliationScheduler;
  let shouldRun: jest.Mock;
  let runBoundedReconciliationTick: jest.Mock;
  let metrics: TripMetricsService;
  let ticksInc: jest.SpyInstance;

  beforeEach(async () => {
    enabledMock.mockReturnValue(true);
    shouldRun = jest.fn().mockReturnValue(true);
    runBoundedReconciliationTick = jest.fn().mockResolvedValue({
      result: 'COMPLETED',
      inspectedCount: 0,
      createdCount: 0,
      existingCount: 0,
      ackRepairCount: 0,
      sourceChangedCount: 0,
      blockedIntegrityCount: 0,
      blockedTenantCount: 0,
      errorCount: 0,
      materializedOrRepairedCount: 0,
      durationMs: 1,
    });

    metrics = new TripMetricsService();
    ticksInc = jest.spyOn(metrics.batteryHvH4A3ReconciliationSchedulerTicksTotal, 'inc');

    const moduleRef = await Test.createTestingModule({
      providers: [
        BatteryHvH4A3ReconciliationScheduler,
        {
          provide: M3_3HvH4A3ReconciliationService,
          useValue: { runBoundedReconciliationTick },
        },
        {
          provide: SchedulerLeaderGuardService,
          useValue: { shouldRun },
        },
        { provide: TripMetricsService, useValue: metrics },
      ],
    }).compile();

    scheduler = moduleRef.get(BatteryHvH4A3ReconciliationScheduler);
  });

  it('flag OFF — no reconciliation work', async () => {
    enabledMock.mockReturnValue(false);
    await scheduler.reconcileHvH4A3Evidence();
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
    expect(ticksInc).toHaveBeenCalledWith({ result: 'FLAG_OFF' });
  });

  it('NOT_LEADER — no reconciliation work', async () => {
    shouldRun.mockReturnValue(false);
    await scheduler.reconcileHvH4A3Evidence();
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
    expect(ticksInc).toHaveBeenCalledWith({ result: 'NOT_LEADER' });
  });

  it('leader + flag ON — one bounded tick', async () => {
    await scheduler.reconcileHvH4A3Evidence();
    expect(runBoundedReconciliationTick).toHaveBeenCalledTimes(1);
    expect(ticksInc).toHaveBeenCalledWith({ result: 'COMPLETED' });
  });

  it('overlap — second tick skipped', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    runBoundedReconciliationTick.mockImplementation(() => gate);
    const first = scheduler.reconcileHvH4A3Evidence();
    await Promise.resolve();
    await scheduler.reconcileHvH4A3Evidence();
    expect(runBoundedReconciliationTick).toHaveBeenCalledTimes(1);
    expect(ticksInc).toHaveBeenCalledWith({ result: 'OVERLAP' });
    release?.();
    await first;
  });

  it('service error — FAILED metric and overlap cleared', async () => {
    runBoundedReconciliationTick.mockRejectedValue(new Error('boom'));
    await scheduler.reconcileHvH4A3Evidence();
    expect(ticksInc).toHaveBeenCalledWith({ result: 'FAILED' });
    await scheduler.reconcileHvH4A3Evidence();
    expect(runBoundedReconciliationTick).toHaveBeenCalledTimes(2);
  });
});
