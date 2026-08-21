import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireVoiceAssistantPermission } from '@shared/decorators/require-voice-assistant-permission.decorator';
import { VoiceBillingService } from './voice-billing.service';

@Controller('organizations/:orgId/voice-assistant/billing')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class VoiceBillingController {
  constructor(private readonly billing: VoiceBillingService) {}

  @Get('plans')
  @RequireVoiceAssistantPermission('read')
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  @RequireVoiceAssistantPermission('read')
  getSubscription(@Param('orgId') orgId: string) {
    return this.billing.getSubscription(orgId);
  }

  @Put('subscription')
  @RequireVoiceAssistantPermission('manage')
  ensureSubscription(@Param('orgId') orgId: string, @Body() body: { planCode: string }) {
    return this.billing.ensureSubscriptionPlan(orgId, body.planCode);
  }

  @Get('usage')
  @RequireVoiceAssistantPermission('read')
  getUsage(@Param('orgId') orgId: string) {
    return this.billing.getOrganizationUsage(orgId);
  }

  @Get('remaining-minutes')
  @RequireVoiceAssistantPermission('read')
  getRemainingMinutes(@Param('orgId') orgId: string) {
    return this.billing.getRemainingMinutes(orgId);
  }

  @Get('forecast')
  @RequireVoiceAssistantPermission('read')
  getForecast(@Param('orgId') orgId: string) {
    return this.billing.getForecast(orgId);
  }
}
