import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationMapboxService } from './station-mapbox.service';
import {
  CreateStationDto,
  UpdateStationDto,
  ListStationsQueryDto,
  ListStationSummariesQueryDto,
  ListStationOperationsTimelineQueryDto,
  ListStationFleetQueryDto,
  SetStationVehiclesDto,
  AssignVehicleStationDto,
  UpdateVehicleCurrentStationDto,
  ChangeVehicleHomeStationDto,
  CorrectVehicleCurrentStationDto,
  StationMapboxSearchQueryDto,
  StationMapboxRetrieveQueryDto,
  RestoreStationDto,
} from './dto';
import { SetPrimaryStationDto } from './dto/set-primary-station.dto';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';
import { RequireStationScope } from '@shared/decorators/station-scope.decorator';
import { STATION_SCOPE_CONTEXT_KEY } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationsAssignVehiclePermissionGuard } from './guards/stations-assign-vehicle-permission.guard';
import { StationsPermissionGuard } from './guards/stations-permission.guard';
import { StationsSetPrimaryPermissionGuard } from './guards/stations-set-primary-permission.guard';
import { StationsUpdatePermissionGuard } from './guards/stations-update-permission.guard';
import { StationsVehicleLocationPermissionGuard } from './guards/stations-vehicle-location-permission.guard';
import { StationsChangeVehicleHomePermissionGuard } from './guards/stations-change-vehicle-home-permission.guard';
import { StationsCorrectVehicleCurrentPermissionGuard } from './guards/stations-correct-vehicle-current-permission.guard';
import { RequireStationsPermission } from './decorators/require-stations-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { ArchiveStationDto } from './dto/archive-station.dto';
import {
  MoveVehiclesToHomeStationDto,
  VehicleHomeFleetDeltaBaseDto,
} from './dto/vehicle-home-fleet-delta.dto';
import { StationCalendarExceptionService } from './station-calendar-exception.service';
import {
  CreateStationCalendarExceptionDto,
  UpdateStationCalendarExceptionDto,
} from './dto/station-calendar-exception.dto';
import { StationOperationalCapabilityService } from './station-operational-capability.service';
import { StationOperationsService } from './station-operations.service';
import { StationSummaryReadModelService } from './station-summary-read-model.service';
import { StationOperationsTimelineService } from './station-operations-timeline.service';
import { StationFleetReadModelService } from './station-fleet-read-model.service';
import { VehicleHomeFleetDeltaService } from './vehicle-home-fleet-delta.service';
import { VehicleHomeAssignmentPreviewService } from './vehicle-home-assignment-preview.service';
import { HomeAssignmentPreviewDto } from './dto/vehicle-home-assignment-preview.dto';
import { PlanVehicleStationTransferDto } from './dto/plan-vehicle-station-transfer.dto';
import { TransitionVehicleStationTransferDto } from './dto/transition-vehicle-station-transfer.dto';
import { VehicleStationTransferService } from './vehicle-station-transfer.service';
import { StationsManageTransfersPermissionGuard } from './guards/stations-manage-transfers-permission.guard';
import { StationBookingRulesService } from './station-booking-rules.service';
import { EvaluateStationBookingRulesDto } from './dto/evaluate-station-booking-rules.dto';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard, StationsPermissionGuard, StationScopeGuard)
export class StationsController {
  constructor(
    private readonly stationsService: StationsService,
    private readonly stationMapbox: StationMapboxService,
    private readonly stationCalendarExceptions: StationCalendarExceptionService,
    private readonly stationOperationalCapability: StationOperationalCapabilityService,
    private readonly stationOperations: StationOperationsService,
    private readonly stationSummaryReadModel: StationSummaryReadModelService,
    private readonly stationOperationsTimeline: StationOperationsTimelineService,
    private readonly stationFleetReadModel: StationFleetReadModelService,
    private readonly vehicleHomeFleetDelta: VehicleHomeFleetDeltaService,
    private readonly vehicleHomeAssignmentPreview: VehicleHomeAssignmentPreviewService,
    private readonly vehicleStationTransfer: VehicleStationTransferService,
    private readonly stationBookingRules: StationBookingRulesService,
  ) {}

