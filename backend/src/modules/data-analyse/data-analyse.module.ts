import { Module } from '@nestjs/common';
import { DataAnalyseController } from './data-analyse.controller';
import { DataAnalyseService } from './data-analyse.service';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [VehiclesModule, DimoModule, VehicleIntelligenceModule],
  controllers: [DataAnalyseController],
  providers: [DataAnalyseService],
})
export class DataAnalyseModule {}
