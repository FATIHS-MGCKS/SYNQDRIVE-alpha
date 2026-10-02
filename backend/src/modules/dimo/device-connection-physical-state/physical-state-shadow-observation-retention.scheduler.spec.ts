import { PhysicalStateShadowObservationRetentionScheduler } from './physical-state-shadow-observation-retention.scheduler';
import type { PhysicalStateShadowObservationRepository } from './physical-state-shadow-observation.repository';
import type { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

describe('PhysicalStateShadowObservationRetentionScheduler', () => {
  function createScheduler(input: {
    shouldRun: boolean;
    pruneResult: number;
    pruneError?: Error;
  }) {
    const observationRepository = {
      pruneExpiredObservations: input.pruneError
        ? jest.fn().mockRejectedValue(input.pruneError)
        : jest.fn().mockResolvedValue(input.pruneResult),
    } as unknown as PhysicalStateShadowObservationRepository;
    const leaderGuard = {
      shouldRun: jest.fn().mockReturnValue(input.shouldRun),
    } as unknown as SchedulerLeaderGuardService;
    const scheduler = new PhysicalStateShadowObservationRetentionScheduler(
      observationRepository,
      leaderGuard,
    );
    return { scheduler, observationRepository, leaderGuard };
  }

  it('skips prune when not leader', async () => {
    const { scheduler, observationRepository } = createScheduler({
      shouldRun: false,
      pruneResult: 5,
    });
    await scheduler.pruneExpiredObservations();
    expect(observationRepository.pruneExpiredObservations).not.toHaveBeenCalled();
  });

  it('prunes expired observations on leader', async () => {
    const { scheduler, observationRepository } = createScheduler({
      shouldRun: true,
      pruneResult: 3,
    });
    await scheduler.pruneExpiredObservations();
    expect(observationRepository.pruneExpiredObservations).toHaveBeenCalled();
  });
});
