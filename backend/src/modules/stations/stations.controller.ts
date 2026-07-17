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
} from './dto';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';
import { RequireStationScope } from '@shared/decorators/station-scope.decorator';
import { STATION_SCOPE_CONTEXT_KEY } from '@shared/stations/station-scope.constants';
import type { StationScopeContext } from '@shared/stations/station-scope.types';
import { StationsPermissionGuard } from './guards/stations-permission.guard';
import { RequireStationsPermission } from './decorators/require-stations-permission.decorator';

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
  async backfillCoordinates(@Param('orgId') orgId: string) {
    return this.stationsService.backfillCoordinates(orgId);
  }

  @Patch('vehicles/current-station')
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
  @RequireStationsPermission('stations.read')
  @RequireStationScope({ resource: 'station' })
  async getActivity(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { [STATION_SCOPE_CONTEXT_KEY]?: StationScopeContext },
  ) {
    return this.stationsService.getStationActivity(orgId, id, req[STATION_SCOPE_CONTEXT_KEY]);
  }

  @Post()
  async create(@Param('orgId') orgId: string, @Body() body: CreateStationDto) {
    return this.stationsService.create(orgId, body);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateStationDto,
  ) {
    return this.stationsService.update(orgId, id, body);
  }

  @Post(':id/archive')
  async archive(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.archive(orgId, id);
  }

  @Post(':id/restore')
  async restore(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.restore(orgId, id);
  }

  @Post(':id/set-primary')
  async setPrimary(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.setPrimaryStation(orgId, id);
  }

  @Put(':id/vehicles')
  async setVehicles(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SetStationVehiclesDto,
  ) {
    return this.stationsService.setStationVehicles(orgId, id, body.vehicleIds ?? []);
  }

  @Post(':id/assign-vehicle')
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
  async delete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.delete(orgId, id);
  }
}
