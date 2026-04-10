import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PaginationParams } from '@shared/utils/pagination';

@Controller('organizations/:orgId/rental-driving-analyses')
@UseGuards(RolesGuard)
export class RentalDrivingAnalysisController {
  constructor(private readonly service: RentalDrivingAnalysisService) {}

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll(orgId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      vehicleId,
      driverId,
      from,
      to,
    });
  }

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.findById(orgId, id);
  }
}
