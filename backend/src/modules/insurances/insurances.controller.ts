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
import { Roles } from '@shared/decorators/roles.decorator';
import { InsurancesService } from './insurances.service';

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
    return this.service.updateLiveSharing(id, {
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
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class InsurancesAdminController {
  constructor(private readonly service: InsurancesService) {}

  @Get('partners')
  async listPartners() {
    return this.service.listPartners();
  }

  @Post('partners')
  async createPartner(@Body() body: any) {
    return this.service.createPartner(body);
  }

  @Patch('partners/:id')
  async updatePartner(@Param('id') id: string, @Body() body: any) {
    return this.service.updatePartner(id, body);
  }

  @Post('partners/:id/test')
  async testPartner(@Param('id') id: string) {
    return this.service.testPartnerConnection(id);
  }

  @Get('partner-contacts')
  async listContacts(@Query('partnerId') partnerId?: string) {
    return this.service.listContacts(partnerId);
  }

  @Post('partner-contacts')
  async createContact(@Body() body: any) {
    return this.service.createContact(body);
  }

  @Patch('partner-contacts/:id')
  async updateContact(@Param('id') id: string, @Body() body: any) {
    return this.service.updateContact(id, body);
  }

  @Get('disclosure-templates')
  async listDisclosureTemplates(@Query() query: any) {
    return this.service.listDisclosureTemplates({
      insurerKey: query.insurerKey,
      isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
    });
  }

  @Post('disclosure-templates')
  async createDisclosureTemplate(@Body() body: any, @Req() req: any) {
    return this.service.createDisclosureTemplate({ ...body, createdById: req.user?.id });
  }

  @Patch('disclosure-templates/:id')
  async updateDisclosureTemplate(@Param('id') id: string, @Body() body: any) {
    return this.service.updateDisclosureTemplate(id, body);
  }

  @Get('inquiry-templates')
  async listInquiryTemplates(@Query() query: any) {
    return this.service.listInquiryTemplates({
      insurerKey: query.insurerKey,
      inquiryType: query.inquiryType,
    });
  }

  @Post('inquiry-templates')
  async createInquiryTemplate(@Body() body: any, @Req() req: any) {
    return this.service.createInquiryTemplate({ ...body, createdById: req.user?.id });
  }

  @Patch('inquiry-templates/:id')
  async updateInquiryTemplate(@Param('id') id: string, @Body() body: any) {
    return this.service.updateInquiryTemplate(id, body);
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
