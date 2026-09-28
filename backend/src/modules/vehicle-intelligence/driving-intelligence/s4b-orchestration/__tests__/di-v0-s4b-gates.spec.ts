import type { PrismaClient } from '@prisma/client';
import { DI_V0_S4_CONTROL_PLANE_ALL_OFF, parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4TransitionRejectedError } from '../../s4a-foundation/di-v0-s4a-errors';
import type { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { DI_V0_S4B_RELEASE_REASONS, DiV0S4ClaimLoop } from '../di-v0-s4b-claim-loop';
import { buildDiV0S4LeaseOwner, loadDiV0S4bControlPlaneConfig } from '../di-v0-s4b-config';
import { DiV0S4DiscoveryService } from '../di-v0-s4b-discovery.service';
import { DiV0S4ExecutorRegistry, type DiV0S4WorkItemExecutor } from '../di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../di-v0-s4b-pipeline-manifest';

const ON = {
  DI_V0_S4_MASTER_ENABLED: 'true',
  DI_V0_S4_DISCOVERY_ENABLED: 'true',
  DI_V0_S4_WORKER_ENABLED: 'true',
  DI_V0_S4_POSITION_ENABLED: 'true',
  DI_V0_S4_ORGANIZATION_ALLOWLIST: 'org-1',
  DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1',
};

function fakePrisma(): { prisma: PrismaClient; calls: jest.Mock } {
  const calls = jest.fn(async () => []);
  const prisma = new Proxy({}, { get: () => calls }) as unknown as PrismaClient;
  return { prisma, calls };
}

function fakeRepository(overrides: Partial<Record<keyof DiV0S4WorkItemRepository, jest.Mock>> = {}) {
  const repo = {
    createWorkItem: jest.fn(),
    claim: jest.fn(async () => ({ workItemId: 'wi-1', leaseEpoch: 1n, leaseOwner: 'owner', attemptCount: 1, transitionId: 'T02_CLAIM' })),
    heartbeat: jest.fn(async () => ({ leaseExpiresAt: new Date() })),
    failRetryable: jest.fn(async () => ({ nextAttemptAt: new Date() })),
    ...overrides,
  };
  return repo as unknown as DiV0S4WorkItemRepository & typeof repo;
}

function executor(overrides: Partial<DiV0S4WorkItemExecutor> = {}): DiV0S4WorkItemExecutor {
  return { executorId: 'FAKE_EXECUTOR', isReady: () => true, execute: async () => ({ kind: 'SETTLED' }), ...overrides };
}

function loop(env: Record<string, string>, repo: DiV0S4WorkItemRepository, registry = new DiV0S4ExecutorRegistry(), opts = {}) {
  const config = parseDiV0S4ControlPlaneConfig(env);
  return new DiV0S4ClaimLoop(repo, config, buildDiV0S4RuntimePipelineManifest(config), registry, { leaseOwner: 'owner', ...opts });
}

describe('DI V0 S4B discovery gates', () => {
  it('D01 ALL_OFF (empty env): pass is DISABLED and touches neither Prisma nor the repository', async () => {
    const { prisma, calls } = fakePrisma();
    const repo = fakeRepository();
    const config = loadDiV0S4bControlPlaneConfig({});
    expect(config).toEqual(DI_V0_S4_CONTROL_PLANE_ALL_OFF);
    const service = new DiV0S4DiscoveryService(prisma, repo, config, buildDiV0S4RuntimePipelineManifest(config));
    expect(service.isConfigured()).toBe(false);
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ status: 'DISABLED', candidates: 0, created: 0 });
    expect(calls).not.toHaveBeenCalled();
    expect(repo.createWorkItem).not.toHaveBeenCalled();
  });

  it.each([
    ['master off', { DI_V0_S4_MASTER_ENABLED: 'false' }],
    ['discovery off', { DI_V0_S4_DISCOVERY_ENABLED: '0' }],
    ['position off', { DI_V0_S4_POSITION_ENABLED: '' }],
    ['empty org allowlist', { DI_V0_S4_ORGANIZATION_ALLOWLIST: '' }],
    ['empty vehicle allowlist', { DI_V0_S4_VEHICLE_ALLOWLIST: '' }],
    ['malformed vehicle allowlist', { DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1,*' }],
  ])('D02 %s: DISABLED with zero DB access', async (_label, patch) => {
    const { prisma, calls } = fakePrisma();
    const repo = fakeRepository();
    const config = parseDiV0S4ControlPlaneConfig({ ...ON, ...patch });
    const service = new DiV0S4DiscoveryService(prisma, repo, config, buildDiV0S4RuntimePipelineManifest(config));
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ status: 'DISABLED' });
    expect(calls).not.toHaveBeenCalled();
  });
});

