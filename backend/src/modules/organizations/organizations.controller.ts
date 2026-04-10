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
import { OrganizationsService } from './organizations.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';

@Controller('admin/organizations')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async findAll(
    @Query()
    query: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    },
  ) {
    return this.organizationsService.findAll(query);
  }

  @Post()
  async create(
    @Body()
    body: Record<string, unknown>,
  ) {
    return this.organizationsService.create(body);
  }

  @Post(':id/admin')
  async createAdmin(
    @Param('id') id: string,
    @Body()
    body: { name: string; email: string; password: string },
  ) {
    return this.organizationsService.createOrgAdmin(id, body);
  }

  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    return this.organizationsService.getOrganizationStats(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Record<string, unknown>,
  ) {
    return this.organizationsService.update(id, body as any);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.organizationsService.delete(id);
  }
}
