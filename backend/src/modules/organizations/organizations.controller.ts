import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsOperationalService } from './organizations-operational.service';
import type { OrganizationOperationalQueryDto } from './organizations-operational.types';
import { PaymentsAccessService } from '@modules/payments/payments-access.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { AdminCreateOrganizationDto } from './dto/admin-create-organization.dto';
import { AdminUpdateOrganizationDto } from './dto/admin-update-organization.dto';
import { CreateOrgAdminDto } from '@shared/dto/organization.dto';

@Controller('admin/organizations')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
@Roles('MASTER_ADMIN')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationsOperational: OrganizationsOperationalService,
    private readonly paymentsAccessService: PaymentsAccessService,
  ) {}

  @Get('operational')
  async findAllOperational(@Query() query: OrganizationOperationalQueryDto) {
    return this.organizationsOperational.findAllOperational(query);
  }

  @Get(':id/connectivity-summary')
  async getConnectivitySummary(@Param('id') id: string) {
    return this.organizationsOperational.getOrganizationConnectivitySummary(id);
  }

  @Get(':id/operational')
  async getOperationalDetail(@Param('id') id: string) {
    return this.organizationsOperational.getOperationalDetail(id);
  }

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
  async create(@Body() body: AdminCreateOrganizationDto, @Req() req: { user?: { id?: string } }) {
    return this.organizationsService.create(body, {
      actorUserId: req.user?.id ?? null,
    });
  }

  @Post(':id/admin')
  async createAdmin(
    @Param('id') id: string,
    @Body() body: CreateOrgAdminDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.organizationsService.createOrgAdmin(id, body, {
      actorUserId: req.user?.id ?? null,
    });
  }

  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    return this.organizationsService.getOrganizationStats(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Patch(':id/payments-enabled')
  async setPaymentsEnabled(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.paymentsAccessService.setPaymentsEnabled(id, body.enabled === true);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: AdminUpdateOrganizationDto) {
    return this.organizationsService.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.organizationsService.delete(id);
  }
}
