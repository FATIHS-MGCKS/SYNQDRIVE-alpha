import {

  Controller,

  Get,

  Post,

  Put,

  Patch,

  Body,

  Param,

  Query,

  Req,

  UseGuards,

  NotFoundException,

} from '@nestjs/common';

import { BillingService } from './billing.service';

import { PricebookService } from './pricebook.service';

import { BillingUsageService } from './billing-usage.service';

import { BillingAdminService } from './billing-admin.service';

import { BillingSummaryService } from './billing-summary.service';

import { BillableVehiclesService } from './billable-vehicles.service';

import { StripePreparedService } from './stripe-prepared.service';

import { RolesGuard } from '@shared/auth/roles.guard';

import { PermissionsGuard } from '@shared/auth/permissions.guard';

import { RequirePermission } from '@shared/decorators/require-permission.decorator';

import { Roles } from '@shared/decorators/roles.decorator';

import { PaginationParams } from '@shared/utils/pagination';

import { resolveOrgScope } from './billing-scope.util';

import {

  AdminInvoiceQueryDto,

  AuditLogQueryDto,

  CreatePriceBookDto,

  CreatePriceVersionDto,

  CreateSubscriptionDto,

  PatchPriceVersionDto,

  PublishPriceVersionDto,

  ReplaceTiersDto,

} from './dto/billing.dto';



@Controller()

@UseGuards(RolesGuard, PermissionsGuard)

export class BillingController {

  constructor(

    private readonly billingService: BillingService,

    private readonly pricebookService: PricebookService,

    private readonly usageService: BillingUsageService,

    private readonly adminService: BillingAdminService,

    private readonly summaryService: BillingSummaryService,

    private readonly billableVehiclesService: BillableVehiclesService,

    private readonly stripePreparedService: StripePreparedService,

  ) {}



  // ── Tenant billing ───────────────────────────────────────────────────────



  @Get('billing/summary')

  @RequirePermission('billing', 'read')

  async getBillingSummary(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.summaryService.getSummary(scoped);

  }



  @Get('billing/billable-vehicles')

  @RequirePermission('billing', 'read')

  async getBillableVehicles(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    const result =

      await this.billableVehiclesService.getBillableConnectedVehiclesForOrganization(scoped);

    return {

      connectedVehicleCount: result.connectedVehicleCount,

      billableVehicleCount: result.billableVehicleCount,

      billableVehicles: result.billableVehicles,

      excludedVehicles: result.excludedVehicles,

      counts: {

        connected: result.connectedVehicleCount,

        billable: result.billableVehicleCount,

        excluded: result.excludedVehicles.length,

      },

    };

  }



  @Get('billing/next-invoice-preview')

  @RequirePermission('billing', 'read')

  async getNextInvoicePreview(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.summaryService.getNextInvoicePreview(scoped);

  }



  @Get('billing/subscriptions')

  @RequirePermission('billing', 'read')

  async findSubscriptions(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.billingService.findSubscription(scoped);

  }



  @Get('billing/invoices')

  @RequirePermission('billing', 'read')

  async findInvoices(

    @Query('orgId') orgId: string | undefined,

    @Query() query: PaginationParams,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.billingService.findInvoices(scoped, query);

  }



  @Get('billing/subscriptions/:id')

  @RequirePermission('billing', 'read')

  async findSubscriptionById(@Param('id') id: string, @Req() req: any) {

    const sub = await this.billingService.findSubscriptionById(id);

    if (!sub) throw new NotFoundException('Subscription not found');

    const user = req?.user;

    if (user?.platformRole !== 'MASTER_ADMIN') {

      const jwtOrg: string | undefined = user?.organizationId;

      if (!jwtOrg || (sub as any).organizationId !== jwtOrg) {

        throw new NotFoundException('Subscription not found');

      }

    }

    return sub;

  }



  @Post('billing/subscriptions')

  @Roles('MASTER_ADMIN')

  async createSubscription(

    @Body() body: CreateSubscriptionDto,

    @Req() req: any,

  ) {

    return this.billingService.createSubscription(

      body.orgId,

      body.stripeCustomerId,

      body.stripeSubscriptionId,

      req?.user?.id,

    );

  }



  @Get('billing/usage/preview')

  @RequirePermission('billing', 'read')

  async previewUsage(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.usageService.previewUsage(scoped);

  }



  @Get('billing/usage/snapshots')

  @RequirePermission('billing', 'read')

  async listUsageSnapshots(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.usageService.listUsageSnapshots(scoped);

  }



  @Get('billing/payment-methods')

  @RequirePermission('billing', 'read')

  async listPaymentMethods(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.billingService.findPaymentMethods(scoped);

  }



  @Get('billing/payment-method')

  @RequirePermission('billing', 'read')

  async getDefaultPaymentMethod(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.stripePreparedService.getDefaultPaymentMethod(scoped);

  }



  @Post('billing/stripe/customer-portal')

  @RequirePermission('billing', 'write')

  async createCustomerPortal(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.stripePreparedService.createCustomerPortalSession(scoped);

  }



  @Post('billing/stripe/setup-intent')

  @RequirePermission('billing', 'write')

