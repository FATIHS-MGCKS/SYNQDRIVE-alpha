import { ReferenceCaptureSettlementShadowRunnerService } from './reference-capture-settlement-shadow-runner.service';

describe('ReferenceCaptureSettlementShadowRunnerService enqueue race', () => {
  it('ABORT_ENQUEUE_RACE_LEAVES_NO_INVALID_JOB when eligibility lost after queue.add', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn(),
    };
    const repository = {
      linkBullJobIdIfEligible: jest.fn().mockResolvedValue(true),
      isScheduleEligibleForExecution: jest.fn().mockResolvedValue(false),
      clearBullJobId: jest.fn().mockResolvedValue({ count: 1 }),
      resetExecutingToPending: jest.fn(),
    };
    const runner = new ReferenceCaptureSettlementShadowRunnerService(queue as never, repository as never);
    runner.removeJobIfQueued = jest.fn().mockResolvedValue(true);

    const jobId = await runner.enqueueSchedule({
      id: 'sched-1',
      experimentId: 'exp-1',
      sessionId: 'sess-1',
      organizationId: 'org-1',
      scheduledAt: new Date(Date.now() + 60_000),
    });

    expect(jobId).toBeNull();
    expect(queue.add).toHaveBeenCalled();
    expect(runner.removeJobIfQueued).toHaveBeenCalled();
    expect(repository.clearBullJobId).toHaveBeenCalledWith('sched-1');
  });
});
