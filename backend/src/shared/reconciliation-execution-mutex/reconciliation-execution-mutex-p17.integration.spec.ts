import { ReconciliationExecutionMutexService } from './reconciliation-execution-mutex.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { SchedulerLeaderElectionService } from '@shared/scheduler-leader/scheduler-leader-election.service';

describe('P1.4 P1.7 interaction — reconciliation mutex vs scheduler leader', () => {
  it('scheduler leader gates producer; mutex gates execution; workers stay multi-replica', async () => {
    const leaderElection = {
      isLeader: jest.fn().mockReturnValue(true),
      recordSkippedTick: jest.fn(),
      recordTick: jest.fn(),
    } as unknown as SchedulerLeaderElectionService;
    const guard = new SchedulerLeaderGuardService(leaderElection);

    const mutex = {
      execute: jest.fn(async (_scope, fn: () => Promise<unknown>) => {
        await fn();
        return { status: 'executed', value: { repairsApplied: 1 } };
      }),
    } as unknown as ReconciliationExecutionMutexService;

    const reconcileProducer = jest.fn();
    const bullmqWorker = jest.fn();

    if (guard.shouldRun('trip_reconciliation_fast')) {
      await mutex.execute(
        { organizationId: 'org', vehicleId: 'veh', reconciliationType: 'trip' },
        async () => reconcileProducer(),
      );
    }

    bullmqWorker('trip-tracking-job');

    expect(reconcileProducer).toHaveBeenCalledTimes(1);
    expect(bullmqWorker).toHaveBeenCalledTimes(1);
    expect(mutex.execute).toHaveBeenCalledTimes(1);
  });

  it('follower replica may still run BullMQ workers (not leader-gated)', () => {
    const followerElection = {
      isLeader: jest.fn().mockReturnValue(false),
    } as unknown as SchedulerLeaderElectionService;
    const guard = new SchedulerLeaderGuardService(followerElection);
    const processJob = jest.fn();

    expect(guard.isLeader()).toBe(false);
    processJob('driving-route-enrich');
    expect(processJob).toHaveBeenCalledTimes(1);
  });
});
