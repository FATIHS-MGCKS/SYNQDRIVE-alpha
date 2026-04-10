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
import { PartsAccessoriesService } from './parts-accessories.service';

// ─── Organization-Facing Endpoints ───────────────────────────
@Controller('parts-accessories')
export class PartsAccessoriesController {
  constructor(private readonly service: PartsAccessoriesService) {}

  @Get('providers')
  async listProviders(@Req() req: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.listEnabledProviders(orgId);
  }

  @Get('providers/:key/disclosure')
  async getDisclosure(@Param('key') key: string, @Query('category') category?: string) {
    const disclosure = await this.service.getActiveDisclosure(key, category);
    if (!disclosure) return { disclosure: null };

    const fields = this.service.getDisclosureFields(key, category ?? 'PARTS');
    return { disclosure, disclosedFields: fields };
  }

  @Post('disclosures/confirm')
  async confirmDisclosure(@Req() req: any, @Body() body: {
    vehicleId: string;
    providerKey: string;
    category: string;
  }) {
    const orgId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!orgId || !userId) throw new BadRequestException('Auth context required');

    return this.service.confirmDisclosure({
      organizationId: orgId,
      userId,
      vehicleId: body.vehicleId,
      providerKey: body.providerKey,
      category: body.category,
      ipAddress: req.ip ?? req.headers?.['x-forwarded-for'],
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Post('search')
  async searchProducts(@Req() req: any, @Body() body: {
    vehicleId: string;
    providerKey: string;
    category: 'TIRES' | 'PARTS' | 'ACCESSORIES';
    correlationId: string;
    query?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    filters?: Record<string, string | string[]>;
  }) {
    const orgId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!orgId || !userId) throw new BadRequestException('Auth context required');

    return this.service.searchProducts({
      organizationId: orgId,
      userId,
      ...body,
    });
  }

  @Get('products/:providerKey/:externalId')
  async getProduct(
    @Param('providerKey') providerKey: string,
    @Param('externalId') externalId: string,
    @Query('vehicleId') vehicleId?: string,
    @Req() req?: any,
  ) {
    const orgId = req?.user?.organizationId;
    return this.service.getProductDetail(providerKey, externalId, vehicleId, orgId);
  }

  @Get('vehicles/fitment/:vehicleId')
  async getVehicleFitment(@Param('vehicleId') vehicleId: string, @Req() req: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.buildFitmentContext(vehicleId, orgId);
  }

  @Get('authorization-logs')
  async getOrgAuthLogs(@Req() req: any, @Query() query: any) {
    const orgId = req.user?.organizationId;
    if (!orgId) throw new BadRequestException('Organization context required');
    return this.service.getAuthorizationLogs({
      organizationId: orgId,
      providerKey: query.providerKey,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }
}

// ─── Master Admin Endpoints ──────────────────────────────────
@Controller('admin/parts-accessories')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class PartsAccessoriesAdminController {
  constructor(private readonly service: PartsAccessoriesService) {}

  @Get('providers')
  async listProviders() {
    return this.service.listProviders();
  }

  @Post('providers')
  async createProvider(@Body() body: any) {
    return this.service.createProvider(body);
  }

  @Patch('providers/:id')
  async updateProvider(@Param('id') id: string, @Body() body: any) {
    return this.service.updateProvider(id, body);
  }

  @Post('providers/:id/test')
  async testConnection(@Param('id') id: string) {
    return this.service.testProviderConnection(id);
  }

  @Get('disclosures')
  async listDisclosures(@Query() query: any) {
    return this.service.listDisclosures({
      providerKey: query.providerKey,
      isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
    });
  }

  @Post('disclosures')
  async createDisclosure(@Body() body: any, @Req() req: any) {
    return this.service.createDisclosure({ ...body, createdById: req.user?.id });
  }

  @Patch('disclosures/:id')
  async updateDisclosure(@Param('id') id: string, @Body() body: any) {
    return this.service.updateDisclosure(id, body);
  }

  @Get('authorization-logs')
  async getAuthLogs(@Query() query: any) {
    return this.service.getAuthorizationLogs({
      organizationId: query.organizationId,
      userId: query.userId,
      vehicleId: query.vehicleId,
      providerKey: query.providerKey,
      category: query.category,
      executionStatus: query.executionStatus,
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
