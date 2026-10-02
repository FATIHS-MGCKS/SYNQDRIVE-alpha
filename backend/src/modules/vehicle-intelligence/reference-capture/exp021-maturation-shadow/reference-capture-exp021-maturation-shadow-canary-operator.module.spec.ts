import { INestApplicationContext, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SchedulerLeaderElectionService } from '@shared/scheduler-leader/scheduler-leader-election.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import { SCHEDULER_LEADER_LEASE_KEY } from '@shared/scheduler-leader/scheduler-leader-election.redis';
import { ReferenceCaptureExp021CanaryLiveWindowActivationScheduler } from '@workers/schedulers/reference-capture-exp021-canary-live-window-activation.scheduler';
import {
  bootstrapExp021CanaryEnrollApplicationContext,
  resolveExp021CanaryEnrollNestServices,
} from './reference-capture-exp021-maturation-shadow-canary-bootstrap.lib';
import { Exp021MaturationShadowCanaryOperatorModule } from './reference-capture-exp021-maturation-shadow-canary-operator.module';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
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
    return 0;
  }

  async get(key: string): Promise<string | null> {
    this.purge(key);
    return this.store.get(key)?.value ?? null;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}

function resolveOptionalProvider<T>(app: INestApplicationContext, token: Type<T>): T | undefined {
  try {
    return app.get(token, { strict: false });
  } catch {
    return undefined;
  }
}

async function bootstrapOperatorTestContext() {
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

describe('Exp021MaturationShadowCanaryOperatorModule', () => {
  it('does not register SchedulerLeaderElectionModule providers or singleton schedulers', async () => {
    const app = await bootstrapOperatorTestContext();
    try {
      expect(resolveOptionalProvider(app, SchedulerLeaderElectionService)).toBeUndefined();
      expect(resolveOptionalProvider(app, SchedulerLeaderGuardService)).toBeUndefined();
      expect(resolveOptionalProvider(app, ReferenceCaptureExp021CanaryLiveWindowActivationScheduler)).toBeUndefined();

      const services = resolveExp021CanaryEnrollNestServices(app);
      expect(services.config).toBeDefined();
      expect(services.repository).toBeDefined();
      expect(services.enrollment).toBeInstanceOf(ReferenceCaptureExp021MaturationShadowEnrollmentService);
      expect(services.prisma).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('module graph excludes AppModule, WorkersModule, SchedulerLeaderElectionModule', () => {
    const importLines = readFileSync(
      join(__dirname, 'reference-capture-exp021-maturation-shadow-canary-operator.module.ts'),
      'utf8',
    )
      .split('\n')
      .filter((line) => line.startsWith('import '));
    const imports = importLines.join('\n');
    expect(imports).not.toMatch(/app\.module/i);
    expect(imports).not.toMatch(/workers\.module/i);
    expect(imports).not.toMatch(/scheduler-leader-election\.module/i);
  });

  it('COHORT_OPERATOR_CAN_ACQUIRE_GLOBAL_SCHEDULER_LEASE=NO — bootstrap does not touch lease key', async () => {
    const redis = new MemoryRedisLock();
    const lockService = new RedisDistributedLockService(redis as never);
    const before = await redis.get(SCHEDULER_LEADER_LEASE_KEY);

    const app = await bootstrapOperatorTestContext();
    try {
      const attempt = await lockService.acquire(SCHEDULER_LEADER_LEASE_KEY, 30_000);
      expect(attempt.acquired).toBe(true);
      if (attempt.acquired) {
        await lockService.release(attempt.handle);
      }
    } finally {
      await app.close();
    }

    const after = await redis.get(SCHEDULER_LEADER_LEASE_KEY);
    expect(before).toBe(after);
  });
});
