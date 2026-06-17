import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';

@Module({
  controllers: [StationsController],
  providers: [StationsService, StationValidationService, StationMapboxService],
  exports: [StationsService, StationValidationService],
})
export class StationsModule {}
