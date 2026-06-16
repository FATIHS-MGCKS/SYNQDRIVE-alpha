import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';

@Module({
  controllers: [StationsController],
  providers: [StationsService, StationValidationService],
  exports: [StationsService, StationValidationService],
})
export class StationsModule {}
