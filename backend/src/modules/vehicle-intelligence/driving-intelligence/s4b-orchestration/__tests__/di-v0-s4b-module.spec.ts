import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DI_V0_S4_CONTROL_PLANE_ALL_OFF, DI_V0_S4_ENV_ALLOWLISTS, DI_V0_S4_ENV_FLAGS } from '../../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4ClaimLoop } from '../di-v0-s4b-claim-loop';
import { DiV0S4ClaimLoopScheduler } from '../di-v0-s4b-claim-loop.scheduler';
import { DiV0S4DiscoveryScheduler } from '../di-v0-s4b-discovery.scheduler';
import type { DiV0S4ExecutorRegistry } from '../di-v0-s4b-executor.port';
import { DiV0S4bOrchestrationModule } from '../di-v0-s4b-orchestration.module';
import { DI_V0_S4B_CLAIM_LOOP, DI_V0_S4B_CONTROL_PLANE_CONFIG, DI_V0_S4B_EXECUTOR_REGISTRY } from '../di-v0-s4b-tokens';

const S4_ENV_NAMES = [...Object.values(DI_V0_S4_ENV_FLAGS), ...Object.values(DI_V0_S4_ENV_ALLOWLISTS)];

describe('DI V0 S4B Nest module under default (unset) environment', () => {
  const saved: Record<string, string | undefined> = {};
  const prismaCall = jest.fn();
  const shouldRun = jest.fn(() => true);

  @Global()
  @Module({
    providers: [
      {
        provide: PrismaService,
        useValue: { $queryRaw: prismaCall, $executeRaw: prismaCall, $transaction: prismaCall, $queryRawUnsafe: prismaCall },
      },
      { provide: SchedulerLeaderGuardService, useValue: { shouldRun, runIfLeader: jest.fn() } },
    ],
    exports: [PrismaService, SchedulerLeaderGuardService],
  })
  class FakeInfraModule {}

  beforeAll(() => {
    for (const name of S4_ENV_NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterAll(() => {
    for (const name of S4_ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('D01b/C01b boots ALL_OFF: no timer, no DB call, no claim, ticks are no-ops', async () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const moduleRef = await Test.createTestingModule({ imports: [FakeInfraModule, DiV0S4bOrchestrationModule] }).compile();
    await moduleRef.init();
    try {
      expect(moduleRef.get(DI_V0_S4B_CONTROL_PLANE_CONFIG)).toEqual(DI_V0_S4_CONTROL_PLANE_ALL_OFF);
      expect(setIntervalSpy).not.toHaveBeenCalled();

      await expect(moduleRef.get(DiV0S4DiscoveryScheduler).tick()).resolves.toBeNull();
      expect(shouldRun).not.toHaveBeenCalled();
      await expect(moduleRef.get(DiV0S4ClaimLoopScheduler).tick()).resolves.toMatchObject({ status: 'WORKER_DISABLED' });
      await expect(moduleRef.get<DiV0S4ClaimLoop>(DI_V0_S4B_CLAIM_LOOP).runOnce()).resolves.toMatchObject({
        status: 'WORKER_DISABLED',
      });
      expect(moduleRef.get<DiV0S4ExecutorRegistry>(DI_V0_S4B_EXECUTOR_REGISTRY).readyExecutor()).toBeNull();
      expect(prismaCall).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
      setIntervalSpy.mockRestore();
    }
  });
});
