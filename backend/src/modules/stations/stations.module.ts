import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationsV2ConfigService } from './stations-v2-config.service';
import { StationsV2FeatureGuard } from './guards/stations-v2-feature.guard';

@Module({
  controllers: [StationsController],
  providers: [
    StationsService,
    StationValidationService,
    StationMapboxService,
    StationsV2ConfigService,
    StationsV2FeatureGuard,
  ],
  exports: [StationsService, StationValidationService, StationsV2ConfigService],
})
export class StationsModule {}
