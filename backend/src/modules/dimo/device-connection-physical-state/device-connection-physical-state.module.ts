import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import connectivityPhysicalStateConfig from '@config/connectivity-physical-state.config';
import connectivityPhysicalStateCutoverEvidenceConfig from '@config/connectivity-physical-state-cutover-evidence.config';
import connectivityPhysicalStateRuntimeConfig from '@config/connectivity-physical-state-runtime.config';
import connectivityPhysicalStateShadowPilotScopeConfig from '@config/connectivity-physical-state-shadow-pilot-scope.config';
import deviceConnectionPhysicalStateActionOutboxConfig from '@config/device-connection-physical-state-action-outbox.config';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxProcessorService } from './device-connection-physical-state-action-outbox-processor.service';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { DeviceConnectionPhysicalStateService } from './device-connection-physical-state.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import { PhysicalStateShadowObservabilityService } from './physical-state-shadow-observability.service';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { PhysicalStateAuthorityCutoverService } from './physical-state-authority-cutover.service';
import { PhysicalStatePreseedService } from './physical-state-preseed.service';
import { PhysicalStateSnapshotEvidenceOrchestrator } from './physical-state-snapshot-evidence-orchestrator.service';
import { PhysicalStateShadowObservationRepository } from './physical-state-shadow-observation.repository';
import { PhysicalStateShadowObservationRetentionScheduler } from './physical-state-shadow-observation-retention.scheduler';

@Module({
  imports: [
    ConfigModule.forFeature(connectivityPhysicalStateConfig),
    ConfigModule.forFeature(connectivityPhysicalStateCutoverEvidenceConfig),
    ConfigModule.forFeature(connectivityPhysicalStateRuntimeConfig),
    ConfigModule.forFeature(deviceConnectionPhysicalStateActionOutboxConfig),
    ConfigModule.forFeature(connectivityPhysicalStateShadowPilotScopeConfig),
  ],
  providers: [
    DeviceConnectionPhysicalStateRepository,
    DeviceConnectionPhysicalStateService,
    DeviceConnectionPhysicalAuthorityCutoverRepository,
    DeviceConnectionPhysicalStateActionOutboxRepository,
    DeviceConnectionPhysicalStateActionOutboxProcessorService,
    PhysicalStateReconcileCoordinator,
    PhysicalStateShadowObservabilityService,
    PhysicalStateShadowObservationRepository,
    PhysicalStateShadowObservationRetentionScheduler,
    PhysicalStateEvidenceWriterService,
    PhysicalStateSnapshotEvidenceOrchestrator,
    PhysicalStatePreseedService,
    PhysicalStateAuthorityCutoverService,
  ],
  exports: [
    DeviceConnectionPhysicalStateService,
    DeviceConnectionPhysicalStateRepository,
    DeviceConnectionPhysicalAuthorityCutoverRepository,
    DeviceConnectionPhysicalStateActionOutboxRepository,
    DeviceConnectionPhysicalStateActionOutboxProcessorService,
    PhysicalStateReconcileCoordinator,
    PhysicalStateShadowObservabilityService,
    PhysicalStateShadowObservationRepository,
    PhysicalStateEvidenceWriterService,
    PhysicalStateSnapshotEvidenceOrchestrator,
    PhysicalStatePreseedService,
    PhysicalStateAuthorityCutoverService,
  ],
})
export class DeviceConnectionPhysicalStateModule {}
