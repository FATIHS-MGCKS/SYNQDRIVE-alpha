import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationValidationService } from './station-validation.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationCalendarExceptionService } from './station-calendar-exception.service';
import { StationOperationalCapabilityService } from './station-operational-capability.service';
import { StationOperationsService } from './station-operations.service';
import { StationSummaryReadModelService } from './station-summary-read-model.service';
import { StationOperationsTimelineService } from './station-operations-timeline.service';
import { StationFleetReadModelService } from './station-fleet-read-model.service';
import { StationVehicleRuntimeLoader } from './station-vehicle-runtime.loader';
import { VehicleHomeFleetDeltaService } from './vehicle-home-fleet-delta.service';
import { VehicleHomeAssignmentPreviewService } from './vehicle-home-assignment-preview.service';
import { VehicleStationTransferService } from './vehicle-station-transfer.service';
import { StationBookingRulesService } from './station-booking-rules.service';
import { StationRuleManualOverrideService } from './station-rule-manual-override.service';
import { StationDomainAuditService } from './station-domain-audit.service';
import { StationMetricsService } from './station-metrics.service';
import { StationsMetricsInterceptor } from './stations-metrics.interceptor';
import { StationVehicleWorkflowLookupService } from './station-vehicle-workflow-lookup.service';
import { StationVehicleWorkflowPreviewService } from './station-vehicle-workflow-preview.service';
import { StationsAccessService } from './stations-access.service';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
import { StationsAssignVehiclePermissionGuard } from './guards/stations-assign-vehicle-permission.guard';
import { StationsPermissionGuard } from './guards/stations-permission.guard';
import { StationsSetPrimaryPermissionGuard } from './guards/stations-set-primary-permission.guard';
import { StationsUpdatePermissionGuard } from './guards/stations-update-permission.guard';
import { StationsVehicleLocationPermissionGuard } from './guards/stations-vehicle-location-permission.guard';
import { StationsChangeVehicleHomePermissionGuard } from './guards/stations-change-vehicle-home-permission.guard';
import { StationsCorrectVehicleCurrentPermissionGuard } from './guards/stations-correct-vehicle-current-permission.guard';
import { StationsManageTransfersPermissionGuard } from './guards/stations-manage-transfers-permission.guard';
import { StationsOverrideRulesPermissionGuard } from './guards/stations-override-rules-permission.guard';
import { StationsV2DiagnosticService } from './diagnostic/stations-v2-diagnostic.service';

@Module({
  imports: [forwardRef(() => VehiclesModule), forwardRef(() => RentalHealthModule)],
  controllers: [StationsController],
  providers: [
    StationsService,
    StationValidationService,
    StationMapboxService,
    StationCalendarExceptionService,
    StationOperationalCapabilityService,
    StationOperationsService,
    StationSummaryReadModelService,
    StationOperationsTimelineService,
    StationFleetReadModelService,
    StationVehicleWorkflowLookupService,
    StationVehicleWorkflowPreviewService,
    StationVehicleRuntimeLoader,
    VehicleHomeFleetDeltaService,
    VehicleHomeAssignmentPreviewService,
    VehicleStationTransferService,
    StationBookingRulesService,
    StationRuleManualOverrideService,
    StationDomainAuditService,
    StationMetricsService,
    StationsAccessService,
    StationsV2DiagnosticService,
    StationsPermissionGuard,
    StationsUpdatePermissionGuard,
    StationsAssignVehiclePermissionGuard,
    StationsSetPrimaryPermissionGuard,
    StationsVehicleLocationPermissionGuard,
    StationsChangeVehicleHomePermissionGuard,
    StationsCorrectVehicleCurrentPermissionGuard,
    StationsManageTransfersPermissionGuard,
    StationsOverrideRulesPermissionGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: StationsMetricsInterceptor,
    },
  ],
  exports: [StationsService, StationValidationService, StationsAccessService, StationCalendarExceptionService, StationOperationalCapabilityService, StationOperationsService, StationSummaryReadModelService, VehicleHomeFleetDeltaService, VehicleHomeAssignmentPreviewService, VehicleStationTransferService, StationBookingRulesService, StationRuleManualOverrideService, StationMetricsService],
})
export class StationsModule {}
