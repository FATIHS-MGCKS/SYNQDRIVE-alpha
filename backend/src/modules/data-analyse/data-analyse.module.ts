import { Module } from '@nestjs/common';
import { DataAnalyseController } from './data-analyse.controller';
import { DataAnalyseService } from './data-analyse.service';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { DimoModule } from '@modules/dimo/dimo.module';

@Module({
  imports: [VehiclesModule, DimoModule],
  controllers: [DataAnalyseController],
  providers: [DataAnalyseService],
})
export class DataAnalyseModule {}
