import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { VehicleLogbookService } from './vehicle-logbook.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [DimoModule, VehicleIntelligenceModule, HealthModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, VehicleLogbookService],
  exports: [PlatformAdminService],
})
export class PlatformAdminModule {}
