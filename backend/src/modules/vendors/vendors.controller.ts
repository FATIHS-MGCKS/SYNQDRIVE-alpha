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
import type { Request } from 'express';
import { VendorsService } from './vendors.service';
import { VendorMapboxService } from './vendor-mapbox.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  CreateVendorDto,
  UpdateVendorDto,
  LinkVendorVehicleDto,
  UpdateVendorVehicleLinkDto,
  VendorMapboxSearchQueryDto,
  VendorMapboxRetrieveQueryDto,
} from './dto';

/**
 * Vendor management — the single source of truth for an organization's external
 * service providers (workshops, tire/body/glass shops, insurers, appraisers,
 * towing, dealerships, OEM service, parts suppliers, ...).
 *
 * Authorization is permission-based (no hardcoded roles): OrgScopingGuard
 * enforces tenancy, PermissionsGuard enforces the `vendor-management` capability
 * that ORG_ADMINs grant per employee. Mutations are audited.
 */
const VENDOR_MODULE = 'vendor-management';

@Controller('organizations/:orgId/vendors')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly mapbox: VendorMapboxService,
  ) {}

  // ── static routes (declared before :id) ──────────────────────────────────────

  @Get('stats')
  @RequirePermission(VENDOR_MODULE, 'read')
  async getStats(@Param('orgId') orgId: string) {
    return this.vendorsService.getStats(orgId);
  }

  @Get('search/mapbox')
  @RequirePermission(VENDOR_MODULE, 'read')
  async searchMapbox(@Query() query: VendorMapboxSearchQueryDto) {
    return this.mapbox.search(query.query, {
      country: query.country,
      limit: query.limit,
    });
  }

  @Get('search/mapbox/:mapboxId')
  @RequirePermission(VENDOR_MODULE, 'read')
  async retrieveMapbox(
    @Param('mapboxId') mapboxId: string,
    @Query() query: VendorMapboxRetrieveQueryDto,
  ) {
    return this.mapbox.retrieve(mapboxId, query.sessionToken);
  }

  @Get()
  @RequirePermission(VENDOR_MODULE, 'read')
  async findAll(@Param('orgId') orgId: string) {
    return this.vendorsService.findAll(orgId);
  }

  // ── single vendor sub-resources ──────────────────────────────────────────────

  @Get(':id/invoices')
  @RequirePermission(VENDOR_MODULE, 'read')
  async getInvoices(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.vendorsService.getInvoices(orgId, id);
  }

  @Get(':id/audit')
  @RequirePermission(VENDOR_MODULE, 'read')
  async getAudit(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.vendorsService.getAudit(orgId, id);
  }

  @Get(':id/documents')
  @RequirePermission(VENDOR_MODULE, 'read')
  async getDocuments(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.vendorsService.getDocuments(orgId, id);
  }

  @Get(':id/service-history')
  @RequirePermission(VENDOR_MODULE, 'read')
  async getServiceHistory(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.vendorsService.getServiceHistory(orgId, id);
  }

  @Get(':id')
  @RequirePermission(VENDOR_MODULE, 'read')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.vendorsService.findById(orgId, id);
  }

  // ── mutations ─────────────────────────────────────────────────────────────────

  @Post()
  @RequirePermission(VENDOR_MODULE, 'write')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateVendorDto,
    @Req() req: Request,
  ) {
    return this.vendorsService.create(
      orgId,
      dto,
      AuditService.contextFromRequest(req),
    );
  }

  @Patch(':id')
  @RequirePermission(VENDOR_MODULE, 'write')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
    @Req() req: Request,
  ) {
    return this.vendorsService.update(
      orgId,
      id,
      dto,
      AuditService.contextFromRequest(req),
    );
  }

  @Delete(':id')
  @RequirePermission(VENDOR_MODULE, 'write')
  async remove(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.vendorsService.remove(
      orgId,
      id,
      AuditService.contextFromRequest(req),
    );
  }

  // ── vehicle links (managed independently of master data) ──────────────────────

  @Post(':id/vehicles')
  @RequirePermission(VENDOR_MODULE, 'write')
  async linkVehicle(
    @Param('orgId') orgId: string,
    @Param('id') vendorId: string,
    @Body() dto: LinkVendorVehicleDto,
    @Req() req: Request,
  ) {
    return this.vendorsService.linkVehicle(
      orgId,
      vendorId,
      dto,
      AuditService.contextFromRequest(req),
    );
  }

  @Patch(':id/vehicles/:linkId')
  @RequirePermission(VENDOR_MODULE, 'write')
  async updateLink(
    @Param('orgId') orgId: string,
    @Param('id') vendorId: string,
    @Param('linkId') linkId: string,
    @Body() dto: UpdateVendorVehicleLinkDto,
    @Req() req: Request,
  ) {
    return this.vendorsService.updateLink(
      orgId,
      vendorId,
      linkId,
      dto,
      AuditService.contextFromRequest(req),
    );
  }

  @Delete(':id/vehicles/:linkId')
  @RequirePermission(VENDOR_MODULE, 'write')
  async unlinkVehicle(
    @Param('orgId') orgId: string,
    @Param('id') vendorId: string,
    @Param('linkId') linkId: string,
    @Req() req: Request,
  ) {
    return this.vendorsService.unlinkVehicle(
      orgId,
      vendorId,
      linkId,
      AuditService.contextFromRequest(req),
    );
  }
}
