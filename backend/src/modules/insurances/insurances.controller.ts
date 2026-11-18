import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import { InsurancesService } from './insurances.service';
import {
  catalogMutationFieldNames,
  MasterCatalogAdminAuditService,
  type CatalogAdminAuditRequest,
} from '@modules/activity-log/master-catalog-admin-audit.service';

type AdminAuthedRequest = CatalogAdminAuditRequest;

// ─── Organization-Facing Endpoints ───────────────────────────
@Controller('insurances')
export class InsurancesController {
  constructor(private readonly service: InsurancesService) {}

  @Get('overview')
  async getOverview(@Req() req: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.getFleetInsuranceOverview(orgId);
  }

  @Get('vehicles/:vehicleId')
  async getVehicleInsurance(@Param('vehicleId') vehicleId: string, @Req() req: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.getVehicleInsurance(vehicleId, orgId);
  }

  @Get('partners')
  async listPartners(@Req() req: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.listEnabledPartners(orgId);
  }

  @Post('inquiries')
  async submitInquiry(@Req() req: any, @Body() body: any) {
    const orgId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!orgId || !userId) throw new BadRequestException('Auth context required');
    return this.service.submitInquiry({
      organizationId: orgId,
      userId,
      vehicleId: body.vehicleId,
      inquiryType: body.inquiryType,
      selectedInsurerIds: body.selectedInsurerIds,
      selectedHistoricalData: body.selectedHistoricalData ?? {},
      selectedLiveData: body.selectedLiveData ?? {},
      selectedTimeRange: body.selectedTimeRange,
      selectedInsuranceModels: body.selectedInsuranceModels ?? [],
      ipAddress: req.ip ?? req.headers?.['x-forwarded-for'],
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Get('inquiries')
  async listInquiries(@Req() req: any, @Query() query: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.listInquiries({
      organizationId: orgId,
      vehicleId: query.vehicleId,
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }

  @Get('inquiries/:id')
  async getInquiry(@Param('id') id: string, @Req() req: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.getInquiry(id, orgId);
  }

  @Post('live-sharing')
  async createLiveSharing(@Req() req: any, @Body() body: any) {
    const orgId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!orgId || !userId) throw new BadRequestException('Auth context required');
    return this.service.submitInquiry({
      organizationId: orgId,
      userId,
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Patch('live-sharing/:id')
  async updateLiveSharing(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.updateLiveSharing(id, orgId, {
      status: body.status,
      revokedBy: req.user?.id,
      revokeReason: body.revokeReason,
    });
  }

  @Get('live-sharing')
  async listLiveSharing(@Req() req: any, @Query() query: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.listLiveSharingPermissions({
      organizationId: orgId,
      vehicleId: query.vehicleId,
      status: query.status,
    });
  }

  @Get('documents-missing')
  async getMissingDocs(@Req() req: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.getMissingInsuranceDocs(orgId);
  }

  @Get('disclosure')
  async getDisclosure(@Query('insurerKey') insurerKey?: string, @Query('inquiryType') inquiryType?: string) {
    return this.service.getActiveDisclosure(insurerKey, inquiryType);
  }
}

// ─── Master Admin Endpoints ──────────────────────────────────
@Controller('admin/insurances')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS)
@Roles('MASTER_ADMIN')
export class InsurancesAdminController {
  constructor(
    private readonly service: InsurancesService,
    private readonly catalogAudit: MasterCatalogAdminAuditService,
  ) {}

  @Get('partners')
  async listPartners() {
    return this.service.listPartners();
  }

  @Post('partners')
  async createPartner(@Body() body: any, @Req() req: AdminAuthedRequest) {
    const created = await this.service.createPartner(body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'CREATE',
      resource: 'insurance_partner',
      entityId: created.id,
    });
    return created;
  }

  @Patch('partners/:id')
  async updatePartner(@Param('id') id: string, @Body() body: any, @Req() req: AdminAuthedRequest) {
    const updated = await this.service.updatePartner(id, body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'UPDATE',
      resource: 'insurance_partner',
      entityId: updated.id,
      updatedFieldNames: catalogMutationFieldNames(body),
    });
    return updated;
  }

  @Post('partners/:id/test')
  async testPartner(@Param('id') id: string, @Req() req: AdminAuthedRequest) {
    const result = await this.service.testPartnerConnection(id);
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'CONNECTION_TEST',
      resource: 'insurance_partner',
      entityId: id,
      outcome: result.success ? 'TEST_SUCCEEDED' : 'TEST_FAILED',
    });
    return result;
  }

  @Get('partner-contacts')
  async listContacts(@Query('partnerId') partnerId?: string) {
    return this.service.listContacts(partnerId);
  }

  @Post('partner-contacts')
  async createContact(@Body() body: any, @Req() req: AdminAuthedRequest) {
    const created = await this.service.createContact(body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'CREATE',
      resource: 'insurance_partner_contact',
      entityId: created.id,
      extraMetadata: { insurancePartnerId: created.insurancePartnerId ?? null },
    });
    return created;
  }

