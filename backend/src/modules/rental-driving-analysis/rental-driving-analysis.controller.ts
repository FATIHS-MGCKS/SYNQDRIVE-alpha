import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PaginationParams } from '@shared/utils/pagination';

@Controller('organizations/:orgId/rental-driving-analyses')
@UseGuards(OrgScopingGuard, RolesGuard)
export class RentalDrivingAnalysisController {
  constructor(private readonly service: RentalDrivingAnalysisService) {}

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('driverId') driverId?: string,
    @Query('bookingId') bookingId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // V4.6.95 — `bookingId` filter is required for the per-booking
    // "Booking Driving Analysis" card in BookingsView. The same endpoint
    // is reused so we don't grow the API surface area.
    return this.service.findAll(orgId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      vehicleId,
      driverId,
      bookingId,
      from,
      to,
    });
  }

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.findById(orgId, id);
  }
}
