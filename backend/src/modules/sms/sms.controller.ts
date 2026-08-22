import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { SmsConfigService } from './sms-config.service';

@Controller('organizations/:orgId/sms')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class SmsController {
  constructor(private readonly smsConfigService: SmsConfigService) {}

  @Get('config')
  @RequireCommunicationPermission('read')
  async getConfig(@Param('orgId') orgId: string) {
    return this.smsConfigService.getPublicConfig(orgId);
  }
}
