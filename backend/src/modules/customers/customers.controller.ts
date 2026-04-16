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
import { CustomersService } from './customers.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PaginationParams } from '@shared/utils/pagination';
import { Prisma } from '@prisma/client';

@Controller('organizations/:orgId/customers')
@UseGuards(OrgScopingGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.customersService.getCustomerStats(orgId);
  }

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: PaginationParams,
  ) {
    return this.customersService.findAll(orgId, query);
  }

  @Get(':id')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.customersService.findById(orgId, id);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: Omit<Prisma.CustomerCreateInput, 'organization'>,
  ) {
    return this.customersService.create(orgId, body);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Prisma.CustomerUpdateInput,
  ) {
    return this.customersService.update(orgId, id, body);
  }

  @Delete(':id')
  async remove(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.customersService.softDelete(orgId, id);
  }
}
