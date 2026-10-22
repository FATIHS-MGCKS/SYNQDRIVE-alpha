import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { AuthApiModule } from '@modules/auth/auth.module';
import { PhysicalDeviceInventoryController } from './physical-device-inventory.controller';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PdiIdentityMonitoringService } from './pdi-identity-monitoring.service';

@Module({
  imports: [ActivityLogModule, IamMfaModule, AuthApiModule],
  controllers: [PhysicalDeviceInventoryController],
  providers: [PhysicalDeviceInventoryService, PdiIdentityMonitoringService],
  exports: [PhysicalDeviceInventoryService, PdiIdentityMonitoringService],
})
export class PhysicalDeviceInventoryModule {}
