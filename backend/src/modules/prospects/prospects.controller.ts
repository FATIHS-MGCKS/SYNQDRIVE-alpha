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
import { ProspectsService } from './prospects.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PaginationParams } from '@shared/utils/pagination';
import { ProspectStatus, ProspectPriority, BusinessType } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Controller('admin/prospects')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Get()
  async findAll(
    @Query() query: PaginationParams & { status?: ProspectStatus; priority?: ProspectPriority; businessType?: BusinessType },
  ) {
    return this.prospectsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.prospectsService.findById(id);
  }

  @Post()
  async create(@Body() body: Prisma.ProspectCreateInput) {
    return this.prospectsService.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Prisma.ProspectUpdateInput,
  ) {
    return this.prospectsService.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.prospectsService.delete(id);
  }

  @Post('import')
  async import(@Body() body: Prisma.ProspectCreateInput[]) {
    return this.prospectsService.import(body);
  }

  @Post(':id/convert')
  async convertToOrganization(@Param('id') id: string) {
    return this.prospectsService.convertToOrganization(id);
  }

  @Get(':id/activity')
  async getActivityLog(@Param('id') id: string) {
    const prospect = await this.prospectsService.findById(id);
    if (!prospect) return null;
    return { lastContactedAt: prospect.lastContactedAt, notes: prospect.notes };
  }

  @Get(':id/contacts')
  async getContacts(@Param('id') id: string) {
    const prospect = await this.prospectsService.findById(id);
    if (!prospect) return null;
    return {
      contactName: prospect.contactName,
      email: prospect.email,
      phone: prospect.phone,
    };
  }
}
