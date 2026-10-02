import { Module } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import { DiV0S4bOrchestrationModule } from '../s4b-orchestration/di-v0-s4b-orchestration.module';
import { DI_V0_S4B_CONTROL_PLANE_CONFIG } from '../s4b-orchestration/di-v0-s4b-tokens';
import { DiV0S4DriftWatcherScheduler } from './di-v0-s4e-drift-watcher.scheduler';
import { DiV0S4DriftWatcherService } from './di-v0-s4e-drift-watcher.service';
import { DiV0S4MaintenanceScheduler } from './di-v0-s4e-maintenance.scheduler';
import { DiV0S4MaintenanceService } from './di-v0-s4e-maintenance.service';
import { DI_V0_S4E_DRIFT_WATCHER_SERVICE, DI_V0_S4E_MAINTENANCE_SERVICE, DI_V0_S4E_WORK_ITEM_REPOSITORY } from './di-v0-s4e-tokens';

/** S4E drift/maintenance wiring — shares S4B control-plane snapshot via `DiV0S4RuntimeModule`. */
@Module({
  imports: [DiV0S4bOrchestrationModule],
  providers: [
    {
      provide: DI_V0_S4E_WORK_ITEM_REPOSITORY,
      useFactory: (prisma: PrismaService, config: DiV0S4ControlPlaneConfig) => new DiV0S4WorkItemRepository(prisma, config),
      inject: [PrismaService, DI_V0_S4B_CONTROL_PLANE_CONFIG],
    },
    {
      provide: DI_V0_S4E_DRIFT_WATCHER_SERVICE,
      useFactory: (prisma: PrismaService, repository: DiV0S4WorkItemRepository, config: DiV0S4ControlPlaneConfig) =>
        new DiV0S4DriftWatcherService(prisma, repository, config),
      inject: [PrismaService, DI_V0_S4E_WORK_ITEM_REPOSITORY, DI_V0_S4B_CONTROL_PLANE_CONFIG],
    },
    {
      provide: DI_V0_S4E_MAINTENANCE_SERVICE,
      useFactory: (prisma: PrismaService, repository: DiV0S4WorkItemRepository, config: DiV0S4ControlPlaneConfig) =>
        new DiV0S4MaintenanceService(prisma, repository, config),
      inject: [PrismaService, DI_V0_S4E_WORK_ITEM_REPOSITORY, DI_V0_S4B_CONTROL_PLANE_CONFIG],
    },
    DiV0S4DriftWatcherScheduler,
    DiV0S4MaintenanceScheduler,
  ],
})
export class DiV0S4eDriftWatcherModule {}
