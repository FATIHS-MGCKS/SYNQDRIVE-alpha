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
  Req,
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
import {
  ChangeHomeStationDto,
  CreateStationTransferDto,
  HomeFleetPreviewDto,
  UpdateStationTransferStatusDto,
} from './dto/stations-v2-ops.dto';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { StationScopeGuard } from '@shared/guards/station-scope.guard';
import { StationAccessService } from '@shared/stations/station-access.service';
import { StationsV2FeatureGuard } from './guards/stations-v2-feature.guard';
import { RequireStationsV2Feature } from './decorators/require-stations-v2-feature.decorator';
import { getStationsV2EffectiveFlags } from './stations-v2-feature-disabled.error';
import { StationTransferService } from './transfers/station-transfer.service';

const STATIONS_MODULE = 'stations';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard, StationScopeGuard, StationsV2FeatureGuard)
export class StationsController {
  constructor(
    private readonly stationsService: StationsService,
    private readonly stationMapbox: StationMapboxService,
    private readonly stationsV2Config: StationsV2ConfigService,
    private readonly stationAccess: StationAccessService,
    private readonly stationTransferService: StationTransferService,
  ) {}

  private async accessFor(req: { user?: { id?: string }; params?: { orgId?: string } }) {
    return this.stationAccess.resolve(req.user?.id, req.params?.orgId ?? '');
  }

  @Get('feature-flags/contract')
  @RequirePermission(STATIONS_MODULE, 'read')
  getFeatureFlagsContract() {
    return this.stationsV2Config.getContractMetadata();
  }

  @Get('feature-flags')
  @RequirePermission(STATIONS_MODULE, 'read')
  getFeatureFlags(@Param('orgId') orgId: string) {
    return getStationsV2EffectiveFlags(orgId);
  }

