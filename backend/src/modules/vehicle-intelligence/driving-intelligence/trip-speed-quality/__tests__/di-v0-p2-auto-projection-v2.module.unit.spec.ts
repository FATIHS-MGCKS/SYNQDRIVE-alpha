import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@shared/database/prisma.module';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { DiV0P2AutoProjectionV2Scheduler } from '../di-v0-p2-auto-projection-v2.scheduler';
import { DiV0P2AutoProjectionV2Service } from '../di-v0-p2-auto-projection-v2.service';
import { DiV0TripSpeedQualityModule } from '../di-v0-trip-speed-quality.module';
import { DI_V0_P2_AUTO_PROJECTION_V2_BOOTSTRAP } from '../di-v0-p2-auto-projection-v2.tokens';

describe('DiV0TripSpeedQualityModule bootstrap', () => {
  const envBackup: Record<string, string | undefined> = {};
  const prismaStub: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  } = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prismaStub.$transaction.mockImplementation((fn: (tx: typeof prismaStub) => unknown) => fn(prismaStub));

  @Global()
  @Module({
    providers: [
      { provide: PrismaService, useValue: prismaStub },
      { provide: SchedulerLeaderGuardService, useValue: { shouldRun: jest.fn(() => false), runIfLeader: jest.fn() } },
    ],
    exports: [PrismaService, SchedulerLeaderGuardService],
  })
  class FakeInfraModule {}

  beforeEach(() => {
    for (const key of ['DI_V0_P2_AUTO_PROJECTION_V2_ENABLED', 'DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE']) {
      envBackup[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function compileModule(): Promise<TestingModule> {
    @Module({})
    class EmptySchedulerLeaderElectionModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [FakeInfraModule, DiV0TripSpeedQualityModule],
    })
      .overrideModule(PrismaModule)
      .useModule(FakeInfraModule)
      .overrideModule(SchedulerLeaderElectionModule)
      .useModule(EmptySchedulerLeaderElectionModule)
      .compile();
    await moduleRef.init();
    return moduleRef;
  }

  it('compiles with auto projection OFF (default env)', async () => {
    delete process.env.DI_V0_P2_AUTO_PROJECTION_V2_ENABLED;
    delete process.env.DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE;
    const moduleRef = await compileModule();
    try {
      expect(moduleRef.get(DiV0P2AutoProjectionV2Service).isConfigured()).toBe(false);
      expect(moduleRef.get(DI_V0_P2_AUTO_PROJECTION_V2_BOOTSTRAP).disabledReason).toBeNull();
    } finally {
      await moduleRef.close();
    }
  });

  it('compiles when auto projection env is invalid (feature disabled, Nest OK)', async () => {
    process.env.DI_V0_P2_AUTO_PROJECTION_V2_ENABLED = 'true';
    delete process.env.DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE;
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const moduleRef = await compileModule();
    try {
      const bootstrap = moduleRef.get(DI_V0_P2_AUTO_PROJECTION_V2_BOOTSTRAP);
      expect(bootstrap.disabledReason).toMatch(/ENABLED_SINCE/);
      expect(moduleRef.get(DiV0P2AutoProjectionV2Service).isConfigured()).toBe(false);
      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(moduleRef.get(DiV0P2AutoProjectionV2Scheduler)).toBeDefined();
    } finally {
      setIntervalSpy.mockRestore();
      await moduleRef.close();
    }
  });
});
