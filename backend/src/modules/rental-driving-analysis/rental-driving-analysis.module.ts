import { forwardRef, Module } from '@nestjs/common';
import { RentalDrivingAnalysisController } from './rental-driving-analysis.controller';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RentalDrivingAnalysisRecomputeTriggerService } from './rental-driving-analysis-recompute.trigger';
import { RentalDrivingAnalysisRecomputeJobHandler } from './rental-driving-analysis-recompute.handler';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT } from '@modules/vehicle-intelligence/driving-analysis-reconciliation/ports/rental-driving-analysis-reconciliation.port';
import { rentalDrivingAnalysisReconciliationPortProviders } from './reconciliation/rental-driving-analysis-reconciliation.providers';

@Module({
  imports: [forwardRef(() => VehicleIntelligenceModule)],
  controllers: [RentalDrivingAnalysisController],
  providers: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
    ...rentalDrivingAnalysisReconciliationPortProviders,
  ],
  exports: [
    RentalDrivingAnalysisService,
    RentalDrivingAnalysisRecomputeTriggerService,
    RentalDrivingAnalysisRecomputeJobHandler,
    RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT,
  ],
})
export class RentalDrivingAnalysisModule {}
