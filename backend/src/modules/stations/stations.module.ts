import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationCalendarExceptionService } from './station-calendar-exception.service';
import { StationOperationalCapabilityService } from './station-operational-capability.service';
import { StationOperationsService } from './station-operations.service';
import { VehicleHomeFleetDeltaService } from './vehicle-home-fleet-delta.service';
import { VehicleHomeAssignmentPreviewService } from './vehicle-home-assignment-preview.service';
import { VehicleStationTransferService } from './vehicle-station-transfer.service';
import { StationBookingRulesService } from './station-booking-rules.service';
import { StationRuleManualOverrideService } from './station-rule-manual-override.service';
import { StationsAccessService } from './stations-access.service';
import { StationsAssignVehiclePermissionGuard } from './guards/stations-assign-vehicle-permission.guard';
import { StationsPermissionGuard } from './guards/stations-permission.guard';
import { StationsSetPrimaryPermissionGuard } from './guards/stations-set-primary-permission.guard';
import { StationsUpdatePermissionGuard } from './guards/stations-update-permission.guard';
import { StationsVehicleLocationPermissionGuard } from './guards/stations-vehicle-location-permission.guard';
import { StationsChangeVehicleHomePermissionGuard } from './guards/stations-change-vehicle-home-permission.guard';
import { StationsCorrectVehicleCurrentPermissionGuard } from './guards/stations-correct-vehicle-current-permission.guard';
import { StationsManageTransfersPermissionGuard } from './guards/stations-manage-transfers-permission.guard';
import { StationsOverrideRulesPermissionGuard } from './guards/stations-override-rules-permission.guard';

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
    VehicleHomeAssignmentPreviewService,
    VehicleStationTransferService,
    StationBookingRulesService,
    StationRuleManualOverrideService,
    StationsAccessService,
    StationsPermissionGuard,
    StationsUpdatePermissionGuard,
    StationsAssignVehiclePermissionGuard,
    StationsSetPrimaryPermissionGuard,
    StationsVehicleLocationPermissionGuard,
    StationsChangeVehicleHomePermissionGuard,
    StationsCorrectVehicleCurrentPermissionGuard,
    StationsManageTransfersPermissionGuard,
    StationsOverrideRulesPermissionGuard,
  ],
  exports: [StationsService, StationValidationService, StationsAccessService, StationCalendarExceptionService, StationOperationalCapabilityService, StationOperationsService, VehicleHomeFleetDeltaService, VehicleHomeAssignmentPreviewService, VehicleStationTransferService, StationBookingRulesService, StationRuleManualOverrideService],
})
export class StationsModule {}
