import { Test } from '@nestjs/testing';
import { isBatteryV2LongitudinalProfileMaterializationEnabled } from '@config/battery-health-v2.config';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { LongitudinalReconciliationService } from '@modules/vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/longitudinal/longitudinal-reconciliation.service';
import { BatteryV2LongitudinalMaterializationReconciliationScheduler } from './battery-v2-longitudinal-materialization-reconciliation.scheduler';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2LongitudinalProfileMaterializationEnabled: jest.fn(),
}));

describe('BatteryV2LongitudinalMaterializationReconciliationScheduler', () => {
  const enabledMock = isBatteryV2LongitudinalProfileMaterializationEnabled as jest.Mock;

  let scheduler: BatteryV2LongitudinalMaterializationReconciliationScheduler;
  let shouldRun: jest.Mock;
  let runBoundedReconciliationTick: jest.Mock;

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
      ],
    }).compile();

    scheduler = moduleRef.get(BatteryV2LongitudinalMaterializationReconciliationScheduler);
  });

  it('non-leader — zero reconciliation work', async () => {
    shouldRun.mockReturnValue(false);
    await scheduler.reconcileLongitudinalProfiles();
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
  });

  it('D3 flag OFF — scheduler returns before service', async () => {
    enabledMock.mockReturnValue(false);
    await scheduler.reconcileLongitudinalProfiles();
    expect(runBoundedReconciliationTick).not.toHaveBeenCalled();
  });

  it('overlap — second tick skips while first in progress', async () => {
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

    releaseFirst?.();
    await first;
  });
});
