import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationsAccessService } from './stations-access.service';
import { StationsPermissionGuard } from './guards/stations-permission.guard';

@Module({
  controllers: [StationsController],
  providers: [
    StationsService,
    StationValidationService,
    StationMapboxService,
    StationsAccessService,
    StationsPermissionGuard,
  ],
  exports: [StationsService, StationValidationService, StationsAccessService],
})
export class StationsModule {}
