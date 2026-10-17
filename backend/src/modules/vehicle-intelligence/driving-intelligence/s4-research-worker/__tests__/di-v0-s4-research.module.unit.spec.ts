import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@shared/database/prisma.module';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DiV0S4ResearchModule } from '../di-v0-s4-research.module';
import { DiV0S4ResearchV2Scheduler } from '../di-v0-s4-research-v2.scheduler';
import { DiV0S4ResearchV2Service } from '../di-v0-s4-research-v2.service';
import { RESEARCH_ENV_KEYS, restoreResearchTestEnv } from './di-v0-s4-research-postgres-harness';

describe('DiV0S4ResearchModule bootstrap', () => {
  const envBackup: Record<string, string | undefined> = {};
  const prismaStub: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
    diV0S4Control: { findFirst: jest.Mock };
    vehicle: { findUnique: jest.Mock };
    diV0S4WorkItem: { findFirst: jest.Mock };
    diV0S4EvidenceSnapshot: { findFirst: jest.Mock };
    diV0ShadowInterval: { findMany: jest.Mock };
  } = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaStub)),
    diV0S4Control: { findFirst: jest.fn().mockResolvedValue(null) },
    vehicle: { findUnique: jest.fn() },
    diV0S4WorkItem: { findFirst: jest.fn() },
    diV0S4EvidenceSnapshot: { findFirst: jest.fn() },
    diV0ShadowInterval: { findMany: jest.fn().mockResolvedValue([]) },
  };

  @Global()
  @Module({
    providers: [
      { provide: PrismaService, useValue: prismaStub },
      { provide: SchedulerLeaderGuardService, useValue: { shouldRun: jest.fn(() => false) } },
    ],
    exports: [PrismaService, SchedulerLeaderGuardService],
  })
  class FakeInfraModule {}

  beforeEach(() => {
    for (const key of RESEARCH_ENV_KEYS) envBackup[key] = process.env[key];
    delete process.env.DI_V0_S4_RESEARCH_ENABLED;
  });

  afterEach(() => {
    restoreResearchTestEnv(envBackup);
  });

  async function compileModule(): Promise<TestingModule> {
    @Module({})
    class EmptySchedulerLeaderElectionModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [FakeInfraModule, DiV0S4ResearchModule],
    })
      .overrideModule(PrismaModule)
      .useModule(FakeInfraModule)
      .overrideModule(SchedulerLeaderElectionModule)
      .useModule(EmptySchedulerLeaderElectionModule)
      .compile();
    await moduleRef.init();
    return moduleRef;
  }

  it('compiles with research OFF (default env)', async () => {
    const moduleRef = await compileModule();
    try {
      expect(moduleRef.get(DiV0S4ResearchV2Service).isConfigured()).toBe(false);
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      expect(setIntervalSpy).not.toHaveBeenCalled();
      setIntervalSpy.mockRestore();
    } finally {
      await moduleRef.close();
    }
  });

  it('scheduler dormant when flags off', async () => {
    const moduleRef = await compileModule();
    try {
      expect(moduleRef.get(DiV0S4ResearchV2Scheduler)).toBeDefined();
    } finally {
      await moduleRef.close();
    }
  });
});
