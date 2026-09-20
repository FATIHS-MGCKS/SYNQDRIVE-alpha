import { ReferenceCaptureExp021CanaryLiveWindowActivationScheduler } from './reference-capture-exp021-canary-live-window-activation.scheduler';
import { ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState } from '@modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation-scheduler.runtime-state';
import { SchedulerLeaderElectionService } from '@shared/scheduler-leader/scheduler-leader-election.service';

describe('ReferenceCaptureExp021CanaryLiveWindowActivationScheduler', () => {
  const runtimeState = new ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState();

  function buildScheduler(input: {
    configAtTick: ReturnType<
      ReferenceCaptureExp021CanaryLiveWindowActivationScheduler['tick']
    > extends Promise<void>
      ? object | null
      : never;
    isLeader: boolean;
    runThrows?: boolean;
  }) {
    const activationService = {
      resolveConfigFromEnv: jest.fn().mockReturnValue(input.configAtTick),
      runActivationTick: input.runThrows
        ? jest.fn().mockRejectedValue(new Error('tick failed'))
        : jest.fn().mockResolvedValue(undefined),
    };
    const leaderGuard = {
      shouldRun: jest.fn().mockReturnValue(input.isLeader),
    };
    const leaderElection = {
      recordTick: jest.fn(),
      recordSkippedTick: jest.fn(),
    } as unknown as SchedulerLeaderElectionService;

    const scheduler = new ReferenceCaptureExp021CanaryLiveWindowActivationScheduler(
      activationService as never,
      leaderGuard as never,
      runtimeState,
    );
    return { scheduler, activationService, leaderGuard, leaderElection };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('installs timer even when activation config is inactive at module init', () => {
    const activationService = {
      resolveConfigFromEnv: jest.fn().mockReturnValue(null),
      runActivationTick: jest.fn(),
    };
    const scheduler = new ReferenceCaptureExp021CanaryLiveWindowActivationScheduler(
      activationService as never,
      { shouldRun: jest.fn() } as never,
      runtimeState,
    );
    scheduler.onModuleInit();
    expect(runtimeState.getSnapshot().timerInstalled).toBe(true);
    scheduler.onModuleDestroy();
  });

  it('ACTIVATION_FALSE_AT_BOOT — callback runs but does not execute tick', async () => {
    const { scheduler, activationService } = buildScheduler({
      configAtTick: null,
      isLeader: true,
    });
    await scheduler.tick();
    expect(activationService.runActivationTick).not.toHaveBeenCalled();
    expect(runtimeState.getSnapshot().lastCallbackAt).not.toBeNull();
    expect(runtimeState.getSnapshot().lastExecutedTickAt).toBeNull();
  });

  it('ACTIVATION_FALSE_TO_TRUE — later callback executes when config becomes valid', async () => {
    const activationService = {
      resolveConfigFromEnv: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ enabled: true, cohort: { members: [] } }),
      runActivationTick: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new ReferenceCaptureExp021CanaryLiveWindowActivationScheduler(
      activationService as never,
      { shouldRun: jest.fn().mockReturnValue(true) } as never,
      runtimeState,
    );
    await scheduler.tick();
    await scheduler.tick();
    expect(activationService.runActivationTick).toHaveBeenCalledTimes(1);
  });

  it('skips execution when not leader but still records callback', async () => {
    const { scheduler, activationService } = buildScheduler({
      configAtTick: { enabled: true },
      isLeader: false,
    });
    await scheduler.tick();
    expect(activationService.runActivationTick).not.toHaveBeenCalled();
    expect(runtimeState.getSnapshot().lastSkippedNotLeaderAt).not.toBeNull();
  });

  it('records error state when runActivationTick throws', async () => {
    const { scheduler } = buildScheduler({
      configAtTick: { enabled: true },
      isLeader: true,
      runThrows: true,
    });
    await expect(scheduler.tick()).rejects.toThrow('tick failed');
    expect(runtimeState.getSnapshot().lastErrorAt).not.toBeNull();
  });
});
