import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationCalendarExceptionService } from './station-calendar-exception.service';
import { StationOperationalCapabilityService } from './station-operational-capability.service';
import { StationOperationsService } from './station-operations.service';
import { VehicleHomeFleetDeltaService } from './vehicle-home-fleet-delta.service';
import { StationsAccessService } from './stations-access.service';
import { StationsAssignVehiclePermissionGuard } from './guards/stations-assign-vehicle-permission.guard';
import { StationsPermissionGuard } from './guards/stations-permission.guard';
import { StationsSetPrimaryPermissionGuard } from './guards/stations-set-primary-permission.guard';
import { StationsUpdatePermissionGuard } from './guards/stations-update-permission.guard';
import { StationsVehicleLocationPermissionGuard } from './guards/stations-vehicle-location-permission.guard';
import { StationsChangeVehicleHomePermissionGuard } from './guards/stations-change-vehicle-home-permission.guard';

@Module({
  controllers: [StationsController],
  providers: [
    StationsService,
    StationValidationService,
    StationMapboxService,
    StationCalendarExceptionService,
    StationOperationalCapabilityService,
    StationOperationsService,
    VehicleHomeFleetDeltaService,
    StationsAccessService,
    StationsPermissionGuard,
    StationsUpdatePermissionGuard,
    StationsAssignVehiclePermissionGuard,
    StationsSetPrimaryPermissionGuard,
    StationsVehicleLocationPermissionGuard,
    StationsChangeVehicleHomePermissionGuard,
  ],
  exports: [StationsService, StationValidationService, StationsAccessService, StationCalendarExceptionService, StationOperationalCapabilityService, StationOperationsService, VehicleHomeFleetDeltaService],
})
export class StationsModule {}
