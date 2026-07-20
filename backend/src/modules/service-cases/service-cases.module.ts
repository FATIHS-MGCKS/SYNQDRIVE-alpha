import { Module, forwardRef } from '@nestjs/common';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { ServiceCasesController } from './service-cases.controller';
import { ServiceCasePermissionService } from './service-case-permission.service';
import { ServiceCaseTaskLinkService } from './service-case-task-link.service';
import { ServiceCasesService } from './service-cases.service';

@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule), TasksModule],
  controllers: [ServiceCasesController],
  providers: [ServiceCasesService, ServiceCasePermissionService, ServiceCaseTaskLinkService],
  exports: [ServiceCasesService, ServiceCaseTaskLinkService],
})
export class ServiceCasesModule {}
