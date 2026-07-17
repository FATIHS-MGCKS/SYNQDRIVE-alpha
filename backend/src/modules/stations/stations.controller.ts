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
import { RequireStationsPermission } from './decorators/require-stations-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { ArchiveStationDto } from './dto/archive-station.dto';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard, StationsPermissionGuard, StationScopeGuard)
export class StationsController {
  constructor(
    private readonly stationsService: StationsService,
    private readonly stationMapbox: StationMapboxService,
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
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationOperations(orgId, id, req[STATION_SCOPE_CONTEXT_KEY]);
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
  async setPrimary(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.setPrimaryStation(orgId, id);
  }

  @Put(':id/vehicles')
  @UseGuards(StationsAssignVehiclePermissionGuard)
  @RequireStationScope({ resource: 'station' })
  async setVehicles(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SetStationVehiclesDto,
  ) {
    return this.stationsService.setStationVehicles(orgId, id, body.vehicleIds ?? []);
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

  @Delete(':id')
  @RequireStationsPermission('stations.archive')
  @RequireStationScope({ resource: 'station' })
  async delete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.delete(orgId, id);
  }
}
