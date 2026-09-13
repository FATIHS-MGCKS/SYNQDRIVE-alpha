import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import connectivityPhysicalStateConfig from '@config/connectivity-physical-state.config';
import deviceConnectionPhysicalStateActionOutboxConfig from '@config/device-connection-physical-state-action-outbox.config';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxProcessorService } from './device-connection-physical-state-action-outbox-processor.service';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { DeviceConnectionPhysicalStateService } from './device-connection-physical-state.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';

@Module({
  imports: [
    ConfigModule.forFeature(connectivityPhysicalStateConfig),
    ConfigModule.forFeature(deviceConnectionPhysicalStateActionOutboxConfig),
  ],
  providers: [
    DeviceConnectionPhysicalStateRepository,
    DeviceConnectionPhysicalStateService,
    DeviceConnectionPhysicalAuthorityCutoverRepository,
    DeviceConnectionPhysicalStateActionOutboxRepository,
    DeviceConnectionPhysicalStateActionOutboxProcessorService,
    PhysicalStateReconcileCoordinator,
  ],
  exports: [
    DeviceConnectionPhysicalStateService,
    DeviceConnectionPhysicalStateRepository,
    DeviceConnectionPhysicalAuthorityCutoverRepository,
    DeviceConnectionPhysicalStateActionOutboxRepository,
    DeviceConnectionPhysicalStateActionOutboxProcessorService,
    PhysicalStateReconcileCoordinator,
  ],
})
export class DeviceConnectionPhysicalStateModule {}
