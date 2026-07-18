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
  UseGuards,
  GoneException,
} from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationMapboxService } from './station-mapbox.service';
import { StationsV2ConfigService } from './stations-v2-config.service';
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
import { StationsV2FeatureGuard } from './guards/stations-v2-feature.guard';
import { RequireStationsV2Feature } from './decorators/require-stations-v2-feature.decorator';
import { getStationsV2EffectiveFlags } from './stations-v2-feature-disabled.error';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard, StationsV2FeatureGuard)
export class StationsController {
  constructor(
    private readonly stationsService: StationsService,
    private readonly stationMapbox: StationMapboxService,
    private readonly stationsV2Config: StationsV2ConfigService,
  ) {}

  @Get('feature-flags/contract')
  getFeatureFlagsContract() {
    return this.stationsV2Config.getContractMetadata();
  }

  @Get('feature-flags')
  getFeatureFlags(@Param('orgId') orgId: string) {
    return getStationsV2EffectiveFlags(orgId);
  }

  @Get()
  async findAll(@Param('orgId') orgId: string, @Query() query: ListStationsQueryDto) {
    return this.stationsService.findAll(orgId, query);
  }

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.stationsService.getStationStats(orgId);
  }

  @Get('search/mapbox')
  async searchMapbox(@Query() query: StationMapboxSearchQueryDto) {
    return this.stationMapbox.search(query.query, {
      country: query.country,
      limit: query.limit,
    });
  }

  @Get('search/mapbox/:mapboxId')
  async retrieveMapbox(
    @Param('mapboxId') mapboxId: string,
    @Query() query: StationMapboxRetrieveQueryDto,
  ) {
    return this.stationMapbox.retrieve(mapboxId, query.sessionToken);
  }

  @Post('backfill-coordinates')
  @RequireStationsV2Feature('stationsSchemaV2Enabled')
  async backfillCoordinates(@Param('orgId') orgId: string) {
    return this.stationsService.backfillCoordinates(orgId);
  }

  @Patch('vehicles/current-station')
  @RequireStationsV2Feature('stationPositioningV2Enabled')
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
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.findOne(orgId, id);
  }

  @Get(':id/overview-stats')
  @RequireStationsV2Feature('stationSummaryV2Enabled')
  async getOverviewStats(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.getStationOverviewStats(orgId, id);
  }

  @Get(':id/fleet')
  @RequireStationsV2Feature('stationSummaryV2Enabled')
  async getFleet(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.getStationFleet(orgId, id);
  }

  @Get(':id/bookings')
  async getBookings(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.getStationBookings(orgId, id);
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
  @RequireStationsV2Feature('stationsLifecycleV2Enabled')
  async archive(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.archive(orgId, id);
  }

  @Post(':id/restore')
  @RequireStationsV2Feature('stationsLifecycleV2Enabled')
  async restore(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.restore(orgId, id);
  }

  @Post(':id/set-primary')
  @RequireStationsV2Feature('stationsLifecycleV2Enabled')
  async setPrimary(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.setPrimaryStation(orgId, id);
  }

  @Put(':id/vehicles')
  async setVehicles(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SetStationVehiclesDto,
  ) {
    const flags = getStationsV2EffectiveFlags(orgId);
    if (flags.legacySetVehiclesEndpointDisabled) {
      throw new GoneException({
        message: 'PUT /stations/:id/vehicles is disabled. Use delta home-fleet assignment APIs.',
        code: 'STATION_SET_VEHICLES_DISABLED',
        replacement: {
          method: 'POST',
          path: '/organizations/:orgId/stations/vehicles/change-home-station',
        },
      });
    }
    return this.stationsService.setStationVehicles(orgId, id, body.vehicleIds ?? []);
  }

  @Post(':id/assign-vehicle')
  @RequireStationsV2Feature('stationDeltaAssignmentEnabled')
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
