import { Module } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import { DiV0S4ClaimLoop } from './di-v0-s4b-claim-loop';
import { DiV0S4ClaimLoopScheduler } from './di-v0-s4b-claim-loop.scheduler';
import {
  buildDiV0S4LeaseOwner,
  loadDiV0S4bControlPlaneConfig,
  loadDiV0S4bDiscoveryContainmentAtCompositionBoundary,
} from './di-v0-s4b-config';
import type { DiV0S4DiscoveryContainmentState } from './di-v0-s4b-discovery-containment';
import { DiV0S4DiscoveryScheduler } from './di-v0-s4b-discovery.scheduler';
import { DiV0S4DiscoveryService } from './di-v0-s4b-discovery.service';
import { DiV0S4ExecutorRegistry } from './di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest, type DiV0S4RuntimePipeline } from './di-v0-s4b-pipeline-manifest';
import {
  DI_V0_S4B_CLAIM_LOOP,
  DI_V0_S4B_CONTROL_PLANE_CONFIG,
  DI_V0_S4B_DISCOVERY_CONTAINMENT,
  DI_V0_S4B_DISCOVERY_SERVICE,
  DI_V0_S4B_EXECUTOR_REGISTRY,
  DI_V0_S4B_RUNTIME_PIPELINE,
  DI_V0_S4B_WORK_ITEM_REPOSITORY,
} from './di-v0-s4b-tokens';

/**
 * S4B orchestration wiring. Composed by `DiV0S4RuntimeModule` (VehicleIntelligenceModule).
 * Remains control-plane dormant when all S4 env flags are OFF and containment is unset.
 */
@Module({
  providers: [
    { provide: DI_V0_S4B_CONTROL_PLANE_CONFIG, useFactory: () => loadDiV0S4bControlPlaneConfig() },
    { provide: DI_V0_S4B_DISCOVERY_CONTAINMENT, useFactory: () => loadDiV0S4bDiscoveryContainmentAtCompositionBoundary() },
    {
      provide: DI_V0_S4B_RUNTIME_PIPELINE,
      useFactory: (config: DiV0S4ControlPlaneConfig) => buildDiV0S4RuntimePipelineManifest(config),
      inject: [DI_V0_S4B_CONTROL_PLANE_CONFIG],
    },
    {
      provide: DI_V0_S4B_WORK_ITEM_REPOSITORY,
      useFactory: (prisma: PrismaService, config: DiV0S4ControlPlaneConfig) => new DiV0S4WorkItemRepository(prisma, config),
      inject: [PrismaService, DI_V0_S4B_CONTROL_PLANE_CONFIG],
    },
    { provide: DI_V0_S4B_EXECUTOR_REGISTRY, useFactory: () => new DiV0S4ExecutorRegistry() },
    {
      provide: DI_V0_S4B_DISCOVERY_SERVICE,
      useFactory: (
        prisma: PrismaService,
        repository: DiV0S4WorkItemRepository,
        config: DiV0S4ControlPlaneConfig,
        pipeline: DiV0S4RuntimePipeline,
        containment: DiV0S4DiscoveryContainmentState,
      ) => new DiV0S4DiscoveryService(prisma, repository, config, pipeline, containment),
      inject: [
        PrismaService,
        DI_V0_S4B_WORK_ITEM_REPOSITORY,
        DI_V0_S4B_CONTROL_PLANE_CONFIG,
        DI_V0_S4B_RUNTIME_PIPELINE,
        DI_V0_S4B_DISCOVERY_CONTAINMENT,
      ],
    },
    {
      provide: DI_V0_S4B_CLAIM_LOOP,
      useFactory: (
        repository: DiV0S4WorkItemRepository,
        config: DiV0S4ControlPlaneConfig,
        pipeline: DiV0S4RuntimePipeline,
        executors: DiV0S4ExecutorRegistry,
      ) => new DiV0S4ClaimLoop(repository, config, pipeline, executors, { leaseOwner: buildDiV0S4LeaseOwner() }),
      inject: [DI_V0_S4B_WORK_ITEM_REPOSITORY, DI_V0_S4B_CONTROL_PLANE_CONFIG, DI_V0_S4B_RUNTIME_PIPELINE, DI_V0_S4B_EXECUTOR_REGISTRY],
    },
    DiV0S4DiscoveryScheduler,
    DiV0S4ClaimLoopScheduler,
  ],
  exports: [
    DI_V0_S4B_CONTROL_PLANE_CONFIG,
    DI_V0_S4B_DISCOVERY_CONTAINMENT,
    DI_V0_S4B_EXECUTOR_REGISTRY,
    DI_V0_S4B_WORK_ITEM_REPOSITORY,
    DI_V0_S4B_DISCOVERY_SERVICE,
    DI_V0_S4B_CLAIM_LOOP,
  ],
})
export class DiV0S4bOrchestrationModule {}
