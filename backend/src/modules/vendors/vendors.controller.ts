import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

@Controller('organizations/:orgId/vendors')
@UseGuards(OrgScopingGuard, RolesGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.vendorsService.getStats(orgId);
  }

  @Get('search-places')
  async searchPlaces(@Query('q') query: string) {
    return this.vendorsService.searchPlaces(query);
  }

  @Get('place-details/:placeId')
  async getPlaceDetails(@Param('placeId') placeId: string) {
    return this.vendorsService.getPlaceDetails(placeId);
  }

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.vendorsService.findAll(orgId);
  }

  @Get(':id')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.vendorsService.findById(orgId, id);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: any,
  ) {
    return this.vendorsService.create(orgId, body);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.vendorsService.update(orgId, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.vendorsService.remove(orgId, id);
  }

  @Post(':id/vehicles')
  async linkVehicle(
    @Param('orgId') orgId: string,
    @Param('id') vendorId: string,
    @Body() body: { vehicleId: string; notes?: string },
  ) {
    return this.vendorsService.linkVehicle(orgId, vendorId, body.vehicleId, body.notes);
  }

  @Delete(':id/vehicles/:vehicleId')
  async unlinkVehicle(
    @Param('orgId') orgId: string,
    @Param('id') vendorId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vendorsService.unlinkVehicle(orgId, vendorId, vehicleId);
  }
}