  async createSetupIntent(

    @Query('orgId') orgId: string | undefined,

    @Req() req: any,

  ) {

    const scoped = resolveOrgScope(req?.user, orgId);

    return this.stripePreparedService.createSetupIntent(scoped);

  }



  // ── Master Admin ─────────────────────────────────────────────────────────



  @Get('admin/billing/overview')

  @Roles('MASTER_ADMIN')

  async getAdminOverview() {

    return this.adminService.getOverview();

  }



  @Get('admin/billing/organizations')

  @Roles('MASTER_ADMIN')

  async listOrganizationsBilling() {

    return this.adminService.listOrganizationsBilling();

  }



  @Post('admin/billing/organizations/:orgId/sync-stripe')

  @Roles('MASTER_ADMIN')

  async syncOrganizationStripe(@Param('orgId') orgId: string) {

    return this.stripePreparedService.syncOrganizationStripe(orgId);

  }



  @Get('admin/billing/invoices')

  @Roles('MASTER_ADMIN')

  async listAdminInvoices(@Query() query: AdminInvoiceQueryDto) {

    return this.adminService.listInvoices(query);

  }



  @Get('admin/billing/audit-log')

  @Roles('MASTER_ADMIN')

  async listAuditLog(@Query() query: AuditLogQueryDto) {

    return this.adminService.listAuditLog(query);

  }



  @Get('admin/billing/subscriptions')

  @Roles('MASTER_ADMIN')

  async findAllSubscriptions(@Query() query: PaginationParams) {

    return this.billingService.findAllSubscriptions(query);

  }



  @Get('admin/billing/revenue-stats')

  @Roles('MASTER_ADMIN')

  async getRevenueStats() {

    return this.billingService.getRevenueStats();

  }



  @Get('admin/billing/pricebooks')

  @Roles('MASTER_ADMIN')

  async listPriceBooks() {

    return this.pricebookService.listPriceBooks();

  }



  @Get('admin/billing/pricebooks/config')

  @Roles('MASTER_ADMIN')

  async getPricingConfiguration() {

    return this.pricebookService.getPricingConfiguration();

  }



  @Get('admin/billing/pricebooks/:id')

  @Roles('MASTER_ADMIN')

  async getPriceBook(@Param('id') id: string) {

    return this.pricebookService.getPriceBook(id);

  }



  @Get('admin/billing/pricebooks/:id/versions')

  @Roles('MASTER_ADMIN')

  async listPriceBookVersions(@Param('id') id: string) {

    return this.pricebookService.listVersions(id);

  }



  @Post('admin/billing/pricebooks')

  @Roles('MASTER_ADMIN')

  async createPriceBook(@Body() body: CreatePriceBookDto, @Req() req: any) {

    return this.pricebookService.createPriceBook(body, req?.user?.id);

  }



  @Post('admin/billing/pricebooks/:priceBookId/versions')

  @Roles('MASTER_ADMIN')

  async createDraftVersion(

    @Param('priceBookId') priceBookId: string,

    @Body() body: CreatePriceVersionDto,

    @Req() req: any,

  ) {

    return this.pricebookService.createDraftVersion(priceBookId, {

      versionLabel: body.versionLabel,

      actorUserId: req?.user?.id,

    });

  }



  @Patch('admin/billing/price-versions/:versionId')

  @Roles('MASTER_ADMIN')

  async patchPriceVersion(

    @Param('versionId') versionId: string,

    @Body() body: PatchPriceVersionDto,

    @Req() req: any,

  ) {

    return this.pricebookService.patchDraftVersion(

      versionId,

      {

        versionLabel: body.versionLabel,

        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,

      },

      req?.user?.id,

    );

  }



  @Put('admin/billing/price-versions/:versionId/tiers')

  @Roles('MASTER_ADMIN')

  async replaceDraftTiers(

    @Param('versionId') versionId: string,

    @Body() body: ReplaceTiersDto,

    @Req() req: any,

  ) {

    return this.pricebookService.replaceDraftTiers(versionId, body.tiers, req?.user?.id);

  }



  @Post('admin/billing/price-versions/:versionId/publish')

  @Roles('MASTER_ADMIN')

  async publishPriceVersion(

    @Param('versionId') versionId: string,

    @Body() body: PublishPriceVersionDto,

    @Req() req: any,

  ) {

    return this.pricebookService.publishVersion(

      versionId,

      req?.user?.id,

      body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,

      body.allowUnpriced ?? false,

    );

  }



  @Post('admin/billing/price-versions/:versionId/archive')

  @Roles('MASTER_ADMIN')

  async archivePriceVersion(

    @Param('versionId') versionId: string,

    @Req() req: any,

  ) {

    return this.pricebookService.archiveVersion(versionId, req?.user?.id);

  }



  @Get('admin/billing/payment-methods')

  @Roles('MASTER_ADMIN')

  async listAdminPaymentMethods() {

    return this.adminService.listPaymentMethodsAdmin();

  }



  @Get('admin/billing/stripe-status')

  @Roles('MASTER_ADMIN')

  async getStripeStatus() {

    return this.adminService.getStripeStatus();

  }



  @Get('admin/billing/webhook-events')

  @Roles('MASTER_ADMIN')

  async listWebhookEvents(@Query() query: AuditLogQueryDto) {

    return this.adminService.listWebhookEvents(query);

  }

}