  @Patch('partner-contacts/:id')
  async updateContact(@Param('id') id: string, @Body() body: any, @Req() req: AdminAuthedRequest) {
    const updated = await this.service.updateContact(id, body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'UPDATE',
      resource: 'insurance_partner_contact',
      entityId: updated.id,
      updatedFieldNames: catalogMutationFieldNames(body),
    });
    return updated;
  }

  @Get('disclosure-templates')
  async listDisclosureTemplates(@Query() query: any) {
    return this.service.listDisclosureTemplates({
      insurerKey: query.insurerKey,
      isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
    });
  }

  @Post('disclosure-templates')
  async createDisclosureTemplate(@Body() body: any, @Req() req: AdminAuthedRequest) {
    const created = await this.service.createDisclosureTemplate({
      ...body,
      createdById: req.user?.id,
    });
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'CREATE',
      resource: 'insurance_disclosure_template',
      entityId: created.id,
    });
    return created;
  }

  @Patch('disclosure-templates/:id')
  async updateDisclosureTemplate(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: AdminAuthedRequest,
  ) {
    const updated = await this.service.updateDisclosureTemplate(id, body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'UPDATE',
      resource: 'insurance_disclosure_template',
      entityId: updated.id,
      updatedFieldNames: catalogMutationFieldNames(body),
    });
    return updated;
  }

  @Get('inquiry-templates')
  async listInquiryTemplates(@Query() query: any) {
    return this.service.listInquiryTemplates({
      insurerKey: query.insurerKey,
      inquiryType: query.inquiryType,
    });
  }

  @Post('inquiry-templates')
  async createInquiryTemplate(@Body() body: any, @Req() req: AdminAuthedRequest) {
    const created = await this.service.createInquiryTemplate({
      ...body,
      createdById: req.user?.id,
    });
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'CREATE',
      resource: 'insurance_inquiry_template',
      entityId: created.id,
    });
    return created;
  }

  @Patch('inquiry-templates/:id')
  async updateInquiryTemplate(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: AdminAuthedRequest,
  ) {
    const updated = await this.service.updateInquiryTemplate(id, body);
    this.catalogAudit.recordMutation({
      req,
      domain: 'INSURANCE',
      operation: 'UPDATE',
      resource: 'insurance_inquiry_template',
      entityId: updated.id,
      updatedFieldNames: catalogMutationFieldNames(body),
    });
    return updated;
  }

  @Get('inquiries')
  async listInquiries(@Query() query: any) {
    return this.service.listInquiries({
      organizationId: query.organizationId,
      vehicleId: query.vehicleId,
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }

  @Get('authorization-logs')
  async getAuthLogs(@Query() query: any) {
    return this.service.getAuthorizationLogs({
      organizationId: query.organizationId,
      userId: query.userId,
      vehicleId: query.vehicleId,
      insurerId: query.insurerId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }

  @Get('health')
  async getHealth() {
    return this.service.getHealthOverview();
  }
}
