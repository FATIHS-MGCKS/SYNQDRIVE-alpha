import { Test } from '@nestjs/testing';
import { isBatteryV2LongitudinalProfileMaterializationEnabled } from '@config/battery-health-v2.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { LongitudinalReconciliationService } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.service';
import { LongitudinalReconciliationInvariantViolationError } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.invariants';
import { BatteryV2LongitudinalMaterializationReconciliationScheduler } from './battery-v2-longitudinal-materialization-reconciliation.scheduler';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2LongitudinalProfileMaterializationEnabled: jest.fn(),
}));

describe('BatteryV2LongitudinalMaterializationReconciliationScheduler', () => {
  const enabledMock = isBatteryV2LongitudinalProfileMaterializationEnabled as jest.Mock;

  let scheduler: BatteryV2LongitudinalMaterializationReconciliationScheduler;
  let shouldRun: jest.Mock;
  let runBoundedReconciliationTick: jest.Mock;
  let metrics: TripMetricsService;
  let ticksInc: jest.SpyInstance;
  let flagGaugeSet: jest.SpyInstance;

  beforeEach(async () => {
    enabledMock.mockReturnValue(true);
    shouldRun = jest.fn().mockReturnValue(true);
    runBoundedReconciliationTick = jest.fn().mockResolvedValue({
      status: 'COMPLETED',
      candidateCount: 0,
      processedCount: 0,
      createdCount: 0,
      existingCount: 0,
      d1RejectedCount: 0,
      d2RejectedCount: 0,
      errorCount: 0,
    });

    metrics = new TripMetricsService();
    ticksInc = jest.spyOn(metrics.batteryLongitudinalReconciliationTicksTotal, 'inc');
    flagGaugeSet = jest.spyOn(metrics.batteryLongitudinalMaterializationFlagEnabled, 'set');

    const moduleRef = await Test.createTestingModule({
      providers: [
        BatteryV2LongitudinalMaterializationReconciliationScheduler,
        {
          provide: LongitudinalReconciliationService,
          useValue: { runBoundedReconciliationTick },
        },
        {
          provide: SchedulerLeaderGuardService,
          useValue: { shouldRun },
        },
        { provide: TripMetricsService, useValue: metrics },
      ],
    }).compile();

    scheduler = moduleRef.get(BatteryV2LongitudinalMaterializationReconciliationScheduler);
  });

  it('T20 non-leader — NOT_LEADER metric and zero reconciliation work', async () => {
    enabledMock.mockReturnValue(false);
    shouldRun.mockReturnValue(false);
    await scheduler.reconcileLongitudinalProfiles();
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
    expect(flagGaugeSet).toHaveBeenCalledWith(0);
    expect(ticksInc).toHaveBeenCalledWith({ result: 'NOT_LEADER' });
  });

  it('F3A leader + OFF — gauge 0', async () => {
    enabledMock.mockReturnValue(false);
    await scheduler.reconcileLongitudinalProfiles();
    expect(flagGaugeSet).toHaveBeenCalledWith(0);
    expect(ticksInc).toHaveBeenCalledWith({ result: 'FLAG_OFF' });
  });

  it('F3C leader + ON — gauge 1', async () => {
    enabledMock.mockReturnValue(true);
    await scheduler.reconcileLongitudinalProfiles();
    expect(flagGaugeSet).toHaveBeenCalledWith(1);
  });

  it('F3D non-leader + ON — gauge 1 and NOT_LEADER', async () => {
    enabledMock.mockReturnValue(true);
    shouldRun.mockReturnValue(false);
    await scheduler.reconcileLongitudinalProfiles();
    expect(flagGaugeSet).toHaveBeenCalledWith(1);
    expect(ticksInc).toHaveBeenCalledWith({ result: 'NOT_LEADER' });
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
  });

  it('F3E flag gauge failure does not change scheduler behavior', async () => {
    flagGaugeSet.mockImplementation(() => {
      throw new Error('gauge down');
    });
    enabledMock.mockReturnValue(false);
    await expect(scheduler.reconcileLongitudinalProfiles()).resolves.toBeUndefined();
    expect(ticksInc).toHaveBeenCalledWith({ result: 'FLAG_OFF' });
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
  });

  it('T2 D3 flag OFF — FLAG_OFF metric and scheduler returns before service', async () => {
    enabledMock.mockReturnValue(false);
    await scheduler.reconcileLongitudinalProfiles();
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
    expect(ticksInc).toHaveBeenCalledWith({ result: 'FLAG_OFF' });
  });

  it('overlap — OVERLAP metric and second tick skips while first in progress', async () => {
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    runBoundedReconciliationTick.mockImplementation(async () => {
      await gate;
      return {
        status: 'COMPLETED',
        candidateCount: 1,
        processedCount: 1,
        createdCount: 1,
        existingCount: 0,
        d1RejectedCount: 0,
        d2RejectedCount: 0,
        errorCount: 0,
      };
    });

    const first = scheduler.reconcileLongitudinalProfiles();
    await Promise.resolve();
    await scheduler.reconcileLongitudinalProfiles();
    expect(runBoundedReconciliationTick).toHaveBeenCalledTimes(1);
    expect(ticksInc).toHaveBeenCalledWith({ result: 'OVERLAP' });

    releaseFirst?.();
    await first;
    expect(ticksInc).toHaveBeenCalledWith({ result: 'COMPLETED' });
  });

  it('T6 FAILED — records FAILED when service throws', async () => {
    runBoundedReconciliationTick.mockRejectedValue(
      new LongitudinalReconciliationInvariantViolationError('VEHICLE_ORGANIZATION_MISMATCH'),
    );
    await scheduler.reconcileLongitudinalProfiles();
    expect(ticksInc).toHaveBeenCalledWith({ result: 'FAILED' });
  });
});
