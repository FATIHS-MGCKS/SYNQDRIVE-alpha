import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VoiceBillingService } from './voice-billing.service';

@Controller('organizations/:orgId/voice-assistant/billing')
@UseGuards(OrgScopingGuard, RolesGuard)
export class VoiceBillingController {
  constructor(private readonly billing: VoiceBillingService) {}

  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
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
