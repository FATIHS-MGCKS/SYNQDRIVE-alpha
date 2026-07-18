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
  SetStationVehiclesDto,
  AssignVehicleStationDto,
  UpdateVehicleCurrentStationDto,
  ChangeVehicleHomeStationDto,
  StationMapboxSearchQueryDto,
  StationMapboxRetrieveQueryDto,
  RestoreStationDto,
} from './dto';
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
import { RequireStationsPermission } from './decorators/require-stations-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { ArchiveStationDto } from './dto/archive-station.dto';
import { StationCalendarExceptionService } from './station-calendar-exception.service';
import {
  CreateStationCalendarExceptionDto,
  UpdateStationCalendarExceptionDto,
} from './dto/station-calendar-exception.dto';
import { StationOperationalCapabilityService } from './station-operational-capability.service';
import { StationOperationsService } from './station-operations.service';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard, StationsPermissionGuard, StationScopeGuard)
export class StationsController {
  constructor(
    private readonly stationsService: StationsService,
    private readonly stationMapbox: StationMapboxService,
    private readonly stationCalendarExceptions: StationCalendarExceptionService,
    private readonly stationOperationalCapability: StationOperationalCapabilityService,
    private readonly stationOperations: StationOperationsService,
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

  @Get(':id/fleet')
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getFleet(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationFleet(orgId, id, req[STATION_SCOPE_CONTEXT_KEY]);
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
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.stationsService.setPrimaryStation(orgId, id, userId);
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
