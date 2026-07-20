import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { ServiceCasesController } from './service-cases.controller';
import { ServiceCasePermissionService } from './service-case-permission.service';
import { ServiceCasesService } from './service-cases.service';

@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  controllers: [ServiceCasesController],
  providers: [ServiceCasesService, ServiceCasePermissionService],
  exports: [ServiceCasesService],
})
export class ServiceCasesModule {}
