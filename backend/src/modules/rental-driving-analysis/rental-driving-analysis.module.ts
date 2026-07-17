import { forwardRef, Module } from '@nestjs/common';
import { RentalDrivingAnalysisController } from './rental-driving-analysis.controller';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RentalDrivingAnalysisRecomputeTriggerService } from './rental-driving-analysis-recompute.trigger';
import { RentalDrivingAnalysisRecomputeJobHandler } from './rental-driving-analysis-recompute.handler';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  controllers: [RentalDrivingAnalysisController],
  providers: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
  ],
  exports: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
  ],
})
export class RentalDrivingAnalysisModule {}
