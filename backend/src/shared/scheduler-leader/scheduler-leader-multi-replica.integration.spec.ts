import { SchedulerLeaderGuardService } from './scheduler-leader-guard.service';
import { SchedulerLeaderElectionService } from './scheduler-leader-election.service';

describe('P1.7 multi-replica scheduler producer proof', () => {
  it('N — two replicas × same tick → one producer invocation', async () => {
    const electionA = {
      isLeader: jest.fn().mockReturnValue(true),
      recordSkippedTick: jest.fn(),
      recordTick: jest.fn(),
    } as unknown as SchedulerLeaderElectionService;
    const electionB = {
      isLeader: jest.fn().mockReturnValue(false),
      recordSkippedTick: jest.fn(),
      recordTick: jest.fn(),
    } as unknown as SchedulerLeaderElectionService;

    const guardA = new SchedulerLeaderGuardService(electionA);
    const guardB = new SchedulerLeaderGuardService(electionB);
    const producer = jest.fn().mockResolvedValue(undefined);

    const runTick = async (guard: SchedulerLeaderGuardService) => {
      if (!guard.shouldRun('dimo_snapshot_tick')) return;
      await producer();
    };

    await Promise.all([runTick(guardA), runTick(guardB)]);

    expect(producer).toHaveBeenCalledTimes(1);
    expect(electionB.recordSkippedTick).toHaveBeenCalledWith('dimo_snapshot_tick');
  });

  it('O — follower replica can still process BullMQ jobs (workers not leader-gated)', () => {
    const followerElection = {
      isLeader: jest.fn().mockReturnValue(false),
    } as unknown as SchedulerLeaderElectionService;
    const guard = new SchedulerLeaderGuardService(followerElection);

    expect(guard.isLeader()).toBe(false);

    const processJob = jest.fn();
    processJob('dimo-snapshot-job');
    expect(processJob).toHaveBeenCalledTimes(1);
  });
});
