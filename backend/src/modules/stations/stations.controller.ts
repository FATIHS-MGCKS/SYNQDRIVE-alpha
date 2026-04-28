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
import {
  StationsService,
  StationUpsertPayload,
  StationPatchPayload,
} from './stations.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard)
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  // ----- Listing / stats -----

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.stationsService.findAll(orgId);
  }

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.stationsService.getStationStats(orgId);
  }

  // ----- Google Places autocomplete (static paths before :id) -----

  @Get('search-places')
  async searchPlaces(@Query('q') query: string) {
    return this.stationsService.searchPlaces(query ?? '');
  }

  @Get('place-details/:placeId')
  async getPlaceDetails(@Param('placeId') placeId: string) {
    return this.stationsService.getPlaceDetails(placeId);
  }

  /**
   * V4.7.07 — One-shot backfill: geocode every station of this org whose
   * latitude / longitude is still null but that has at least an address +
   * city or postal code. Used to recover stations that were created
   * before the auto-geocoder was wired in (or where the address lookup
   * failed at the time). Idempotent: re-running it on a fully geocoded
   * org returns `totalChecked: 0`.
   */
  @Post('backfill-coordinates')
  async backfillCoordinates(@Param('orgId') orgId: string) {
    return this.stationsService.backfillCoordinates(orgId);
  }

  // ----- Single resource -----

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.findOne(orgId, id);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: StationUpsertPayload,
  ) {
    return this.stationsService.create(orgId, body);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: StationPatchPayload,
  ) {
    return this.stationsService.update(orgId, id, body);
  }

  /**
   * Replace this station's vehicle list with `vehicleIds` (SET semantics).
   * Vehicles previously here that aren't listed get detached; vehicles in
   * the list that were elsewhere — including vehicles assigned to another
   * station — are moved to this station.
   */
  @Put(':id/vehicles')
  async setVehicles(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { vehicleIds?: string[] },
  ) {
    return this.stationsService.setStationVehicles(orgId, id, body?.vehicleIds ?? []);
  }

  @Delete(':id')
  async delete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.delete(orgId, id);
  }
}
