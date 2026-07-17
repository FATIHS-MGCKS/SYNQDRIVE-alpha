import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationCalendarExceptionService } from './station-calendar-exception.service';
import { StationOperationalCapabilityService } from './station-operational-capability.service';
import { StationsAccessService } from './stations-access.service';
import { StationsAssignVehiclePermissionGuard } from './guards/stations-assign-vehicle-permission.guard';
import { StationsPermissionGuard } from './guards/stations-permission.guard';
import { StationsSetPrimaryPermissionGuard } from './guards/stations-set-primary-permission.guard';
import { StationsUpdatePermissionGuard } from './guards/stations-update-permission.guard';
import { StationsVehicleLocationPermissionGuard } from './guards/stations-vehicle-location-permission.guard';

@Module({
  controllers: [StationsController],
  providers: [
    StationsService,
    StationValidationService,
    StationMapboxService,
    StationCalendarExceptionService,
    StationOperationalCapabilityService,
    StationsAccessService,
    StationsPermissionGuard,
    StationsUpdatePermissionGuard,
    StationsAssignVehiclePermissionGuard,
    StationsSetPrimaryPermissionGuard,
    StationsVehicleLocationPermissionGuard,
  ],
  exports: [StationsService, StationValidationService, StationsAccessService, StationCalendarExceptionService, StationOperationalCapabilityService],
})
export class StationsModule {}