describe('DI V0 S4B claim loop gates', () => {
  it.each([
    ['ALL_OFF', {}],
    ['worker off', { ...ON, DI_V0_S4_WORKER_ENABLED: 'false' }],
    ['position off', { ...ON, DI_V0_S4_POSITION_ENABLED: 'false' }],
    ['empty allowlist', { ...ON, DI_V0_S4_ORGANIZATION_ALLOWLIST: '' }],
  ])('C01 %s: WORKER_DISABLED, claim never called even with a ready executor', async (_label, env) => {
    const repo = fakeRepository();
    const registry = new DiV0S4ExecutorRegistry();
    registry.register(executor());
    await expect(loop(env, repo, registry).runOnce()).resolves.toMatchObject({ status: 'WORKER_DISABLED' });
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it('C03 no executor, not-ready executor or throwing readiness probe: EXECUTOR_NOT_READY, no claim', async () => {
    const repo = fakeRepository();
    await expect(loop(ON, repo).runOnce()).resolves.toMatchObject({ status: 'EXECUTOR_NOT_READY' });
    const notReady = new DiV0S4ExecutorRegistry();
    notReady.register(executor({ isReady: () => false }));
    await expect(loop(ON, repo, notReady).runOnce()).resolves.toMatchObject({ status: 'EXECUTOR_NOT_READY' });
    const throwing = new DiV0S4ExecutorRegistry();
    throwing.register(
      executor({
        isReady: () => {
          throw new Error('probe');
        },
      }),
    );
    await expect(loop(ON, repo, throwing).runOnce()).resolves.toMatchObject({ status: 'EXECUTOR_NOT_READY' });
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it('C03b the registry accepts one executor with a bounded id', () => {
    const registry = new DiV0S4ExecutorRegistry();
    expect(() => registry.register(executor({ executorId: 'bad id' }))).toThrow(/executorId/);
    registry.register(executor());
    expect(() => registry.register(executor())).toThrow(/already registered/);
  });

  it('C16a stop() aborts the in-flight attempt and relinquishes via T07 SHUTDOWN_RELINQUISH; a concurrent runOnce is BUSY', async () => {
    const repo = fakeRepository();
    const registry = new DiV0S4ExecutorRegistry();
    let signal: AbortSignal | null = null;
    registry.register(
      executor({
        execute: ({ signal: s }) => {
          signal = s;
          return new Promise(() => undefined);
        },
      }),
    );
    const claimLoop = loop(ON, repo, registry, { workBudgetMs: 60_000 });
    const running = claimLoop.runOnce();
    await new Promise((resolve) => setImmediate(resolve));
    await expect(claimLoop.runOnce()).resolves.toMatchObject({ status: 'BUSY' });
    claimLoop.stop();
    await expect(running).resolves.toMatchObject({ status: 'RELEASED', releaseReason: 'SHUTDOWN_RELINQUISH' });
    expect(signal!.aborted).toBe(true);
    expect(repo.failRetryable).toHaveBeenCalledWith(expect.objectContaining({ workItemId: 'wi-1' }), 'SHUTDOWN_RELINQUISH');
    expect(repo.claim).toHaveBeenCalledTimes(1);
  });

  it('C16b timers outside the contract range are refused; release reasons are bounded', () => {
    const repo = fakeRepository();
    expect(() => loop(ON, repo, undefined, { workBudgetMs: 240_001 })).toThrow(/workBudgetMs/);
    expect(() => loop(ON, repo, undefined, { heartbeatIntervalMs: 60_001 })).toThrow(/heartbeatIntervalMs/);
    expect(() => loop(ON, repo, undefined, { workBudgetMs: 0 })).toThrow(/workBudgetMs/);
    for (const reason of DI_V0_S4B_RELEASE_REASONS) expect(reason).toMatch(/^[A-Z0-9_]{1,128}$/);
  });

  it('C16c a claim refusal other than NO_CLAIMABLE is reported, never retried in-attempt', async () => {
    const repo = fakeRepository({
      claim: jest.fn(async () => {
        throw new DiV0S4TransitionRejectedError('T02_CLAIM', 'DB_KILL_ACTIVE');
      }),
    });
    const registry = new DiV0S4ExecutorRegistry();
    registry.register(executor());
    await expect(loop(ON, repo, registry).runOnce()).resolves.toMatchObject({ status: 'CLAIM_REFUSED', refusalCode: 'DB_KILL_ACTIVE' });
    expect(repo.claim).toHaveBeenCalledTimes(1);
    expect(repo.failRetryable).not.toHaveBeenCalled();
  });

  it('C16d lease owner matches the repository pattern', () => {
    expect(buildDiV0S4LeaseOwner('host.example:1 x', 42)).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(buildDiV0S4LeaseOwner('a'.repeat(300), 1).length).toBeLessThanOrEqual(128);
  });
});
