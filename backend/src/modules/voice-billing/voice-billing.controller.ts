import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { VoiceBillingService } from './voice-billing.service';

@Controller('organizations/:orgId/voice-assistant/billing')
@UseGuards(OrgScopingGuard, RolesGuard)
export class VoiceBillingController {
  constructor(private readonly billing: VoiceBillingService) {}

  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  getSubscription(@Param('orgId') orgId: string) {
    return this.billing.getSubscription(orgId);
  }

  @Put('subscription')
  @Roles('ORG_ADMIN', 'SUB_ADMIN')
  ensureSubscription(@Param('orgId') orgId: string, @Body() body: { planCode: string }) {
    return this.billing.ensureSubscriptionPlan(orgId, body.planCode);
  }

  @Get('usage')
  getUsage(@Param('orgId') orgId: string) {
    return this.billing.getOrganizationUsage(orgId);
  }

  @Get('remaining-minutes')
  getRemainingMinutes(@Param('orgId') orgId: string) {
    return this.billing.getRemainingMinutes(orgId);
  }

  @Get('forecast')
  getForecast(@Param('orgId') orgId: string) {
    return this.billing.getForecast(orgId);
  }
}
