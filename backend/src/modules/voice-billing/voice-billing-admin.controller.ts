import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { VoiceBillingService } from './voice-billing.service';

@Controller('admin/voice-assistant/billing')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class VoiceBillingAdminController {
  constructor(private readonly billing: VoiceBillingService) {}

  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('organizations/:orgId')
  getOrgBilling(@Param('orgId') orgId: string) {
    return this.billing.getMasterAdminOrgBilling(orgId);
  }
}
