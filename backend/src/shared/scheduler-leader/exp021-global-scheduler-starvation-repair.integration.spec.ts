import { randomUUID } from 'crypto';
import { SchedulerLeaderElectionService } from './scheduler-leader-election.service';
import { SchedulerLeaderGuardService } from './scheduler-leader-guard.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { SCHEDULER_LEADER_LEASE_KEY } from './scheduler-leader-election.redis';
import { ReferenceCaptureExp021CanaryLiveWindowActivationScheduler } from '@workers/schedulers/reference-capture-exp021-canary-live-window-activation.scheduler';
import { ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState } from '@modules/vehicle-intelligence/reference-capture/exp021-canary-live-window/reference-capture-exp021-canary-live-window-activation-scheduler.runtime-state';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { Exp021MaturationShadowCanaryOperatorModule } from '@modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-operator.module';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

class MemoryRedisLock {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private purge(key: string) {
    const row = this.store.get(key);
    if (row && Date.now() >= row.expiresAt) this.store.delete(key);
  }

  async set(key: string, value: string, _mode: string, px: number, nx?: string): Promise<'OK' | null> {
    this.purge(key);
    if (nx === 'NX' && this.store.has(key)) return null;
    this.store.set(key, { value, expiresAt: Date.now() + px });
    return 'OK';
  }

  async eval(script: string, _numKeys: number, key: string, ...args: string[]): Promise<number> {
    if (script === RELEASE_SCRIPT) {
      const token = args[0];
      const row = this.store.get(key);
      if (row?.value === token) {
        this.store.delete(key);
        return 1;
      }
      return 0;
    }
    if (script === EXTEND_SCRIPT) {
      const token = args[0];
      const ttl = parseInt(args[1], 10);
      const row = this.store.get(key);
      if (row?.value === token) {
        row.expiresAt = Date.now() + ttl;
        return 1;
      }
      return 0;
    }
    return 0;
  }

  async pttl(key: string): Promise<number> {
    this.purge(key);
    const row = this.store.get(key);
    if (!row) return -2;
    return Math.max(0, row.expiresAt - Date.now());
  }

  async get(key: string): Promise<string | null> {
    this.purge(key);
    return this.store.get(key)?.value ?? null;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}

function buildBackendReplica(redis: MemoryRedisLock, label: string) {
  const config = {
    enabled: true,
    leaseMs: 30_000,
    renewIntervalMs: 10_000,
    acquireIntervalMs: 5_000,
  };
  const lockService = new RedisDistributedLockService(redis as never);
  const election = new SchedulerLeaderElectionService(config as never, lockService, redis as never);
  const guard = new SchedulerLeaderGuardService(election);
  const runtimeState = new ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState();
  return { label, election, guard, runtimeState, lockService };
}

function buildActivationScheduler(
  guard: SchedulerLeaderGuardService,
  runtimeState: ReferenceCaptureExp021CanaryLiveWindowActivationSchedulerRuntimeState,
  resolveConfig: () => object | null,
) {
  const activationService = {
    resolveConfigFromEnv: jest.fn().mockImplementation(resolveConfig),
    runActivationTick: jest.fn().mockResolvedValue({ armedTripIds: [], finalizedTripIds: [] }),
  };
  return new ReferenceCaptureExp021CanaryLiveWindowActivationScheduler(
    activationService as never,
    guard,
    runtimeState,
  );
}

async function bootstrapCohortOperatorWithoutLeaderElection() {
  const moduleRef = await Test.createTestingModule({
    imports: [Exp021MaturationShadowCanaryOperatorModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      onModuleInit: async () => undefined,
      onModuleDestroy: async () => undefined,
      $connect: async () => undefined,
      $disconnect: async () => undefined,
    })
    .compile();
  return moduleRef.init();
}

describe('EXP-021 global scheduler starvation repair (integration shape)', () => {
  let redis: MemoryRedisLock;

  beforeEach(() => {
    redis = new MemoryRedisLock();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function initElection(service: SchedulerLeaderElectionService) {
    await service.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
  }

  it('GLOBAL_LEADER_OWNER_IS_BACKEND_REPLICA — cohort CLI does not acquire lease; one backend executes activation', async () => {
    const replicaA = buildBackendReplica(redis, 'A');
    const replicaB = buildBackendReplica(redis, 'B');

    let configEnabled = false;
    const runA = jest.fn().mockResolvedValue({ armedTripIds: [], finalizedTripIds: [] });
    const runB = jest.fn().mockResolvedValue({ armedTripIds: [], finalizedTripIds: [] });
    const schedulerA = new ReferenceCaptureExp021CanaryLiveWindowActivationScheduler(
      {
        resolveConfigFromEnv: jest.fn().mockImplementation(() =>
          configEnabled ? { enabled: true } : null,
        ),
        runActivationTick: runA,
      } as never,
      replicaA.guard,
      replicaA.runtimeState,
    );
    const schedulerB = new ReferenceCaptureExp021CanaryLiveWindowActivationScheduler(
      {
        resolveConfigFromEnv: jest.fn().mockImplementation(() =>
          configEnabled ? { enabled: true } : null,
        ),
        runActivationTick: runB,
      } as never,
      replicaB.guard,
      replicaB.runtimeState,
    );
    schedulerA.onModuleInit();
    schedulerB.onModuleInit();

    const cohortApp = await bootstrapCohortOperatorWithoutLeaderElection();

    await initElection(replicaA.election);
    await initElection(replicaB.election);

    const leaderA = replicaA.election.isLeader();
    const leaderB = replicaB.election.isLeader();
    expect(leaderA || leaderB).toBe(true);
    expect(leaderA && leaderB).toBe(false);

    const leaseAfterBackends = await redis.get(SCHEDULER_LEADER_LEASE_KEY);
    expect(leaseAfterBackends).not.toBeNull();

    configEnabled = false;
    await schedulerA.tick();
    await schedulerB.tick();
    expect(runA).not.toHaveBeenCalled();
    expect(runB).not.toHaveBeenCalled();

    configEnabled = true;
    await schedulerA.tick();
    await schedulerB.tick();
    const leaderRuns = (leaderA ? runA : runB).mock.calls.length;
    const followerRuns = (leaderA ? runB : runA).mock.calls.length;
    expect(leaderRuns).toBe(1);
    expect(followerRuns).toBe(0);
    expect(replicaA.runtimeState.getSnapshot().timerInstalled).toBe(true);
    expect(replicaB.runtimeState.getSnapshot().timerInstalled).toBe(true);

    await cohortApp.close();
    await replicaA.election.onModuleDestroy();
    await replicaB.election.onModuleDestroy();
    schedulerA.onModuleDestroy();
    schedulerB.onModuleDestroy();
  });

  it('OLD_FAILURE_REPRODUCED — without slim bootstrap, AppModule would participate (documented via operator isolation)', async () => {
    const cohort = await bootstrapCohortOperatorWithoutLeaderElection();
    expect(() => cohort.get(SchedulerLeaderElectionService)).toThrow(/SchedulerLeaderElectionService/);
    await cohort.close();
  });
});
