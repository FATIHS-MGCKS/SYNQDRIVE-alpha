import { Test } from '@nestjs/testing';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureExp021FleetCoordinatorService } from '../../modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { ReferenceCaptureExp021FleetCoordinatorScheduler } from './reference-capture-exp021-fleet-coordinator.scheduler';

describe('ReferenceCaptureExp021FleetCoordinatorScheduler', () => {
  let scheduler: ReferenceCaptureExp021FleetCoordinatorScheduler;
  let evaluateTick: jest.Mock;
  let shouldRun: jest.Mock;

  beforeEach(async () => {
    evaluateTick = jest.fn().mockResolvedValue([]);
    shouldRun = jest.fn().mockReturnValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceCaptureExp021FleetCoordinatorScheduler,
        {
          provide: ReferenceCaptureConfig,
          useValue: { isFleetCoordinatorEnabled: () => true, isFleetDryRun: () => true },
        },
        {
          provide: ReferenceCaptureExp021FleetCoordinatorService,
          useValue: { evaluateFleetDryRunTick: evaluateTick },
        },
        { provide: SchedulerLeaderGuardService, useValue: { shouldRun } },
      ],
    }).compile();
    scheduler = moduleRef.get(ReferenceCaptureExp021FleetCoordinatorScheduler);
  });

  it('evaluates on leader replica', async () => {
    await scheduler.evaluateFleetDryRun();
    expect(shouldRun).toHaveBeenCalledWith('reference_capture_exp021_fleet_coordinator');
    expect(evaluateTick).toHaveBeenCalledTimes(1);
  });

  it('skips evaluation on follower replica', async () => {
    shouldRun.mockReturnValue(false);
    await scheduler.evaluateFleetDryRun();
    expect(evaluateTick).not.toHaveBeenCalled();
  });
});
