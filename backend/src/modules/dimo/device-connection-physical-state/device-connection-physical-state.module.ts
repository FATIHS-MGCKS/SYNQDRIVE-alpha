import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import connectivityPhysicalStateConfig from '@config/connectivity-physical-state.config';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { DeviceConnectionPhysicalStateService } from './device-connection-physical-state.service';

/**
 * Repository + service only. Episode/alert side-effect collaborators are supplied
 * by DimoConnectivityLifecycleDiModule to avoid duplicate provider graphs.
 */
@Module({
  imports: [ConfigModule.forFeature(connectivityPhysicalStateConfig)],
  providers: [DeviceConnectionPhysicalStateRepository, DeviceConnectionPhysicalStateService],
  exports: [DeviceConnectionPhysicalStateService, DeviceConnectionPhysicalStateRepository],
})
export class DeviceConnectionPhysicalStateModule {}
