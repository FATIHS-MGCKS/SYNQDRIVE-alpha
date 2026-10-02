import { Module, forwardRef } from '@nestjs/common';
import { DimoModule } from '@modules/dimo/dimo.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { DiV0S4bOrchestrationModule } from '../s4b-orchestration/di-v0-s4b-orchestration.module';
import { DiV0S4eDriftWatcherModule } from '../s4e-drift-watcher/di-v0-s4e-drift-watcher.module';
import { DiV0S4fObservabilityModule } from '../s4f-observability/di-v0-s4f.module';
import { DiV0S4cRuntimeBootstrap } from './di-v0-s4c-runtime.bootstrap';

/**
 * DI V0 S4 runtime composition (S4F-7A). Imported by VehicleIntelligenceModule.
 * Control-plane dormant when Production S4 env flags remain OFF and kill row is missing/KILLED.
 */
@Module({
  imports: [
    PrismaModule,
    SchedulerLeaderElectionModule,
    forwardRef(() => DimoModule),
    DiV0S4bOrchestrationModule,
    DiV0S4eDriftWatcherModule,
    DiV0S4fObservabilityModule,
  ],
  providers: [DiV0S4cRuntimeBootstrap],
  exports: [DiV0S4bOrchestrationModule, DiV0S4eDriftWatcherModule, DiV0S4fObservabilityModule],
})
export class DiV0S4RuntimeModule {}
