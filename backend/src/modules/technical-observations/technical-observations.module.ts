import { Module } from '@nestjs/common';
import { TechnicalObservationsController } from './technical-observations.controller';
import { TechnicalObservationsService } from './technical-observations.service';
import { TasksModule } from '../tasks/tasks.module';
import { ServiceCasesModule } from '../service-cases/service-cases.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [TasksModule, ServiceCasesModule, VehicleIntelligenceModule],
  controllers: [TechnicalObservationsController],
  providers: [TechnicalObservationsService],
  exports: [TechnicalObservationsService],
})
export class TechnicalObservationsModule {}