  @Get()
  @RequirePermission(STATIONS_MODULE, 'read')
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: ListStationsQueryDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const access = await this.accessFor(req);
    return this.stationsService.findAll(orgId, query, access);
  }

  @Get('stats')
  @RequirePermission(STATIONS_MODULE, 'read')
  async getStats(@Param('orgId') orgId: string, @Req() req: { user?: { id?: string } }) {
    const access = await this.accessFor(req);
    return this.stationsService.getStationStats(orgId, access);
  }

  @Get('summaries')
  @RequireStationsV2Feature('stationSummaryV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'read')
  async getSummaries(
    @Param('orgId') orgId: string,
    @Query('stationIds') stationIdsRaw: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    const access = await this.accessFor(req);
    const stationIds = stationIdsRaw?.split(',').filter(Boolean);
    return this.stationsService.getStationSummariesBatch(orgId, access, stationIds);
  }

  @Post('vehicles/change-home-station')
  @RequireStationsV2Feature('stationDeltaAssignmentEnabled')
  @RequirePermission(STATIONS_MODULE, 'write')
  async changeHomeStation(
    @Param('orgId') orgId: string,
    @Body() body: ChangeHomeStationDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.stationsService.changeHomeStation(
      orgId,
      body.vehicleId,
      body.toStationId,
      req.user?.id,
    );
  }

  @Post('home-fleet/preview')
  @RequireStationsV2Feature('stationDeltaAssignmentEnabled')
  @RequirePermission(STATIONS_MODULE, 'read')
  async previewHomeFleet(@Param('orgId') orgId: string, @Body() body: HomeFleetPreviewDto) {
    return this.stationsService.previewHomeFleetChange(orgId, body.stationId, body.vehicleIds ?? []);
  }

  @Get('transfers')
  @RequireStationsV2Feature('stationTransfersEnabled')
  @RequirePermission(STATIONS_MODULE, 'read')
  async listTransfers(
    @Param('orgId') orgId: string,
    @Query('stationId') stationId: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.stationTransferService.listTransfers(
      orgId,
      req.user?.id,
      stationId,
      status as import('@prisma/client').VehicleStationTransferStatus | undefined,
    );
  }

  @Post('transfers')
  @RequireStationsV2Feature('stationTransfersEnabled')
  @RequirePermission(STATIONS_MODULE, 'write')
  async createTransfer(
    @Param('orgId') orgId: string,
    @Body() body: CreateStationTransferDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.stationTransferService.createTransfer({
      orgId,
      vehicleId: body.vehicleId,
      fromStationId: body.fromStationId,
      toStationId: body.toStationId,
      actorUserId: req.user?.id ?? null,
    });
  }

  @Post('transfers/:transferId/status')
  @RequireStationsV2Feature('stationTransfersEnabled')
  @RequirePermission(STATIONS_MODULE, 'write')
  async updateTransferStatus(
    @Param('orgId') orgId: string,
    @Param('transferId') transferId: string,
    @Body() body: UpdateStationTransferStatusDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.stationTransferService.updateTransferStatus(
      orgId,
      transferId,
      body.status,
      req.user?.id,
    );
  }

  @Get('search/mapbox')
  @RequirePermission(STATIONS_MODULE, 'read')
  async searchMapbox(@Query() query: StationMapboxSearchQueryDto) {
    return this.stationMapbox.search(query.query, {
      country: query.country,
      limit: query.limit,
    });
  }

  @Get('search/mapbox/:mapboxId')
  @RequirePermission(STATIONS_MODULE, 'read')
  async retrieveMapbox(
    @Param('mapboxId') mapboxId: string,
    @Query() query: StationMapboxRetrieveQueryDto,
  ) {
    return this.stationMapbox.retrieve(mapboxId, query.sessionToken);
  }

  @Post('backfill-coordinates')
  @RequireStationsV2Feature('stationsSchemaV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'manage')
  async backfillCoordinates(@Param('orgId') orgId: string) {
    return this.stationsService.backfillCoordinates(orgId);
  }

  @Patch('vehicles/current-station')
  @RequireStationsV2Feature('stationPositioningV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'write')
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

  @Get(':id/archive-preview')
  @RequireStationsV2Feature('stationsLifecycleV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'read')
  async archivePreview(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const access = await this.accessFor(req);
    return this.stationsService.getArchivePreview(orgId, id, access);
  }

  @Get(':id')
  @RequirePermission(STATIONS_MODULE, 'read')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const access = await this.accessFor(req);
    return this.stationsService.findOne(orgId, id, access);
  }

  @Get(':id/overview-stats')
  @RequireStationsV2Feature('stationSummaryV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'read')
  async getOverviewStats(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const access = await this.accessFor(req);
    return this.stationsService.getStationOverviewStats(orgId, id, access);
  }

  @Get(':id/fleet')
  @RequireStationsV2Feature('stationSummaryV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'read')
  async getFleet(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const access = await this.accessFor(req);
    return this.stationsService.getStationFleet(orgId, id, access);
  }

  @Get(':id/bookings')
  @RequirePermission(STATIONS_MODULE, 'read')
  async getBookings(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const access = await this.accessFor(req);
    await this.stationsService.findOne(orgId, id, access);
    return this.stationsService.getStationBookings(orgId, id);
  }

  @Post()
  @RequirePermission(STATIONS_MODULE, 'write')
  async create(@Param('orgId') orgId: string, @Body() body: CreateStationDto) {
    return this.stationsService.create(orgId, body);
  }

  @Patch(':id')
  @RequirePermission(STATIONS_MODULE, 'write')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateStationDto,
  ) {
    return this.stationsService.update(orgId, id, body);
  }

  @Post(':id/archive')
  @RequireStationsV2Feature('stationsLifecycleV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'write')
  async archive(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.stationsService.archive(orgId, id, req.user?.id);
  }

  @Post(':id/restore')
  @RequireStationsV2Feature('stationsLifecycleV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'write')
  async restore(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.stationsService.restore(orgId, id, req.user?.id);
  }

  @Post(':id/set-primary')
  @RequireStationsV2Feature('stationsLifecycleV2Enabled')
  @RequirePermission(STATIONS_MODULE, 'write')
  async setPrimary(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.setPrimaryStation(orgId, id);
  }

  @Put(':id/vehicles')
  @RequirePermission(STATIONS_MODULE, 'write')
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
  @RequirePermission(STATIONS_MODULE, 'write')
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
  @RequirePermission(STATIONS_MODULE, 'manage')
  async delete(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.stationsService.delete(orgId, id, req.user?.id);
  }
}
