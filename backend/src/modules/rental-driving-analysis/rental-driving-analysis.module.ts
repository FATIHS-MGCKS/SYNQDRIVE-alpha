import { Module } from '@nestjs/common';
import { RentalDrivingAnalysisController } from './rental-driving-analysis.controller';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [VehicleIntelligenceModule],
  controllers: [RentalDrivingAnalysisController],
  providers: [RentalDrivingAnalysisService],
  exports: [RentalDrivingAnalysisService],
})
export class RentalDrivingAnalysisModule {}
