import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ServicePartnersService } from './service-partners.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { ServicePartnerGlobalStatus, ServicePartnerProvider } from '@prisma/client';

@Controller('admin/service-partners')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class ServicePartnersAdminController {
  constructor(private readonly service: ServicePartnersService) {}

  @Get()
  async getPartners() {
    return this.service.findAllPartners();
  }

  @Get('stats')
  async getStats() {
    return this.service.getAdminStats();
  }

  @Get('detail/:provider')
  async getPartnerDetail(@Param('provider') provider: string) {
    return this.service.getPartnerDetailAdmin(provider.toUpperCase() as ServicePartnerProvider);
  }

  @Patch(':provider')
  async updatePartner(
    @Param('provider') provider: string,
    @Body() body: { globalStatus?: string; apiBaseUrl?: string; description?: string },
  ) {
    return this.service.updatePartner(
      provider.toUpperCase() as any,
      { ...body, globalStatus: body.globalStatus as ServicePartnerGlobalStatus | undefined },
    );
  }

  @Get('assignments')
  async getAllAssignments() {
    return this.service.getAllAssignments();
  }

  @Post('assignments/:orgId/:partnerId')
  async adminAssign(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
    @Body() body: { mode?: string },
  ) {
    return this.service.assignPartnerToOrg(orgId, partnerId, (body.mode as any) ?? 'MANUAL_ONLY');
  }

  @Patch('assignments/:orgId/:partnerId')
  async adminUpdateAssignment(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
    @Body() body: { status?: string; mode?: string; enabledFeatures?: string[] },
  ) {
    return this.service.adminUpdateAssignment(orgId, partnerId, body);
  }

  @Get('data-authorizations')
  async getAllDataAuthorizations() {
    return this.service.getAllDataAuthorizations();
  }

  @Post('data-authorizations/:orgId/:partnerId/grant')
  async adminGrantAuth(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
    @Body() body: { scopes: string[]; grantedBy: string; notes?: string },
  ) {
    return this.service.adminGrantDataAuth(orgId, partnerId, body.scopes, body.grantedBy, body.notes);
  }

  @Delete('data-authorizations/:orgId/:partnerId')
  async adminRevokeAuth(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
  ) {
    return this.service.adminRevokeDataAuth(orgId, partnerId);
  }

  @Get('auth-summary/:partnerId')
  async getAuthSummary(@Param('partnerId') partnerId: string) {
    return this.service.getAuthorizationSummaryAdmin(partnerId);
  }

  @Get('cases')
  async getRecentCases(@Query('limit') limit?: string) {
    return this.service.getRecentCasesAdmin(limit ? parseInt(limit, 10) : 20);
  }

  @Post('seed')
  async seedPartners() {
    await this.service.ensureSeedPartners();
    return { ok: true };
  }
}
