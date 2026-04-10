import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ServicePartnersService } from './service-partners.service';
import { EuromasterService, EuromasterAppointmentRequest } from './euromaster.service';
import { EuromasterIntegrationService } from './euromaster/euromaster-integration.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { ServiceCaseStatus, ServiceCaseType } from '@prisma/client';

@Controller('organizations/:orgId/service-partners')
@UseGuards(RolesGuard)
export class ServicePartnersController {
  constructor(
    private readonly service: ServicePartnersService,
    private readonly euromaster: EuromasterService,
    private readonly euromasterIntegration: EuromasterIntegrationService,
  ) {}

  @Get()
  async getPartners() {
    return this.service.findAllPartners();
  }

  @Get('assignments')
  async getAssignments(@Param('orgId') orgId: string) {
    return this.service.getAssignmentsForOrg(orgId);
  }

  @Post('assignments/:partnerId')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async assignPartner(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
    @Body() body: { mode?: string },
  ) {
    return this.service.assignPartnerToOrg(orgId, partnerId, (body.mode as any) ?? 'MANUAL_ONLY');
  }

  @Patch('assignments/:partnerId')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async updateAssignment(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
    @Body() body: { status?: string; mode?: string; enabledFeatures?: string[]; configJson?: Record<string, unknown>; credentials?: Record<string, unknown> },
  ) {
    return this.service.updateAssignment(orgId, partnerId, body as any);
  }

  @Delete('assignments/:partnerId')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async removeAssignment(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
  ) {
    return this.service.removeAssignment(orgId, partnerId);
  }

  // ---- Data Authorization ----

  @Get('data-auth/:partnerId')
  async getDataAuth(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
  ) {
    const auth = await this.service.getDataAuth(orgId, partnerId);
    if (!auth) {
      const partner = await this.service.getPartnerById(partnerId);
      return {
        status: 'NOT_CONFIGURED',
        defaultScopes: partner ? this.service.getDefaultScopes(partner.provider) : [],
      };
    }
    return auth;
  }

  @Post('data-auth/:partnerId/grant')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async grantDataAuth(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
    @Body() body: { scopes: string[]; grantedBy: string; notes?: string },
  ) {
    return this.service.grantDataAuth(orgId, partnerId, body.scopes, body.grantedBy, body.notes);
  }

  @Post('data-auth/:partnerId/revoke')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async revokeDataAuth(
    @Param('orgId') orgId: string,
    @Param('partnerId') partnerId: string,
  ) {
    return this.service.revokeDataAuth(orgId, partnerId);
  }

  // ---- Service Cases ----

  @Get('cases')
  async getCases(
    @Param('orgId') orgId: string,
    @Query('partnerId') partnerId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getServiceCases(orgId, {
      partnerId,
      vehicleId,
      status: status as ServiceCaseStatus | undefined,
    });
  }

  @Get('cases/:caseId')
  async getCaseById(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
  ) {
    return this.service.getServiceCaseById(orgId, caseId);
  }

  @Post('cases')
  async createCase(
    @Param('orgId') orgId: string,
    @Body() body: {
      partnerId: string;
      vehicleId?: string;
      type: string;
      title: string;
      description?: string;
      scheduledAt?: string;
      createdBy?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.service.createServiceCase(orgId, {
      ...body,
      type: (body.type as ServiceCaseType) ?? 'MAINTENANCE',
    });
  }

  @Patch('cases/:caseId/status')
  async updateCaseStatus(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: { status: string; note?: string },
  ) {
    return this.service.updateServiceCaseStatus(orgId, caseId, body.status as ServiceCaseStatus, body.note);
  }

  // ---- Euromaster integration ----

  @Get('euromaster/access')
  async getEuromasterAccess(@Param('orgId') orgId: string) {
    return this.euromaster.validateAccess(orgId);
  }

  @Post('euromaster/appointment')
  async requestEuromasterAppointment(
    @Param('orgId') orgId: string,
    @Body() body: EuromasterAppointmentRequest & { createdBy?: string; vehicleId?: string },
  ) {
    return this.euromasterIntegration.createAppointment({
      organizationId: orgId,
      vehicleId: body.vehicleId,
      vehiclePlate: body.vehiclePlate,
      vehicleVin: body.vehicleVin,
      vehicleMake: body.vehicleMake,
      vehicleModel: body.vehicleModel,
      mileageKm: body.mileageKm,
      serviceType: body.serviceType,
      preferredDate: body.preferredDate,
      branchId: body.preferredStationId,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      contactEmail: body.contactEmail,
      notes: body.notes,
      createdBy: body.createdBy,
    });
  }

  @Post('euromaster/tire-service')
  async requestTireService(
    @Param('orgId') orgId: string,
    @Body() body: {
      vehicleId?: string;
      vehiclePlate: string;
      vehicleVin?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      mileageKm?: number;
      preferredDate?: string;
      notes?: string;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
      createdBy?: string;
    },
  ) {
    return this.euromasterIntegration.createTireServiceRequest({
      organizationId: orgId,
      ...body,
      serviceType: 'TIRE_SERVICE',
    });
  }

  @Get('euromaster/branches')
  async searchBranches(
    @Param('orgId') orgId: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('postalCode') postalCode?: string,
    @Query('radius') radius?: string,
  ) {
    return this.euromasterIntegration.searchNearbyBranches(
      orgId,
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
      postalCode,
      radius ? parseInt(radius, 10) : 30,
    );
  }

  @Post('euromaster/cases/:caseId/sync')
  async syncCaseStatus(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
  ) {
    return this.euromasterIntegration.syncExternalStatus(orgId, caseId);
  }
}
