import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireVoiceEntitlement } from '@modules/voice-entitlement/require-voice-entitlement.decorator';
import { VoiceEntitlementGuard } from '@modules/voice-entitlement/voice-entitlement.guard';
import { VoiceBillingService } from './voice-billing.service';

@Controller('organizations/:orgId/voice-assistant/billing')
@UseGuards(OrgScopingGuard, RolesGuard, VoiceEntitlementGuard)
export class VoiceBillingController {
  constructor(private readonly billing: VoiceBillingService) {}

  @Get('plans')
  @RequireVoiceEntitlement('billing.plans.read')
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  @RequireVoiceEntitlement('billing.subscription.read')
  getSubscription(@Param('orgId') orgId: string) {
    return this.billing.getSubscription(orgId);
  }

  @Put('subscription')
  @Roles('ORG_ADMIN', 'SUB_ADMIN')
  @RequireVoiceEntitlement('billing.subscription.onboard')
  ensureSubscription(@Param('orgId') orgId: string, @Body() body: { planCode: string }) {
    return this.billing.ensureSubscriptionPlan(orgId, body.planCode);
  }

  @Get('usage')
  @RequireVoiceEntitlement('billing.usage.read')
  getUsage(@Param('orgId') orgId: string) {
    return this.billing.getOrganizationUsage(orgId);
  }

  @Get('remaining-minutes')
  @RequireVoiceEntitlement('billing.usage.read')
  getRemainingMinutes(@Param('orgId') orgId: string) {
    return this.billing.getRemainingMinutes(orgId);
  }

  @Get('forecast')
  @RequireVoiceEntitlement('billing.usage.read')
  getForecast(@Param('orgId') orgId: string) {
    return this.billing.getForecast(orgId);
  }
}
