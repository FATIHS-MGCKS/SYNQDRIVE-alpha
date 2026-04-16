import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { StationsService } from './stations.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

@Controller('organizations/:orgId/stations')
@UseGuards(OrgScopingGuard, RolesGuard)
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.stationsService.findAll(orgId);
  }

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.stationsService.getStationStats(orgId);
  }

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.findOne(orgId, id);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: { name: string; address?: string; city?: string; country?: string; [key: string]: unknown },
  ) {
    return this.stationsService.create(orgId, body);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { name?: string; address?: string; city?: string; country?: string; [key: string]: unknown },
  ) {
    return this.stationsService.update(orgId, id, body);
  }

  @Delete(':id')
  async delete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.stationsService.delete(orgId, id);
  }
}