  @Get()
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'list' })
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: ListStationsQueryDto,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.findAll(orgId, query, req[STATION_SCOPE_CONTEXT_KEY]);
  }

  @Get('stats')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'list' })
  async getStats(
    @Param('orgId') orgId: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationStats(orgId, req[STATION_SCOPE_CONTEXT_KEY]);
  }

  @Get('search/mapbox')
  @RequireStationScope({ resource: 'none' })
  async searchMapbox(@Query() query: StationMapboxSearchQueryDto) {
    return this.stationMapbox.search(query.query, {
      country: query.country,
      limit: query.limit,
    });
  }

  @Get('search/mapbox/:mapboxId')
  @RequireStationScope({ resource: 'none' })
  async retrieveMapbox(
    @Param('mapboxId') mapboxId: string,
    @Query() query: StationMapboxRetrieveQueryDto,
  ) {
    return this.stationMapbox.retrieve(mapboxId, query.sessionToken);
  }

  @Post('backfill-coordinates')
  @RequireStationsPermission('stations.geocode')
  @RequireStationScope({ resource: 'list' })
  async backfillCoordinates(@Param('orgId') orgId: string) {
    return this.stationsService.backfillCoordinates(orgId);
  }

  @Patch('vehicles/current-station')
  @UseGuards(StationsVehicleLocationPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async updateVehicleCurrentStation(
    @Param('orgId') orgId: string,
    @Body() body: UpdateVehicleCurrentStationDto,
  ) {
    return this.stationsService.updateVehicleCurrentStation(
      orgId,
      body.vehicleId,
      body.currentStationId ?? null,
      body.expectedStationId,
      body.expectedVersion,
    );
  }

  @Post('vehicles/correct-current-station')
  @UseGuards(StationsCorrectVehicleCurrentPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async correctVehicleCurrentStation(
    @Param('orgId') orgId: string,
    @Body() body: CorrectVehicleCurrentStationDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.stationsService.correctVehicleCurrentStation(
      orgId,
      {
        vehicleId: body.vehicleId,
        currentStationId: body.currentStationId ?? null,
        source: body.source,
        reason: body.reason,
        expectedVersion: body.expectedVersion,
      },
      userId,
    );
  }

  @Post('vehicles/change-home-station')
  @UseGuards(StationsChangeVehicleHomePermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async changeVehicleHomeStation(
    @Param('orgId') orgId: string,
    @Body() body: ChangeVehicleHomeStationDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.stationsService.changeVehicleHomeStation(
      orgId,
      {
        vehicleId: body.vehicleId,
        newHomeStationId: body.newHomeStationId ?? null,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
      },
      userId,
    );
  }

  @Post('transfers/plan')
  @UseGuards(StationsManageTransfersPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async planVehicleStationTransfer(
    @Param('orgId') orgId: string,
    @Body() body: PlanVehicleStationTransferDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.vehicleStationTransfer.planTransfer(orgId, body, userId);
  }

  @Post('transfers/:transferId/ready')
  @UseGuards(StationsManageTransfersPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async markVehicleStationTransferReady(
    @Param('orgId') orgId: string,
    @Param('transferId') transferId: string,
    @Body() body: TransitionVehicleStationTransferDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.vehicleStationTransfer.markReady(
      orgId,
      transferId,
      body.reason,
      userId,
      body.expectedVersion,
    );
  }

  @Post('transfers/:transferId/start')
  @UseGuards(StationsManageTransfersPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async startVehicleStationTransfer(
    @Param('orgId') orgId: string,
    @Param('transferId') transferId: string,
    @Body() body: TransitionVehicleStationTransferDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.vehicleStationTransfer.startTransfer(
      orgId,
      transferId,
      body.reason,
      userId,
      body.expectedVersion,
    );
  }

  @Post('transfers/:transferId/arrive')
  @UseGuards(StationsManageTransfersPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async arriveVehicleStationTransfer(
    @Param('orgId') orgId: string,
    @Param('transferId') transferId: string,
    @Body() body: TransitionVehicleStationTransferDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.vehicleStationTransfer.markArrived(
      orgId,
      transferId,
      body.reason,
      userId,
      body.expectedVersion,
    );
  }

  @Post('transfers/:transferId/cancel')
  @UseGuards(StationsManageTransfersPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async cancelVehicleStationTransfer(
    @Param('orgId') orgId: string,
    @Param('transferId') transferId: string,
    @Body() body: TransitionVehicleStationTransferDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.vehicleStationTransfer.cancelTransfer(
      orgId,
      transferId,
      body.reason,
      userId,
      body.expectedVersion,
    );
  }

  @Post('transfers/:transferId/mark-overdue')
  @UseGuards(StationsManageTransfersPermissionGuard)
  @RequireStationScope({ resource: 'vehicle_location' })
  async markVehicleStationTransferOverdue(
    @Param('orgId') orgId: string,
    @Param('transferId') transferId: string,
    @Body() body: TransitionVehicleStationTransferDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.vehicleStationTransfer.markOverdue(
      orgId,
      transferId,
      body.reason,
      userId,
      body.expectedVersion,
    );
  }

  @Post(':id/home-fleet/preview')
  @UseGuards(StationsChangeVehicleHomePermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async previewHomeFleetAssignment(
    @Param('orgId') orgId: string,
    @Param('id') stationId: string,
    @Body() body: HomeAssignmentPreviewDto,
  ) {
    return this.vehicleHomeAssignmentPreview.previewHomeAssignment(
      orgId,
      stationId,
      body.proposals,
    );
  }

  @Post(':id/home-fleet/add')
  @UseGuards(StationsChangeVehicleHomePermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async addVehiclesToHomeStation(
    @Param('orgId') orgId: string,
    @Param('id') stationId: string,
    @Body() body: VehicleHomeFleetDeltaBaseDto,
  ) {
    return this.vehicleHomeFleetDelta.addVehiclesToHomeStation(
      orgId,
      stationId,
      body.vehicleIds,
      {
        idempotencyKey: body.idempotencyKey,
        reason: body.reason,
        expectedVersions: body.expectedVersions,
      },
    );
  }

  @Post(':id/home-fleet/remove')
  @UseGuards(StationsChangeVehicleHomePermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async removeVehiclesFromHomeStation(
    @Param('orgId') orgId: string,
    @Param('id') stationId: string,
    @Body() body: VehicleHomeFleetDeltaBaseDto,
  ) {
    return this.vehicleHomeFleetDelta.removeVehiclesFromHomeStation(
      orgId,
      stationId,
      body.vehicleIds,
      {
        idempotencyKey: body.idempotencyKey,
        reason: body.reason,
        expectedVersions: body.expectedVersions,
      },
    );
  }

  @Post(':id/home-fleet/move')
  @UseGuards(StationsChangeVehicleHomePermissionGuard)
  @RequireStationScope({ resource: 'home_fleet_move' })
  async moveVehiclesToHomeStation(
    @Param('orgId') orgId: string,
    @Param('id') stationId: string,
    @Body() body: MoveVehiclesToHomeStationDto,
  ) {
    return this.vehicleHomeFleetDelta.moveVehiclesToHomeStation(
      orgId,
      stationId,
      body.targetStationId,
      body.vehicleIds,
      {
        idempotencyKey: body.idempotencyKey,
        reason: body.reason,
        expectedVersions: body.expectedVersions,
      },
    );
  }

  @Get('booking-rules/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getBookingRulesContract() {
    return this.stationBookingRules.getContractMetadata();
  }

  @Get('booking-rules/manual-override/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getBookingRulesManualOverrideContract() {
    return this.stationBookingRules.getManualOverrideMetadata();
  }

  @Post('booking-rules/evaluate')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  async evaluateBookingRules(
    @Param('orgId') orgId: string,
    @Body() body: EvaluateStationBookingRulesDto,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext; user?: { id?: string } },
  ) {
    return this.stationBookingRules.evaluateRequest(
      orgId,
      body,
      req[STATION_SCOPE_CONTEXT_KEY],
      req.user,
    );
  }

  @Get('opening-hours/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getOpeningHoursContract() {
    return this.stationsService.getOpeningHoursContract();
  }

  @Get('calendar-exceptions/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getCalendarExceptionsContract() {
    return this.stationCalendarExceptions.getContractMetadata();
  }

  @Get('operational-capability/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getOperationalCapabilityContract() {
    return this.stationOperationalCapability.getContractMetadata();
  }

  @Get('operations/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getOperationsContract() {
    return this.stationOperations.getContractMetadata();
  }

  @Get('operations-timeline/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getOperationsTimelineContract() {
    return this.stationOperationsTimeline.getContractMetadata();
  }

  @Get('summaries/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'list' })
  getOrgSummariesContract() {
    return this.stationSummaryReadModel.getOrgSummariesContractMetadata();
  }

  @Get('summaries')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'list' })
  async getOrgSummaries(
    @Param('orgId') orgId: string,
    @Query() query: ListStationSummariesQueryDto,
    @Query('at') at: string | undefined,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationSummaryReadModel.resolveForOrganization(
      orgId,
      query,
      req[STATION_SCOPE_CONTEXT_KEY],
      { at },
    );
  }

  @Get('summary/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getSummaryContract() {
    return this.stationSummaryReadModel.getContractMetadata();
  }

  @Get(':id')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.findOne(orgId, id, req[STATION_SCOPE_CONTEXT_KEY]);
  }


  @Get(':id/summary')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getSummary(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query('at') at: string | undefined,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationSummaryReadModel.resolveForStation(orgId, id, req[STATION_SCOPE_CONTEXT_KEY], {
      at,
    });
  }

  @Get(':id/overview-stats')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getOverviewStats(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationOverviewStats(
      orgId,
      id,
      req[STATION_SCOPE_CONTEXT_KEY],
    );
  }

  @Get('fleet/contract')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'none' })
  getFleetContract() {
    return this.stationFleetReadModel.getContractMetadata();
  }

  @Get(':id/fleet')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getFleet(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query() query: ListStationFleetQueryDto,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationFleetReadModel.resolveForStation(
      orgId,
      id,
      query,
      req[STATION_SCOPE_CONTEXT_KEY],
    );
  }

  @Get(':id/bookings')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getBookings(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationBookings(orgId, id, req[STATION_SCOPE_CONTEXT_KEY]);
  }

  @Get(':id/operations')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getOperations(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query('at') at: string | undefined,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationOperations.resolveForStation(orgId, id, req[STATION_SCOPE_CONTEXT_KEY], {
      at,
    });
  }

  @Get(':id/operations-timeline')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getOperationsTimeline(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query() query: ListStationOperationsTimelineQueryDto,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationOperationsTimeline.resolveForStation(
      orgId,
      id,
      query,
      req[STATION_SCOPE_CONTEXT_KEY],
    );
  }

  @Get(':id/team')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getTeam(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationTeam(orgId, id, req[STATION_SCOPE_CONTEXT_KEY]);
  }

  @Get(':id/activity')
  @RequireStationsPermission('stations.view_activity')
  @RequireStationScope({ resource: 'station' })
  async getActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationActivity(orgId, id, req[STATION_SCOPE_CONTEXT_KEY]);
  }

  @Get(':id/calendar-exceptions')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async listCalendarExceptions(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationCalendarExceptions.listForStation(orgId, id);
  }

  @Get(':id/operational-capability')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async resolveOperationalCapability(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query('at') at?: string,
    @Query('purpose') purpose?: 'pickup' | 'return',
  ) {
    if (purpose === 'pickup' || purpose === 'return') {
      return this.stationOperationalCapability.resolvePurposeForStation(orgId, id, purpose, {
        at,
      });
    }
    return this.stationOperationalCapability.resolveForStation(orgId, id, { at });
  }

  @Post(':id/calendar-exceptions')
  @RequireStationsPermission('stations.manage_operations')
  @RequireStationScope({ resource: 'station' })
  async createCalendarException(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: CreateStationCalendarExceptionDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.stationCalendarExceptions.create(orgId, id, body, userId);
  }

  @Post(':id/calendar-exceptions/import-legacy')
  @RequireStationsPermission('stations.manage_operations')
  @RequireStationScope({ resource: 'station' })
  async importLegacyCalendarExceptions(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.stationCalendarExceptions.importLegacyHolidayRules(orgId, id, userId);
  }

  @Patch(':id/calendar-exceptions/:exceptionId')
  @RequireStationsPermission('stations.manage_operations')
  @RequireStationScope({ resource: 'station' })
  async updateCalendarException(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('exceptionId') exceptionId: string,
    @Body() body: UpdateStationCalendarExceptionDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.stationCalendarExceptions.update(orgId, id, exceptionId, body, userId);
  }

  @Post(':id/calendar-exceptions/:exceptionId/cancel')
  @RequireStationsPermission('stations.manage_operations')
  @RequireStationScope({ resource: 'station' })
  async cancelCalendarException(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('exceptionId') exceptionId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.stationCalendarExceptions.cancel(orgId, id, exceptionId, userId);
  }

  @Post()
  @RequireStationsPermission('stations.create')
  @RequireStationScope({ resource: 'create' })
  async create(@Param('orgId') orgId: string, @Body() body: CreateStationDto) {
    return this.stationsService.create(orgId, body);
  }

  @Patch(':id')
  @UseGuards(StationsUpdatePermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateStationDto,
  ) {
    return this.stationsService.update(orgId, id, body);
  }

  @Post(':id/activate')
  @RequireStationsPermission('stations.activate')
  @RequireStationScope({ resource: 'station' })
  async activate(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.activateStation(orgId, id);
  }

  @Post(':id/deactivate')
  @RequireStationsPermission('stations.deactivate')
  @RequireStationScope({ resource: 'station' })
  async deactivate(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.deactivateStation(orgId, id);
  }

  @Get(':id/archive-preview')
  @RequireStationsPermission('stations.archive')
  @RequireStationScope({ resource: 'station' })
  async getArchivePreview(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationArchivePreview(
      orgId,
      id,
      req[STATION_SCOPE_CONTEXT_KEY],
    );
  }

  @Post(':id/archive')
  @RequireStationsPermission('stations.archive')
  @RequireStationScope({ resource: 'station' })
  async archive(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: ArchiveStationDto,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.archiveStation(
      orgId,
      id,
      body,
      req[STATION_SCOPE_CONTEXT_KEY],
      userId,
    );
  }

  @Get(':id/restore-preview')
  @RequireStationsPermission('stations.restore')
  @RequireStationScope({ resource: 'station', allowArchivedLifecycleWrite: true })
  async getRestorePreview(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationRestorePreview(
      orgId,
      id,
      req[STATION_SCOPE_CONTEXT_KEY],
    );
  }

  @Post(':id/restore')
  @RequireStationsPermission('stations.restore')
  @RequireStationScope({ resource: 'station', allowArchivedLifecycleWrite: true })
  async restore(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RestoreStationDto,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.restoreStation(
      orgId,
      id,
      body,
      req[STATION_SCOPE_CONTEXT_KEY],
      userId,
    );
  }

  @Post(':id/set-primary')
  @UseGuards(StationsSetPrimaryPermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async setPrimary(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SetPrimaryStationDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.stationsService.setPrimaryStation(orgId, id, userId, {
      expectedUpdatedAt: body.expectedUpdatedAt,
    });
  }

  /**
   * @deprecated SET semantics removed — use POST /vehicles/change-home-station.
   */
  @Put(':id/vehicles')
  @UseGuards(StationsAssignVehiclePermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async setVehicles(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SetStationVehiclesDto,
  ) {
    return this.stationsService.setStationVehicles(orgId, id, body.vehicleIds ?? [], {
      listCompleteness: body.listCompleteness,
    });
  }

  @Post(':id/assign-vehicle')
  @UseGuards(StationsAssignVehiclePermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async assignVehicle(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: AssignVehicleStationDto,
  ) {
    return this.stationsService.assignVehicleToStation(
      orgId,
      id,
      body.vehicleId,
      body.target ?? 'home',
      body.expectedVersion,
    );
  }

  /**
   * @deprecated Returns HTTP 410 — use POST /stations/:id/archive instead.
   */
  @Delete(':id')
  @RequireStationsPermission('stations.archive')
  @RequireStationScope({ resource: 'station' })
  async delete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.delete(orgId, id);
  }
}
