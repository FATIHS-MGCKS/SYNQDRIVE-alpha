import { Module } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import { loadDiV0S4eControlPlaneConfig } from './di-v0-s4e-config';
import { DiV0S4DriftWatcherScheduler } from './di-v0-s4e-drift-watcher.scheduler';
import { DiV0S4DriftWatcherService } from './di-v0-s4e-drift-watcher.service';
import {
  DI_V0_S4E_CONTROL_PLANE_CONFIG,
  DI_V0_S4E_DRIFT_WATCHER_SERVICE,
  DI_V0_S4E_WORK_ITEM_REPOSITORY,
} from './di-v0-s4e-tokens';

/**
 * S4E drift watcher wiring. DEFINED_NOT_REGISTERED: no application module imports this
 * (S4E dormant audit spec). Registration is a separate activation step.
 */
@Module({
  providers: [
    { provide: DI_V0_S4E_CONTROL_PLANE_CONFIG, useFactory: () => loadDiV0S4eControlPlaneConfig() },
    {
      provide: DI_V0_S4E_WORK_ITEM_REPOSITORY,
      useFactory: (prisma: PrismaService, config: DiV0S4ControlPlaneConfig) => new DiV0S4WorkItemRepository(prisma, config),
      inject: [PrismaService, DI_V0_S4E_CONTROL_PLANE_CONFIG],
    },
    {
      provide: DI_V0_S4E_DRIFT_WATCHER_SERVICE,
      useFactory: (prisma: PrismaService, repository: DiV0S4WorkItemRepository, config: DiV0S4ControlPlaneConfig) =>
        new DiV0S4DriftWatcherService(prisma, repository, config),
      inject: [PrismaService, DI_V0_S4E_WORK_ITEM_REPOSITORY, DI_V0_S4E_CONTROL_PLANE_CONFIG],
    },
    DiV0S4DriftWatcherScheduler,
  ],
})
export class DiV0S4eDriftWatcherModule {}
