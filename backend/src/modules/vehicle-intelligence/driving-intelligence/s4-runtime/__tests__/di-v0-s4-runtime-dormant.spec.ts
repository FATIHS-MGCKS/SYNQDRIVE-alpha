import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoModule } from '@modules/dimo/dimo.module';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { DI_V0_S4_CONTROL_PLANE_ALL_OFF, DI_V0_S4_ENV_ALLOWLISTS, DI_V0_S4_ENV_FLAGS } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4ClaimLoopScheduler } from '../../s4b-orchestration/di-v0-s4b-claim-loop.scheduler';
import { DiV0S4DiscoveryScheduler } from '../../s4b-orchestration/di-v0-s4b-discovery.scheduler';
import { DI_V0_S4C_EXECUTOR_ID } from '../../s4c-executor/di-v0-s4c-executor';
import { DiV0S4DriftWatcherScheduler } from '../../s4e-drift-watcher/di-v0-s4e-drift-watcher.scheduler';
import { DiV0S4MaintenanceScheduler } from '../../s4e-drift-watcher/di-v0-s4e-maintenance.scheduler';
import { DI_V0_S4B_CONTROL_PLANE_CONFIG, DI_V0_S4B_EXECUTOR_REGISTRY } from '../../s4b-orchestration/di-v0-s4b-tokens';
import { DiV0S4RuntimeModule } from '../di-v0-s4-runtime.module';

const S4_ENV_NAMES = [...Object.values(DI_V0_S4_ENV_FLAGS), ...Object.values(DI_V0_S4_ENV_ALLOWLISTS), 'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE'];

@Module({
  providers: [
    { provide: DimoAuthService, useValue: { getVehicleJwt: jest.fn() } },
    { provide: DimoTelemetryService, useValue: { queryGraphQL: jest.fn() } },
  ],
  exports: [DimoAuthService, DimoTelemetryService],
})
class FakeDimoModule {}

describe('DiV0S4RuntimeModule ALL_OFF dormancy', () => {
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

  it('registers S4C executor once; ALL_OFF creates no schedulers and no Prisma/DIMO calls', async () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    @Module({})
    class EmptySchedulerLeaderElectionModule {}

    const moduleRef = await Test.createTestingModule({ imports: [FakeInfraModule, DiV0S4RuntimeModule] })
      .overrideModule(PrismaModule)
      .useModule(FakeInfraModule)
      .overrideModule(SchedulerLeaderElectionModule)
      .useModule(EmptySchedulerLeaderElectionModule)
      .overrideModule(DimoModule)
      .useModule(FakeDimoModule)
      .compile();
    await moduleRef.init();
    try {
      expect(moduleRef.get(DI_V0_S4B_CONTROL_PLANE_CONFIG)).toEqual(DI_V0_S4_CONTROL_PLANE_ALL_OFF);
      const registry = moduleRef.get(DI_V0_S4B_EXECUTOR_REGISTRY);
      expect(registry.readyExecutor()?.executorId).toBe(DI_V0_S4C_EXECUTOR_ID);
      expect(() => registry.register(registry.readyExecutor()!)).toThrow(/already registered/);
      expect(setIntervalSpy).not.toHaveBeenCalled();
      await expect(moduleRef.get(DiV0S4DiscoveryScheduler).tick()).resolves.toBeNull();
      await expect(moduleRef.get(DiV0S4ClaimLoopScheduler).tick()).resolves.toMatchObject({ status: 'WORKER_DISABLED' });
      await expect(moduleRef.get(DiV0S4DriftWatcherScheduler).tick()).resolves.toBeNull();
      await expect(moduleRef.get(DiV0S4MaintenanceScheduler).tick()).resolves.toBeNull();
      expect(prismaCall).not.toHaveBeenCalled();
      expect(moduleRef.get(DimoAuthService).getVehicleJwt).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
      setIntervalSpy.mockRestore();
    }
  });
});
