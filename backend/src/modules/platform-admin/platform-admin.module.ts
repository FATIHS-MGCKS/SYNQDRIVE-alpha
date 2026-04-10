import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { VehicleLogbookService } from './vehicle-logbook.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [DimoModule, VehicleIntelligenceModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, VehicleLogbookService],
  exports: [PlatformAdminService],
})
export class PlatformAdminModule {}
