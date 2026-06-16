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
} from '@nestjs/common';
import { StationsService } from './stations.service';
import {
  CreateStationDto,
  UpdateStationDto,
  ListStationsQueryDto,
  SetStationVehiclesDto,
  AssignVehicleStationDto,
  UpdateVehicleCurrentStationDto,
} from './dto';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard)
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string, @Query() query: ListStationsQueryDto) {
    return this.stationsService.findAll(orgId, query);
  }

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.stationsService.getStationStats(orgId);
  }

  @Get('search-places')
  async searchPlaces(@Query('q') query: string) {
    return this.stationsService.searchPlaces(query ?? '');
  }

  @Get('place-details/:placeId')
  async getPlaceDetails(@Param('placeId') placeId: string) {
    return this.stationsService.getPlaceDetails(placeId);
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
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.findOne(orgId, id);
  }

  @Get(':id/overview-stats')
  async getOverviewStats(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.getStationOverviewStats(orgId, id);
  }

  @Get(':id/fleet')
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
