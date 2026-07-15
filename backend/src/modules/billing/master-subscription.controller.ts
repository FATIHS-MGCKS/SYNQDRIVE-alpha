import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireMasterBilling } from '@shared/decorators/require-master-billing.decorator';
import { BillingSubscriptionAdminService } from './billing-subscription-admin.service';
import { TenantSubscriptionOverviewService } from './tenant-subscription-overview.service';
import {
  MasterSubscriptionActivateDto,
  MasterSubscriptionAddDiscountDto,
  MasterSubscriptionAssignPlanDto,
  MasterSubscriptionBillingAnchorDto,
  MasterSubscriptionCancelDto,
  MasterSubscriptionDraftDto,
  MasterSubscriptionEffectiveAtDto,
  MasterSubscriptionEndDiscountDto,
  MasterSubscriptionLockVersionDto,
  MasterSubscriptionPreviewDto,
  MasterSubscriptionPriceVersionDto,
  MasterSubscriptionTrialDto,
  MasterSubscriptionUpdateDiscountDto,
} from './dto/master-subscription.dto';

@Controller('admin/billing/organizations/:orgId/subscription')
@UseGuards(RolesGuard, PermissionsGuard, MasterBillingGuard)
@RequireMasterBilling()
export class MasterSubscriptionController {
  constructor(
    private readonly subscriptionAdmin: BillingSubscriptionAdminService,
    private readonly subscriptionOverview: TenantSubscriptionOverviewService,
  ) {}

  @Get()
  async getContract(@Param('orgId') orgId: string) {
    return this.subscriptionAdmin.getContract(orgId);
  }

  @Get('overview')
  async getSubscriptionOverview(@Param('orgId') orgId: string) {
    return this.subscriptionOverview.getOverview(orgId);
  }

  @Get('history')
  async getHistory(@Param('orgId') orgId: string) {
    return this.subscriptionAdmin.getChangeHistory(orgId);
  }

  @Post('preview')
  async preview(@Param('orgId') orgId: string, @Body() body: MasterSubscriptionPreviewDto) {
    return this.subscriptionAdmin.previewChanges(orgId, {
      productKey: body.productKey,
      priceVersionId: body.priceVersionId,
      effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : undefined,
      anchorDay: body.anchorDay,
    });
  }

  @Post('draft')
  async createDraft(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionDraftDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.createDraft(orgId, this.actor(req, idempotencyKey, body.lockVersion), body.currency);
  }

  @Post('assign-rental')
  async assignRental(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionAssignPlanDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.assignRental(
      orgId,
      this.actor(req, idempotencyKey, body.lockVersion),
      body.priceBookId,
    );
  }

  @Post('assign-fleet')
  async assignFleet(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionAssignPlanDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.assignFleet(
      orgId,
      this.actor(req, idempotencyKey, body.lockVersion),
      body.priceBookId,
    );
  }

  @Patch('price-version')
  async selectPriceVersion(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionPriceVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.selectPriceVersion(
      orgId,
      this.actor(req, idempotencyKey, body.lockVersion),
      body.priceVersionId,
      body.priceBookId,
    );
  }

  @Post('trial')
  async configureTrial(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionTrialDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.configureTrial(orgId, this.actor(req, idempotencyKey, body.lockVersion), {
      priceVersionId: body.priceVersionId,
      trialEndAt: new Date(body.trialEndAt),
      priceBookId: body.priceBookId,
    });
  }

  @Patch('billing-anchor')
  async configureBillingAnchor(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionBillingAnchorDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.configureBillingAnchor(
      orgId,
      this.actor(req, idempotencyKey, body.lockVersion),
      body.anchorDay,
    );
  }

  @Post('activate')
  async activate(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionActivateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.activate(orgId, this.actor(req, idempotencyKey, body.lockVersion), {
      priceVersionId: body.priceVersionId,
      priceBookId: body.priceBookId,
    });
  }

  @Post('pause')
  async pause(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionLockVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.pause(orgId, this.actor(req, idempotencyKey, body.lockVersion));
  }

  @Post('reactivate')
  async reactivate(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionLockVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.reactivate(orgId, this.actor(req, idempotencyKey, body.lockVersion));
  }

  @Post('schedule-cancel')
  async scheduleCancel(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionCancelDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.scheduleCancel(
      orgId,
      this.actor(req, idempotencyKey, body.lockVersion),
      body.cancelAt ? new Date(body.cancelAt) : undefined,
    );
  }

  @Post('revoke-cancel')
  async revokeCancel(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionLockVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.revokeCancel(orgId, this.actor(req, idempotencyKey, body.lockVersion));
  }

  @Post('schedule-tariff-change')
  async scheduleTariffChange(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionEffectiveAtDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.scheduleTariffChange(
      orgId,
      this.actor(req, idempotencyKey, body.lockVersion),
      {
        productKey: body.productKey!,
        effectiveAt: new Date(body.effectiveAt),
      },
    );
  }

  @Post('schedule-price-version-change')
  async schedulePriceVersionChange(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionEffectiveAtDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.schedulePriceVersionChange(
      orgId,
      this.actor(req, idempotencyKey, body.lockVersion),
      {
        priceVersionId: body.priceVersionId!,
        effectiveAt: new Date(body.effectiveAt),
      },
    );
  }

  @Post('discounts')
  async addDiscount(
    @Param('orgId') orgId: string,
    @Body() body: MasterSubscriptionAddDiscountDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.addDiscount(orgId, this.actor(req, idempotencyKey, body.lockVersion), {
      discountType: body.discountType,
      percentBps: body.percentBps,
      fixedAmountCents: body.fixedAmountCents,
      currency: body.currency,
      validFrom: new Date(body.validFrom),
      validTo: body.validTo ? new Date(body.validTo) : undefined,
      reason: body.reason,
      subscriptionItemId: body.subscriptionItemId,
    });
  }

  @Patch('discounts/:discountId')
  async updateDiscount(
    @Param('orgId') orgId: string,
    @Param('discountId') discountId: string,
    @Body() body: MasterSubscriptionUpdateDiscountDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.updateDiscount(
      orgId,
      discountId,
      this.actor(req, idempotencyKey, body.lockVersion),
      {
        percentBps: body.percentBps,
        fixedAmountCents: body.fixedAmountCents,
        validTo: body.validTo ? new Date(body.validTo) : undefined,
        reason: body.reason,
      },
    );
  }

  @Post('discounts/:discountId/end')
  async endDiscount(
    @Param('orgId') orgId: string,
    @Param('discountId') discountId: string,
    @Body() body: MasterSubscriptionEndDiscountDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.subscriptionAdmin.endDiscount(
      orgId,
      discountId,
      this.actor(req, idempotencyKey, body.lockVersion),
      {
        validTo: body.validTo ? new Date(body.validTo) : undefined,
        reason: body.reason,
      },
    );
  }

  private actor(
    req: { user?: { id?: string } },
    idempotencyKey?: string,
    lockVersion?: number,
  ) {
    return {
      actorUserId: req.user?.id ?? null,
      idempotencyKey,
      lockVersion,
    };
  }
}
