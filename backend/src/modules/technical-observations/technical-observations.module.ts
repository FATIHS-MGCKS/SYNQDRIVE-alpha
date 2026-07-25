import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { TechnicalObservationsController } from './technical-observations.controller';
import { TechnicalObservationsService } from './technical-observations.service';
import { TechnicalObservationAuditService } from './technical-observation-audit.service';
import { TasksModule } from '../tasks/tasks.module';
import { ServiceCasesModule } from '../service-cases/service-cases.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [
    TasksModule,
    ServiceCasesModule,
    ActivityLogModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => VehicleIntelligenceModule),
  ],
  controllers: [TechnicalObservationsController],
  providers: [TechnicalObservationsService, TechnicalObservationAuditService],
  exports: [TechnicalObservationsService, TechnicalObservationAuditService],
})
export class TechnicalObservationsModule {}
