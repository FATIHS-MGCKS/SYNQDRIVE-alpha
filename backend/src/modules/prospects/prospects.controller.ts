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
  Req,
} from '@nestjs/common';
import { ProspectsService } from './prospects.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { PaginationParams } from '@shared/utils/pagination';
import { ProspectStatus, ProspectPriority, BusinessType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  catalogMutationFieldNames,
  MasterCatalogAdminAuditService,
  type CatalogAdminAuditRequest,
} from '@modules/activity-log/master-catalog-admin-audit.service';

type AuthedRequest = CatalogAdminAuditRequest;

@Controller('admin/prospects')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS)
@Roles('MASTER_ADMIN')
export class ProspectsController {
  constructor(
    private readonly prospectsService: ProspectsService,
    private readonly catalogAudit: MasterCatalogAdminAuditService,
  ) {}

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
  async create(@Body() body: Prisma.ProspectCreateInput, @Req() req: AuthedRequest) {
    const created = await this.prospectsService.create(body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'PROSPECT',
      operation: 'CREATE',
      resource: 'prospect',
      entityId: created.id,
    });
    return created;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Prisma.ProspectUpdateInput,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.prospectsService.update(id, body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'PROSPECT',
      operation: 'UPDATE',
      resource: 'prospect',
      entityId: updated.id,
      updatedFieldNames: catalogMutationFieldNames(body),
    });
    return updated;
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: AuthedRequest) {
    const deleted = await this.prospectsService.delete(id);
    this.catalogAudit.recordMutation({
      req,
      domain: 'PROSPECT',
      operation: 'DELETE',
      resource: 'prospect',
      entityId: deleted.id,
    });
    return deleted;
  }

  @Post('import')
  async import(@Body() body: Prisma.ProspectCreateInput[], @Req() req: AuthedRequest) {
    const result = await this.prospectsService.import(body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'PROSPECT',
      operation: 'IMPORT',
      resource: 'prospect_batch',
      entityId: 'prospect_import',
      extraMetadata: { importCount: result.count },
    });
    return result;
  }

  @Post(':id/convert')
  async convertToOrganization(@Param('id') id: string, @Req() req: AuthedRequest) {
    const result = await this.prospectsService.convertToOrganization(id);
    this.catalogAudit.recordMutation({
      req,
      domain: 'PROSPECT',
      operation: 'CONVERT',
      resource: 'prospect',
      entityId: id,
      targetOrganizationId: result.organizationId,
      extraMetadata: { convertedOrganizationId: result.organizationId },
    });
    return result;
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